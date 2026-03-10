import express from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../db";
import {
  academicYears,
  classes,
  classSubjects,
  continuousAssessments,
  fees,
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

type EnrollmentMode = "admission" | "promotion";

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
    db.select({ id: students.id }).from(students).where(eq(students.id, studentId)),
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

  if (mode === "promotion" && !existingEnrollments.length) {
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

  const feeAssignments = applicableFees
    .filter((fee) => !existingStudentFeeIds.has(fee.id))
    .map((fee) => ({
      studentId,
      feeId: fee.id,
      academicYearId,
      termId,
      amount: fee.amount,
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
    const classNameFilter =
      typeof req.query.className === "string" ? req.query.className.trim() : "";
    const studentNameFilter =
      typeof req.query.studentName === "string" ? req.query.studentName.trim() : "";
    const classIdFilter = parsePositiveInt(req.query.classId);
    const academicYearIdFilter = parsePositiveInt(req.query.academicYearId);
    const termIdFilter = parsePositiveInt(req.query.termId);

    const conditions = [];

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
      })
      .from(studentClassEnrollments)
      .innerJoin(students, eq(studentClassEnrollments.studentId, students.id))
      .innerJoin(classes, eq(studentClassEnrollments.classId, classes.id))
      .innerJoin(academicYears, eq(studentClassEnrollments.academicYearId, academicYears.id))
      .innerJoin(terms, eq(studentClassEnrollments.termId, terms.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(academicYears.year), classes.name, terms.sequenceNumber, students.firstName);

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
            classTest: continuousAssessments.classMark,
            totalMark: continuousAssessments.totalMark,
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
          assessments: assessmentRows,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total: data.length,
      },
    });
  } catch (error) {
    console.error("GET /student-class-enrollments/overview error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch class enrollment overview" });
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

export default router;
