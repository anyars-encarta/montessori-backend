import express from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  academicYears,
  classes,
  continuousAssessments,
  fees,
  healthDetails,
  otherSignificantData,
  parents,
  payments,
  positions,
  previousSchools,
  staff,
  studentAttendances,
  studentClassEnrollments,
  studentFees,
  studentParents,
  studentSiblings,
  students,
  subjects,
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

router.get("/", async (req, res) => {
  try {
    const {
      search,
      classId,
      academicYearId,
      parentId,
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const filters: Array<ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof inArray> | ReturnType<typeof or>> = [];

    if (search) {
      const value = String(search).trim();
      if (value) {
        filters.push(
          or(
            ilike(students.firstName, `%${value}%`),
            ilike(students.lastName, `%${value}%`),
            ilike(students.registrationNumber, `%${value}%`),
          )!,
        );
      }
    }

    const parsedClassId = classId !== undefined ? parsePositiveInt(classId) : null;
    if (classId !== undefined && parsedClassId === null) {
      return res.status(400).json({ success: false, error: "Invalid classId filter" });
    }

    const parsedAcademicYearId =
      academicYearId !== undefined ? parsePositiveInt(academicYearId) : null;
    if (academicYearId !== undefined && parsedAcademicYearId === null) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid academicYearId filter" });
    }

    const parsedParentId = parentId !== undefined ? parsePositiveInt(parentId) : null;
    if (parentId !== undefined && parsedParentId === null) {
      return res.status(400).json({ success: false, error: "Invalid parentId filter" });
    }

    if (parsedClassId || parsedAcademicYearId) {
      const enrollmentConditions = [];
      if (parsedClassId) enrollmentConditions.push(eq(studentClassEnrollments.classId, parsedClassId));
      if (parsedAcademicYearId) {
        enrollmentConditions.push(eq(studentClassEnrollments.academicYearId, parsedAcademicYearId));
      }

      const enrollmentRows = await db
        .select({ studentId: studentClassEnrollments.studentId })
        .from(studentClassEnrollments)
        .where(enrollmentConditions.length ? and(...enrollmentConditions) : undefined);

      const enrollmentStudentIds = [...new Set(enrollmentRows.map((row) => row.studentId))];
      if (!enrollmentStudentIds.length) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page: currentPage,
            limit: limitPerPage,
            total: 0,
            totalPages: 0,
          },
        });
      }
      filters.push(inArray(students.id, enrollmentStudentIds));
    }

    if (parsedParentId) {
      const parentRows = await db
        .select({ studentId: studentParents.studentId })
        .from(studentParents)
        .where(eq(studentParents.parentId, parsedParentId));

      const parentStudentIds = [...new Set(parentRows.map((row) => row.studentId))];
      if (!parentStudentIds.length) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page: currentPage,
            limit: limitPerPage,
            total: 0,
            totalPages: 0,
          },
        });
      }
      filters.push(inArray(students.id, parentStudentIds));
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(students)
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const studentRows = await db
      .select()
      .from(students)
      .where(whereClause)
      .orderBy(desc(students.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    if (!studentRows.length) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          page: currentPage,
          limit: limitPerPage,
          total: totalCount,
          totalPages,
        },
      });
    }

    const studentIds = studentRows.map((student) => student.id);

    const [
      parentRelations,
      siblingRelations,
      siblingStudents,
      healthRows,
      otherSignificantRows,
      previousSchoolRows,
      enrollmentRows,
      assessmentRows,
      positionRows,
      feeRows,
      paymentRows,
      attendanceRows,
    ] = await Promise.all([
      db
        .select({
          studentId: studentParents.studentId,
          parentId: studentParents.parentId,
          relationship: studentParents.relationship,
          parent: parents,
        })
        .from(studentParents)
        .innerJoin(parents, eq(studentParents.parentId, parents.id))
        .where(inArray(studentParents.studentId, studentIds)),
      db
        .select({
          studentId: studentSiblings.studentId,
          siblingId: studentSiblings.siblingId,
        })
        .from(studentSiblings)
        .where(inArray(studentSiblings.studentId, studentIds)),
      db.select().from(students),
      db
        .select()
        .from(healthDetails)
        .where(inArray(healthDetails.studentId, studentIds)),
      db
        .select()
        .from(otherSignificantData)
        .where(inArray(otherSignificantData.studentId, studentIds)),
      db
        .select()
        .from(previousSchools)
        .where(inArray(previousSchools.studentId, studentIds)),
      db
        .select({
          enrollment: studentClassEnrollments,
          class: classes,
          supervisor: staff,
          academicYear: academicYears,
        })
        .from(studentClassEnrollments)
        .leftJoin(classes, eq(studentClassEnrollments.classId, classes.id))
        .leftJoin(staff, eq(classes.supervisorId, staff.id))
        .leftJoin(
          academicYears,
          eq(studentClassEnrollments.academicYearId, academicYears.id),
        )
        .where(inArray(studentClassEnrollments.studentId, studentIds)),
      db
        .select({
          assessment: continuousAssessments,
          subject: subjects,
          academicYear: academicYears,
          term: terms,
        })
        .from(continuousAssessments)
        .leftJoin(subjects, eq(continuousAssessments.subjectId, subjects.id))
        .leftJoin(
          academicYears,
          eq(continuousAssessments.academicYearId, academicYears.id),
        )
        .leftJoin(terms, eq(continuousAssessments.termId, terms.id))
        .where(inArray(continuousAssessments.studentId, studentIds)),
      db
        .select({
          position: positions,
          class: classes,
          academicYear: academicYears,
          term: terms,
        })
        .from(positions)
        .leftJoin(classes, eq(positions.classId, classes.id))
        .leftJoin(academicYears, eq(positions.academicYearId, academicYears.id))
        .leftJoin(terms, eq(positions.termId, terms.id))
        .where(inArray(positions.studentId, studentIds)),
      db
        .select({
          studentFee: studentFees,
          fee: fees,
          academicYear: academicYears,
          term: terms,
        })
        .from(studentFees)
        .leftJoin(fees, eq(studentFees.feeId, fees.id))
        .leftJoin(academicYears, eq(studentFees.academicYearId, academicYears.id))
        .leftJoin(terms, eq(studentFees.termId, terms.id))
        .where(inArray(studentFees.studentId, studentIds)),
      db
        .select({
          payment: payments,
          studentFee: studentFees,
        })
        .from(payments)
        .leftJoin(studentFees, eq(payments.studentFeeId, studentFees.id))
        .where(inArray(payments.studentId, studentIds)),
      db
        .select()
        .from(studentAttendances)
        .where(inArray(studentAttendances.studentId, studentIds)),
    ]);

    const studentById = new Map(siblingStudents.map((row) => [row.id, row]));

    const parentRelationsByStudent = new Map<number, typeof parentRelations>();
    for (const relation of parentRelations) {
      const existing = parentRelationsByStudent.get(relation.studentId) ?? [];
      existing.push(relation);
      parentRelationsByStudent.set(relation.studentId, existing);
    }

    const siblingRelationsByStudent = new Map<
      number,
      Array<{ studentId: number; siblingId: number; sibling: (typeof siblingStudents)[number] | null }>
    >();
    for (const relation of siblingRelations) {
      const existing = siblingRelationsByStudent.get(relation.studentId) ?? [];
      existing.push({
        studentId: relation.studentId,
        siblingId: relation.siblingId,
        sibling: studentById.get(relation.siblingId) ?? null,
      });
      siblingRelationsByStudent.set(relation.studentId, existing);
    }

    const healthByStudent = new Map(healthRows.map((row) => [row.studentId, row]));
    const otherDataByStudent = new Map(
      otherSignificantRows.map((row) => [row.studentId, row]),
    );

    const previousSchoolsByStudent = new Map<number, typeof previousSchoolRows>();
    for (const row of previousSchoolRows) {
      const existing = previousSchoolsByStudent.get(row.studentId) ?? [];
      existing.push(row);
      previousSchoolsByStudent.set(row.studentId, existing);
    }

    const enrollmentsByStudent = new Map<number, typeof enrollmentRows>();
    for (const row of enrollmentRows) {
      const existing = enrollmentsByStudent.get(row.enrollment.studentId) ?? [];
      existing.push(row);
      enrollmentsByStudent.set(row.enrollment.studentId, existing);
    }

    const assessmentsByStudent = new Map<number, typeof assessmentRows>();
    for (const row of assessmentRows) {
      const existing = assessmentsByStudent.get(row.assessment.studentId) ?? [];
      existing.push(row);
      assessmentsByStudent.set(row.assessment.studentId, existing);
    }

    const positionsByStudent = new Map<number, typeof positionRows>();
    for (const row of positionRows) {
      const existing = positionsByStudent.get(row.position.studentId) ?? [];
      existing.push(row);
      positionsByStudent.set(row.position.studentId, existing);
    }

    const feesByStudent = new Map<number, typeof feeRows>();
    for (const row of feeRows) {
      const existing = feesByStudent.get(row.studentFee.studentId) ?? [];
      existing.push(row);
      feesByStudent.set(row.studentFee.studentId, existing);
    }

    const paymentsByStudent = new Map<number, typeof paymentRows>();
    for (const row of paymentRows) {
      const existing = paymentsByStudent.get(row.payment.studentId) ?? [];
      existing.push(row);
      paymentsByStudent.set(row.payment.studentId, existing);
    }

    const attendancesByStudent = new Map<number, typeof attendanceRows>();
    for (const row of attendanceRows) {
      const existing = attendancesByStudent.get(row.studentId) ?? [];
      existing.push(row);
      attendancesByStudent.set(row.studentId, existing);
    }

    const data = studentRows.map((student) => ({
      ...student,
      parentRelations: parentRelationsByStudent.get(student.id) ?? [],
      siblingRelations: siblingRelationsByStudent.get(student.id) ?? [],
      healthDetails: healthByStudent.get(student.id) ?? null,
      otherSignificantData: otherDataByStudent.get(student.id) ?? null,
      previousSchools: previousSchoolsByStudent.get(student.id) ?? [],
      enrollments: enrollmentsByStudent.get(student.id) ?? [],
      assessments: assessmentsByStudent.get(student.id) ?? [],
      positions: positionsByStudent.get(student.id) ?? [],
      fees: feesByStudent.get(student.id) ?? [],
      payments: paymentsByStudent.get(student.id) ?? [],
      attendances: attendancesByStudent.get(student.id) ?? [],
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error("GET /students error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch students",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = Number.parseInt(id, 10);

    if (Number.isNaN(studentId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid student id",
      });
    }

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    
    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        error: "Student not found",
      });
    }

    const student = studentRows[0];

    const [
      parentRelations,
      siblingRelations,
      siblingStudents,
      healthRows,
      otherSignificantRows,
      previousSchoolRows,
      enrollmentRows,
      assessmentRows,
      positionRows,
      feeRows,
      paymentRows,
      attendanceRows,
    ] = await Promise.all([
      db
        .select({
          studentId: studentParents.studentId,
          parentId: studentParents.parentId,
          relationship: studentParents.relationship,
          parent: parents,
        })
        .from(studentParents)
        .innerJoin(parents, eq(studentParents.parentId, parents.id))
        .where(eq(studentParents.studentId, studentId)),
      db
        .select({
          studentId: studentSiblings.studentId,
          siblingId: studentSiblings.siblingId,
        })
        .from(studentSiblings)
        .where(eq(studentSiblings.studentId, studentId)),
      db.select().from(students),
      db
        .select()
        .from(healthDetails)
        .where(eq(healthDetails.studentId, studentId)),
      db
        .select()
        .from(otherSignificantData)
        .where(eq(otherSignificantData.studentId, studentId)),
      db
        .select()
        .from(previousSchools)
        .where(eq(previousSchools.studentId, studentId)),
      db
        .select({
          enrollment: studentClassEnrollments,
          class: classes,
          supervisor: staff,
          academicYear: academicYears,
        })
        .from(studentClassEnrollments)
        .leftJoin(classes, eq(studentClassEnrollments.classId, classes.id))
        .leftJoin(staff, eq(classes.supervisorId, staff.id))
        .leftJoin(
          academicYears,
          eq(studentClassEnrollments.academicYearId, academicYears.id),
        )
        .where(eq(studentClassEnrollments.studentId, studentId)),
      db
        .select({
          assessment: continuousAssessments,
          subject: subjects,
          academicYear: academicYears,
          term: terms,
        })
        .from(continuousAssessments)
        .leftJoin(subjects, eq(continuousAssessments.subjectId, subjects.id))
        .leftJoin(
          academicYears,
          eq(continuousAssessments.academicYearId, academicYears.id),
        )
        .leftJoin(terms, eq(continuousAssessments.termId, terms.id))
        .where(eq(continuousAssessments.studentId, studentId)),
      db
        .select({
          position: positions,
          class: classes,
          academicYear: academicYears,
          term: terms,
        })
        .from(positions)
        .leftJoin(classes, eq(positions.classId, classes.id))
        .leftJoin(academicYears, eq(positions.academicYearId, academicYears.id))
        .leftJoin(terms, eq(positions.termId, terms.id))
        .where(eq(positions.studentId, studentId)),
      db
        .select({
          studentFee: studentFees,
          fee: fees,
          academicYear: academicYears,
          term: terms,
        })
        .from(studentFees)
        .leftJoin(fees, eq(studentFees.feeId, fees.id))
        .leftJoin(academicYears, eq(studentFees.academicYearId, academicYears.id))
        .leftJoin(terms, eq(studentFees.termId, terms.id))
        .where(eq(studentFees.studentId, studentId)),
      db
        .select({
          payment: payments,
          studentFee: studentFees,
        })
        .from(payments)
        .leftJoin(studentFees, eq(payments.studentFeeId, studentFees.id))
        .where(eq(payments.studentId, studentId)),
      db
        .select()
        .from(studentAttendances)
        .where(eq(studentAttendances.studentId, studentId)),
    ]);

    const studentById = new Map(siblingStudents.map((row) => [row.id, row]));

    const siblingRelationsWithStudents = siblingRelations.map((relation) => ({
      studentId: relation.studentId,
      siblingId: relation.siblingId,
      sibling: studentById.get(relation.siblingId) ?? null,
    }));

    const data = {
      ...student,
      parentRelations,
      siblingRelations: siblingRelationsWithStudents,
      healthDetails: healthRows[0] ?? null,
      otherSignificantData: otherSignificantRows[0] ?? null,
      previousSchools: previousSchoolRows,
      enrollments: enrollmentRows,
      assessments: assessmentRows,
      positions: positionRows,
      fees: feeRows,
      payments: paymentRows,
      attendances: attendanceRows,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET /students/:id error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch student",
    });
  }
});

export default router;
