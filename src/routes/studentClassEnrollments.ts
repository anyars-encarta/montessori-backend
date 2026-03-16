import express from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  academicYears,
  classes,
  classSubjects,
  continuousAssessments,
  fees,
  schoolDetails,
  studentClassEnrollments,
  studentFees,
  subjects,
  students,
  terms,
} from "../db/schema";

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const parseDateInput = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const applyDiscountToAmount = (
  amount: string,
  discountType: "value" | "percentage",
  discountAmount: string,
) => {
  const baseAmount = Number.parseFloat(amount);
  const parsedDiscountAmount = Number.parseFloat(discountAmount);

  if (!Number.isFinite(baseAmount) || !Number.isFinite(parsedDiscountAmount)) {
    return amount;
  }

  const normalizedDiscountAmount = Math.max(0, parsedDiscountAmount);

  const discountedAmount =
    discountType === "percentage"
      ? baseAmount - (baseAmount * normalizedDiscountAmount) / 100
      : baseAmount - normalizedDiscountAmount;

  return Math.max(0, discountedAmount).toFixed(2);
};

const parseClassLevelNumber = (level: string) => {
  const match = level.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toScore = (value: string | number | null | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLowerClassGrade = (score: number) => {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  if (score >= 40) return "E";
  return "F";
};

const getLowerClassRemark = (score: number) => {
  if (score >= 90) return "HIGHEST";
  if (score >= 85) return "HIGHER";
  if (score >= 80) return "HIGH";
  if (score >= 75) return "HIGH AVERAGE";
  if (score >= 70) return "AVERAGE";
  if (score >= 65) return "LOW AVERAGE";
  if (score >= 60) return "LOW";
  if (score >= 50) return "LOWER";
  if (score >= 40) return "LOWEST";
  return "LOWEST";
};

const getUpperClassRemark = (score: number) => {
  if (score >= 90) return "EXCELLENT";
  if (score >= 80) return "VERY GOOD";
  if (score >= 70) return "HIGH";
  if (score >= 60) return "HIGH AVERAGE";
  if (score >= 55) return "AVERAGE";
  if (score >= 50) return "LOW AVERAGE";
  if (score >= 40) return "LOW";
  if (score >= 35) return "CREDIT";
  return "FAIL";
};

const toOrdinal = (value: number) => {
  const abs = Math.abs(value);
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }

  switch (abs % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

const getDenseRanks = (
  rows: Array<{ id: number; score: number }>,
  direction: "desc" | "asc" = "desc",
) => {
  const sortedRows = [...rows].sort((a, b) =>
    direction === "desc" ? b.score - a.score : a.score - b.score,
  );
  const rankById = new Map<number, number>();

  let currentRank = 0;
  let previousScore: number | null = null;

  for (const row of sortedRows) {
    const normalizedScore = Number(row.score.toFixed(2));
    const shouldAdvanceRank =
      previousScore === null ||
      (direction === "desc"
        ? normalizedScore < previousScore
        : normalizedScore > previousScore);

    if (shouldAdvanceRank) {
      currentRank += 1;
      previousScore = normalizedScore;
    }

    rankById.set(row.id, currentRank);
  }

  return rankById;
};

const runEnrollmentWorkflow = async (
  mode: EnrollmentMode,
  payload: {
    studentId: number;
    classId: number;
    academicYearId: number;
    termId: number;
    enrollmentDate: string;
  },
) => {
  const { studentId, classId, academicYearId, termId, enrollmentDate } = payload;

  const [studentRows, classRows, termRows] = await Promise.all([
    db
      .select({
        id: students.id,
        onScholarship: students.onScholarship,
        getDiscount: students.getDiscount,
      })
      .from(students)
      .where(eq(students.id, studentId)),
    db
      .select({ id: classes.id, level: classes.level })
      .from(classes)
      .where(eq(classes.id, classId)),
    db
      .select({ id: terms.id, academicYearId: terms.academicYearId, endDate: terms.endDate })
      .from(terms)
      .where(eq(terms.id, termId)),
  ]);

  if (!studentRows.length) {
    return { status: 404, error: "Student not found" as const };
  }

  if (!classRows.length) {
    return { status: 404, error: "Class not found" as const };
  }

  if (!termRows.length) {
    return { status: 404, error: "Term not found" as const };
  }

  const selectedClass = classRows[0]!;
  const selectedTerm = termRows[0]!;
  const selectedStudent = studentRows[0]!;

  if (selectedTerm.academicYearId !== academicYearId) {
    return {
      status: 400,
      error: "Selected term does not belong to the selected academic year" as const,
    };
  }

  const existingEnrollments = await db
    .select({
      id: studentClassEnrollments.id,
      academicYearId: studentClassEnrollments.academicYearId,
      createdAt: studentClassEnrollments.createdAt,
    })
    .from(studentClassEnrollments)
    .where(eq(studentClassEnrollments.studentId, studentId))
    .orderBy(desc(studentClassEnrollments.createdAt));

  if (mode === "admission" && existingEnrollments.length) {
    return {
      status: 409,
      error: "Student already has enrollment records and cannot be admitted as new" as const,
    };
  }

  if (mode !== "admission" && !existingEnrollments.length) {
    return {
      status: 409,
      error: "Student has no previous enrollment records. Use admission instead" as const,
    };
  }

  const existingSameYear = existingEnrollments.find(
    (enrollment) => enrollment.academicYearId === academicYearId,
  );

  if (existingSameYear) {
    return {
      status: 409,
      error: "Student already has an enrollment for the selected academic year" as const,
    };
  }

  const [createdEnrollment] = await db
    .insert(studentClassEnrollments)
    .values({
      studentId,
      classId,
      academicYearId,
      termId,
      enrollmentDate,
    })
    .returning();

  if (!createdEnrollment) {
    return { status: 400, error: "Failed to create enrollment" as const };
  }

  if (mode === "promotion" && existingEnrollments[0]?.id) {
    await db
      .update(studentClassEnrollments)
      .set({
        promotionDate: enrollmentDate,
      })
      .where(eq(studentClassEnrollments.id, existingEnrollments[0].id));
  }

  const feeRows = await db
    .select({
      id: fees.id,
      name: fees.name,
      amount: fees.amount,
      feeType: fees.feeType,
      applicableToLevel: fees.applicableToLevel,
    })
    .from(fees);

  const applicableFees = feeRows.filter((fee) => {
    const isLevelFee = fee.applicableToLevel === selectedClass.level;
    const isAdmissionFee = fee.feeType === "admission";

    if (mode === "admission") {
      return isAdmissionFee || isLevelFee;
    }

    return !isAdmissionFee && isLevelFee;
  });

  const existingStudentFeeRows = await db
    .select({ feeId: studentFees.feeId })
    .from(studentFees)
    .where(
      and(
        eq(studentFees.studentId, studentId),
        eq(studentFees.academicYearId, academicYearId),
        eq(studentFees.termId, termId),
      ),
    );

  const existingStudentFeeIds = new Set(existingStudentFeeRows.map((row) => row.feeId));

  const shouldSkipPromotionFees = mode !== "admission" && selectedStudent.onScholarship;
  const shouldApplyPromotionDiscount =
    mode !== "admission" && selectedStudent.getDiscount && !selectedStudent.onScholarship;

  let discountConfig:
    | {
        discountType: "value" | "percentage";
        discountAmount: string;
      }
    | null = null;

  if (shouldApplyPromotionDiscount) {
    const [schoolConfig] = await db
      .select({
        discountType: schoolDetails.discountType,
        discountAmount: schoolDetails.discountAmount,
      })
      .from(schoolDetails)
      .limit(1);

    if (schoolConfig) {
      discountConfig = {
        discountType: schoolConfig.discountType,
        discountAmount: schoolConfig.discountAmount,
      };
    }
  }

  const feeAssignments = applicableFees
    .filter((fee) => !existingStudentFeeIds.has(fee.id))
    .filter(() => !shouldSkipPromotionFees)
    .map((fee) => ({
      studentId,
      feeId: fee.id,
      academicYearId,
      termId,
      amount:
        discountConfig !== null
          ? applyDiscountToAmount(
              fee.amount,
              discountConfig.discountType,
              discountConfig.discountAmount,
            )
          : fee.amount,
      amountPaid: "0",
      status: "pending" as const,
      dueDate: selectedTerm.endDate,
    }));

  const feeNamesApplied = applicableFees
    .filter((fee) => !existingStudentFeeIds.has(fee.id))
    .map((fee) => fee.name);

  if (feeAssignments.length) {
    await db.insert(studentFees).values(feeAssignments);
  }

  const classSubjectRows = await db
    .select({ subjectId: classSubjects.subjectId })
    .from(classSubjects)
    .where(eq(classSubjects.classId, classId));

  const subjectIds = classSubjectRows.map((row) => row.subjectId);

  if (subjectIds.length) {
    const existingAssessments = await db
      .select({ subjectId: continuousAssessments.subjectId })
      .from(continuousAssessments)
      .where(
        and(
          eq(continuousAssessments.studentId, studentId),
          eq(continuousAssessments.academicYearId, academicYearId),
          eq(continuousAssessments.termId, termId),
          inArray(continuousAssessments.subjectId, subjectIds),
        ),
      );

    const existingAssessmentSubjectIds = new Set(
      existingAssessments.map((row) => row.subjectId),
    );

    const assessmentRows = subjectIds
      .filter((subjectId) => !existingAssessmentSubjectIds.has(subjectId))
      .map((subjectId) => ({
        studentId,
        subjectId,
        academicYearId,
        termId,
        homeWork1: "0",
        homeWork2: "0",
        exercise1: "0",
        exercise2: "0",
        classTest: "0",
        classMark: "0",
        examMark: "0",
        totalMark: "0",
      }));

    if (assessmentRows.length) {
      await db.insert(continuousAssessments).values(assessmentRows);
    }
  }

  return {
    status: 201,
    data: {
      enrollment: createdEnrollment,
      feesApplied: feeAssignments.length,
      feeNamesApplied,
      subjectsApplied: subjectIds.length,
      feesSkippedByScholarship: shouldSkipPromotionFees,
      discountAppliedOnPromotionFees: discountConfig !== null,
    },
  };
};

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(studentClassEnrollments);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student class enrollments",
    });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const currentPage = Math.max(1, parsePositiveInt(req.query.page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(req.query.limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const classNameFilter =
      typeof req.query.className === "string" ? req.query.className.trim() : "";
    const studentNameFilter =
      typeof req.query.studentName === "string" ? req.query.studentName.trim() : "";
    const enrollmentIdFilter = parsePositiveInt(req.query.enrollmentId);
    const classIdFilter = parsePositiveInt(req.query.classId);
    const academicYearIdFilter = parsePositiveInt(req.query.academicYearId);
    const termIdFilter = parsePositiveInt(req.query.termId);

    const conditions = [];

    if (enrollmentIdFilter) {
      conditions.push(eq(studentClassEnrollments.id, enrollmentIdFilter));
    }

    if (classIdFilter) {
      conditions.push(eq(studentClassEnrollments.classId, classIdFilter));
    }

    if (classNameFilter) {
      conditions.push(ilike(classes.name, `%${classNameFilter}%`));
    }

    if (studentNameFilter) {
      conditions.push(
        or(
          ilike(students.firstName, `%${studentNameFilter}%`),
          ilike(students.lastName, `%${studentNameFilter}%`),
        ),
      );
    }

    if (academicYearIdFilter) {
      conditions.push(eq(studentClassEnrollments.academicYearId, academicYearIdFilter));
    }

    if (termIdFilter) {
      conditions.push(eq(studentClassEnrollments.termId, termIdFilter));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(studentClassEnrollments)
      .innerJoin(students, eq(studentClassEnrollments.studentId, students.id))
      .innerJoin(classes, eq(studentClassEnrollments.classId, classes.id))
      .innerJoin(academicYears, eq(studentClassEnrollments.academicYearId, academicYears.id))
      .innerJoin(terms, eq(studentClassEnrollments.termId, terms.id))
      .where(whereClause);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total ? Math.ceil(total / limitPerPage) : 0;

    const enrollmentRows = await db
      .select({
        enrollmentId: studentClassEnrollments.id,
        studentId: students.id,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        registrationNumber: students.registrationNumber,
        classId: classes.id,
        className: classes.name,
        classLevel: classes.level,
        academicYearId: academicYears.id,
        academicYear: academicYears.year,
        termId: terms.id,
        termName: terms.name,
        termSequenceNumber: terms.sequenceNumber,
        enrollmentDate: studentClassEnrollments.enrollmentDate,
        classPosition: studentClassEnrollments.classPosition,
        aggregate: studentClassEnrollments.aggregate,
        remarks: studentClassEnrollments.remarks,
      })
      .from(studentClassEnrollments)
      .innerJoin(students, eq(studentClassEnrollments.studentId, students.id))
      .innerJoin(classes, eq(studentClassEnrollments.classId, classes.id))
      .innerJoin(academicYears, eq(studentClassEnrollments.academicYearId, academicYears.id))
      .innerJoin(terms, eq(studentClassEnrollments.termId, terms.id))
      .where(whereClause)
      .orderBy(desc(academicYears.year), classes.name, terms.sequenceNumber, students.firstName)
      .limit(limitPerPage)
      .offset(offset);

    const data = await Promise.all(
      enrollmentRows.map(async (row) => {
        const assessmentRows = await db
          .select({
            id: continuousAssessments.id,
            subjectId: continuousAssessments.subjectId,
            subjectName: subjects.name,
            homeWork1: continuousAssessments.homeWork1,
            homeWork2: continuousAssessments.homeWork2,
            exercise1: continuousAssessments.exercise1,
            exercise2: continuousAssessments.exercise2,
            classTest: continuousAssessments.classTest,
            classMark: continuousAssessments.classMark,
            examMark: continuousAssessments.examMark,
            totalMark: continuousAssessments.totalMark,
            subjectPosition: continuousAssessments.subjectPosition,
            remarks: continuousAssessments.remarks,
          })
          .from(continuousAssessments)
          .innerJoin(subjects, eq(continuousAssessments.subjectId, subjects.id))
          .where(
            and(
              eq(continuousAssessments.studentId, row.studentId),
              eq(continuousAssessments.academicYearId, row.academicYearId),
              eq(continuousAssessments.termId, row.termId),
            ),
          )
          .orderBy(subjects.name);

        return {
          id: row.enrollmentId,
          student: {
            id: row.studentId,
            fullName: `${row.studentFirstName} ${row.studentLastName}`.trim(),
            registrationNumber: row.registrationNumber,
          },
          class: {
            id: row.classId,
            name: row.className,
            level: row.classLevel,
          },
          academicYear: {
            id: row.academicYearId,
            year: row.academicYear,
          },
          term: {
            id: row.termId,
            name: row.termName,
            sequenceNumber: row.termSequenceNumber,
          },
          enrollmentDate: row.enrollmentDate,
          classPosition: row.classPosition,
          aggregate: row.aggregate,
          remarks: row.remarks,
          assessments: assessmentRows,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("GET /student-class-enrollments/overview error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch class enrollment overview" });
  }
});

router.post("/run-grades", async (req, res) => {
  try {
    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);

    if (!classId || !academicYearId || !termId) {
      return res.status(400).json({
        success: false,
        error: "classId, academicYearId and termId are required",
      });
    }

    const [classRow] = await db
      .select({ id: classes.id, level: classes.level })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!classRow) {
      return res.status(404).json({ success: false, error: "Class not found" });
    }

    const classLevelNumber = parseClassLevelNumber(classRow.level);
    if (!classLevelNumber) {
      return res.status(400).json({
        success: false,
        error: "Unable to parse class level number. Expected formats like P1, L6, P7.",
      });
    }

    const isUpperClass = classLevelNumber > 6;

    const enrollmentRows = await db
      .select({
        id: studentClassEnrollments.id,
        studentId: studentClassEnrollments.studentId,
      })
      .from(studentClassEnrollments)
      .where(
        and(
          eq(studentClassEnrollments.classId, classId),
          eq(studentClassEnrollments.academicYearId, academicYearId),
          eq(studentClassEnrollments.termId, termId),
        ),
      );

    if (!enrollmentRows.length) {
      return res.status(200).json({
        success: true,
        data: {
          gradedStudents: 0,
          gradedAssessments: 0,
          classLevel: classRow.level,
          mode: isUpperClass ? "upper" : "lower",
        },
      });
    }

    const studentIds = enrollmentRows.map((row) => row.studentId);

    const assessmentRows = await db
      .select({
        id: continuousAssessments.id,
        studentId: continuousAssessments.studentId,
        subjectId: continuousAssessments.subjectId,
        totalMark: continuousAssessments.totalMark,
      })
      .from(continuousAssessments)
      .where(
        and(
          eq(continuousAssessments.academicYearId, academicYearId),
          eq(continuousAssessments.termId, termId),
          inArray(continuousAssessments.studentId, studentIds),
        ),
      );

    const subjectPositionByAssessmentId = new Map<number, string>();
    const subjectRemarkByAssessmentId = new Map<number, string>();

    if (isUpperClass) {
      const assessmentsBySubject = new Map<number, Array<{ id: number; score: number }>>();

      for (const row of assessmentRows) {
        const score = toScore(row.totalMark);
        const existingRows = assessmentsBySubject.get(row.subjectId) ?? [];
        existingRows.push({ id: row.id, score });
        assessmentsBySubject.set(row.subjectId, existingRows);
      }

      for (const rows of assessmentsBySubject.values()) {
        const ranks = getDenseRanks(rows);
        for (const row of rows) {
          const rank = ranks.get(row.id) ?? 0;
          subjectPositionByAssessmentId.set(row.id, toOrdinal(rank));
          subjectRemarkByAssessmentId.set(row.id, getUpperClassRemark(row.score));
        }
      }
    } else {
      for (const row of assessmentRows) {
        const score = toScore(row.totalMark);
        subjectPositionByAssessmentId.set(row.id, getLowerClassGrade(score));
        subjectRemarkByAssessmentId.set(row.id, getLowerClassRemark(score));
      }
    }

    await Promise.all(
      assessmentRows.map((row) =>
        db
          .update(continuousAssessments)
          .set({
            subjectPosition: subjectPositionByAssessmentId.get(row.id) ?? null,
            remarks: subjectRemarkByAssessmentId.get(row.id) ?? null,
          })
          .where(eq(continuousAssessments.id, row.id)),
      ),
    );

    const statsByStudentId = new Map<
      number,
      {
        totalScore: number;
        subjectCount: number;
        upperRanks: number[];
      }
    >();

    for (const assessment of assessmentRows) {
      const current =
        statsByStudentId.get(assessment.studentId) ??
        ({ totalScore: 0, subjectCount: 0, upperRanks: [] } as const);

      const score = toScore(assessment.totalMark);
      const next = {
        totalScore: current.totalScore + score,
        subjectCount: current.subjectCount + 1,
        upperRanks: [...current.upperRanks],
      };

      if (isUpperClass) {
        const parsedRank = Number.parseInt(
          subjectPositionByAssessmentId.get(assessment.id) ?? "",
          10,
        );
        if (Number.isFinite(parsedRank) && parsedRank > 0) {
          next.upperRanks.push(parsedRank);
        }
      }

      statsByStudentId.set(assessment.studentId, next);
    }

    if (isUpperClass) {
      const upperResults = enrollmentRows.map((enrollment) => {
        const stats = statsByStudentId.get(enrollment.studentId);

        if (!stats || stats.subjectCount === 0) {
          return {
            enrollmentId: enrollment.id,
            hasStats: false,
            averageScore: 0,
            aggregate: 0,
          };
        }

        const averageScore = stats.totalScore / stats.subjectCount;
        const bestSixRanks = [...stats.upperRanks].sort((a, b) => a - b).slice(0, 6);
        const aggregate = bestSixRanks.reduce((sum, rank) => sum + rank, 0);

        return {
          enrollmentId: enrollment.id,
          hasStats: true,
          averageScore,
          aggregate,
        };
      });

      const aggregateRankMap = getDenseRanks(
        upperResults
          .filter((row) => row.hasStats)
          .map((row) => ({ id: row.enrollmentId, score: row.aggregate })),
        "asc",
      );

      await Promise.all(
        upperResults.map(async (row) => {
          if (!row.hasStats) {
            await db
              .update(studentClassEnrollments)
              .set({
                classPosition: null,
                remarks: null,
                aggregate: null,
              })
              .where(eq(studentClassEnrollments.id, row.enrollmentId));
            return;
          }

          const classRank = aggregateRankMap.get(row.enrollmentId) ?? 0;

          await db
            .update(studentClassEnrollments)
            .set({
              classPosition: classRank > 0 ? toOrdinal(classRank) : null,
              remarks: getUpperClassRemark(row.averageScore),
              aggregate: row.aggregate.toFixed(2),
            })
            .where(eq(studentClassEnrollments.id, row.enrollmentId));
        }),
      );
    } else {
      await Promise.all(
        enrollmentRows.map(async (enrollment) => {
          const stats = statsByStudentId.get(enrollment.studentId);
          if (!stats || stats.subjectCount === 0) {
            await db
              .update(studentClassEnrollments)
              .set({
                classPosition: null,
                remarks: null,
                aggregate: null,
              })
              .where(eq(studentClassEnrollments.id, enrollment.id));
            return;
          }

          const averageScore = stats.totalScore / stats.subjectCount;

          await db
            .update(studentClassEnrollments)
            .set({
              classPosition: getLowerClassGrade(averageScore),
              remarks: getLowerClassRemark(averageScore),
              aggregate: null,
            })
            .where(eq(studentClassEnrollments.id, enrollment.id));
        }),
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        gradedStudents: enrollmentRows.length,
        gradedAssessments: assessmentRows.length,
        classLevel: classRow.level,
        mode: isUpperClass ? "upper" : "lower",
      },
    });
  } catch (error) {
    console.error("POST /student-class-enrollments/run-grades error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(studentClassEnrollments)
      .where(eq(studentClassEnrollments.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Student class enrollment not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student class enrollment",
    });
  }
});

router.post("/admit", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.body?.studentId);
    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);
    const enrollmentDate = parseDateInput(req.body?.enrollmentDate);

    if (!studentId || !classId || !academicYearId || !termId || !enrollmentDate) {
      return res.status(400).json({
        success: false,
        error:
          "studentId, classId, academicYearId, termId and a valid enrollmentDate are required",
      });
    }

    const result = await runEnrollmentWorkflow("admission", {
      studentId,
      classId,
      academicYearId,
      termId,
      enrollmentDate,
    });

    if ("error" in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.status(result.status).json({ success: true, data: result.data });
  } catch (error) {
    console.error("POST /student-class-enrollments/admit error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/promote", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.body?.studentId);
    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);
    const enrollmentDate = parseDateInput(req.body?.enrollmentDate);

    if (!studentId || !classId || !academicYearId || !termId || !enrollmentDate) {
      return res.status(400).json({
        success: false,
        error:
          "studentId, classId, academicYearId, termId and a valid enrollmentDate are required",
      });
    }

    const result = await runEnrollmentWorkflow("promotion", {
      studentId,
      classId,
      academicYearId,
      termId,
      enrollmentDate,
    });

    if ("error" in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.status(result.status).json({ success: true, data: result.data });
  } catch (error) {
    console.error("POST /student-class-enrollments/promote error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/repeat", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.body?.studentId);
    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);
    const enrollmentDate = parseDateInput(req.body?.enrollmentDate);

    if (!studentId || !classId || !academicYearId || !termId || !enrollmentDate) {
      return res.status(400).json({
        success: false,
        error:
          "studentId, classId, academicYearId, termId and a valid enrollmentDate are required",
      });
    }

    const result = await runEnrollmentWorkflow("repeat", {
      studentId,
      classId,
      academicYearId,
      termId,
      enrollmentDate,
    });

    if ("error" in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.status(result.status).json({ success: true, data: result.data });
  } catch (error) {
    console.error("POST /student-class-enrollments/repeat error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/bulk-transition", async (req, res) => {
  try {
    const rawEnrollmentIds = Array.isArray(req.body?.enrollmentIds)
      ? (req.body.enrollmentIds as unknown[])
      : [];
    const enrollmentIds = rawEnrollmentIds.reduce<number[]>((acc, value) => {
      const parsedValue = parsePositiveInt(value);
      if (parsedValue !== null) {
        acc.push(parsedValue);
      }
      return acc;
    }, []);

    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);
    const enrollmentDate = parseDateInput(req.body?.enrollmentDate);
    const action = req.body?.action === "repeat" ? "repeat" : req.body?.action === "promote" ? "promote" : null;

    if (!enrollmentIds.length || !classId || !academicYearId || !termId || !enrollmentDate || !action) {
      return res.status(400).json({
        success: false,
        error:
          "enrollmentIds, action (promote|repeat), classId, academicYearId, termId and a valid enrollmentDate are required",
      });
    }

    const uniqueEnrollmentIds = Array.from(new Set(enrollmentIds));

    const enrollmentRows = await db
      .select({
        id: studentClassEnrollments.id,
        studentId: studentClassEnrollments.studentId,
      })
      .from(studentClassEnrollments)
      .where(inArray(studentClassEnrollments.id, uniqueEnrollmentIds));

    if (!enrollmentRows.length) {
      return res.status(404).json({
        success: false,
        error: "No matching enrollments were found for the selected IDs",
      });
    }

    const workflowMode: EnrollmentMode = action === "promote" ? "promotion" : "repeat";
    const successResults: Array<{ enrollmentId: number; studentId: number }> = [];
    const failures: Array<{ enrollmentId: number; studentId: number; error: string }> = [];

    for (const row of enrollmentRows) {
      const result = await runEnrollmentWorkflow(workflowMode, {
        studentId: row.studentId,
        classId,
        academicYearId,
        termId,
        enrollmentDate,
      });

      if ("error" in result) {
        failures.push({
          enrollmentId: row.id,
          studentId: row.studentId,
          error: result.error,
        });
        continue;
      }

      successResults.push({
        enrollmentId: row.id,
        studentId: row.studentId,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        action,
        requestedCount: uniqueEnrollmentIds.length,
        processedCount: enrollmentRows.length,
        successCount: successResults.length,
        failedCount: failures.length,
        successfulEnrollmentIds: successResults.map((result) => result.enrollmentId),
        failures,
      },
    });
  } catch (error) {
    console.error("POST /student-class-enrollments/bulk-transition error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
