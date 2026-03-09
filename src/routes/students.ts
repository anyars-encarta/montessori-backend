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

const parseOptionalBoolean = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") {
      return true;
    }
    if (lowered === "false") {
      return false;
    }
  }

  return null;
};

router.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      admissionDate,
      cloudinaryImageUrl,
      imageCldPubId,
      registrationNumber,
      isActive,
    } = req.body;

    const trimmedFirstName = typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLastName = typeof lastName === "string" ? lastName.trim() : "";
    const normalizedGender = typeof gender === "string" ? gender.trim().toLowerCase() : "";
    const normalizedAdmissionDate = parseDateInput(admissionDate);
    const normalizedDateOfBirth = parseDateInput(dateOfBirth);
    const normalizedIsActive = parseOptionalBoolean(isActive);

    const normalizedCloudinaryImageUrl =
      typeof cloudinaryImageUrl === "string" && cloudinaryImageUrl.trim()
        ? cloudinaryImageUrl.trim()
        : null;

    const normalizedImageCldPubId =
      typeof imageCldPubId === "string" && imageCldPubId.trim()
        ? imageCldPubId.trim()
        : null;

    const normalizedRegistrationNumber =
      typeof registrationNumber === "string" && registrationNumber.trim()
        ? registrationNumber.trim()
        : null;

    if (!trimmedFirstName) {
      return res.status(400).json({ success: false, error: "firstName is required" });
    }

    if (!trimmedLastName) {
      return res.status(400).json({ success: false, error: "lastName is required" });
    }

    if (!normalizedAdmissionDate) {
      return res.status(400).json({
        success: false,
        error: "admissionDate is required and must be a valid date",
      });
    }

    if (dateOfBirth !== undefined && dateOfBirth !== null && !normalizedDateOfBirth) {
      return res.status(400).json({
        success: false,
        error: "dateOfBirth must be a valid date",
      });
    }

    if (!["male", "female", "other"].includes(normalizedGender)) {
      return res.status(400).json({
        success: false,
        error: "gender must be one of: male, female, other",
      });
    }

    if (normalizedIsActive === null) {
      return res.status(400).json({
        success: false,
        error: "isActive must be a boolean",
      });
    }

    const [createdStudent] = await db
      .insert(students)
      .values({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        dateOfBirth: normalizedDateOfBirth,
        gender: normalizedGender as "male" | "female" | "other",
        admissionDate: normalizedAdmissionDate,
        cloudinaryImageUrl: normalizedCloudinaryImageUrl,
        imageCldPubId: normalizedImageCldPubId,
        registrationNumber: normalizedRegistrationNumber,
        ...(normalizedIsActive !== undefined ? { isActive: normalizedIsActive } : {}),
      })
      .returning();

    if (!createdStudent) {
      return res.status(400).json({
        success: false,
        error: "Failed to create student",
      });
    }

    return res.status(201).json({
      success: true,
      data: createdStudent,
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "A student with this registration number already exists",
      });
    }

    console.error("POST /students error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

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

router.get("/:id/enrollments", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(studentClassEnrollments)
      .where(eq(studentClassEnrollments.studentId, studentId));

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const rows = await db
      .select({
        id: studentClassEnrollments.id,
        className: classes.name,
        academicYear: academicYears.year,
        term: terms.name,
        supervisorFirstName: staff.firstName,
        supervisorLastName: staff.lastName,
        enrollmentDate: studentClassEnrollments.enrollmentDate,
      })
      .from(studentClassEnrollments)
      .leftJoin(classes, eq(studentClassEnrollments.classId, classes.id))
      .leftJoin(academicYears, eq(studentClassEnrollments.academicYearId, academicYears.id))
      .leftJoin(terms, eq(studentClassEnrollments.termId, terms.id))
      .leftJoin(staff, eq(classes.supervisorId, staff.id))
      .where(eq(studentClassEnrollments.studentId, studentId))
      .orderBy(desc(studentClassEnrollments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    const data = rows.map((row) => ({
      id: row.id,
      className: row.className ?? "Unassigned",
      academicYear: row.academicYear?.toString() ?? "N/A",
      term: row.term ?? "N/A",
      supervisor:
        row.supervisorFirstName && row.supervisorLastName
          ? `${row.supervisorFirstName} ${row.supervisorLastName}`
          : "Unassigned",
      enrollmentDate: row.enrollmentDate,
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
    console.error("GET /students/:id/enrollments error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student enrollments",
    });
  }
});

router.get("/:id/fees", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const { page = 1, limit = 10 } = req.query; // Add limit and page query parameters

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }
    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;  

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(studentFees)
      .where(eq(studentFees.studentId, studentId));

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const rows = await db
      .select({
        id: studentFees.id,
        feeName: fees.name,
        amount: studentFees.amount,
        dueDate: studentFees.dueDate,
        status: studentFees.status,
        academicYear: academicYears.year,
        term: terms.name,
      })
      .from(studentFees)
      .leftJoin(fees, eq(studentFees.feeId, fees.id))
      .leftJoin(academicYears, eq(studentFees.academicYearId, academicYears.id))
      .leftJoin(terms, eq(studentFees.termId, terms.id))
      .where(eq(studentFees.studentId, studentId))
      .orderBy(desc(studentFees.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    const data = rows.map((row) => ({
      id: row.id,
      feeName: row.feeName ?? "N/A",
      amount: row.amount,
      dueDate: row.dueDate,
      status: row.status ?? "N/A",
      academicYear: row.academicYear ?? "N/A",
      term: row.term ?? "N/A",
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
    console.error("GET /students/:id/fees error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student fees",
    });
  }
});

router.get("/:id/payments", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.studentId, studentId));

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const rows = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        reference: payments.reference,
        feeName: fees.name,
        status: studentFees.status,
      })
      .from(payments)
      .leftJoin(studentFees, eq(payments.studentFeeId, studentFees.id))
      .leftJoin(fees, eq(studentFees.feeId, fees.id))
      .where(eq(payments.studentId, studentId))
      .orderBy(desc(payments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    const data = rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod ?? "N/A",
      reference: row.reference ?? "N/A",
      feeName: row.feeName ?? "N/A",
      status: row.status ?? "N/A",
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
    console.error("GET /students/:id/payments error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student payments",
    });
  }
});

router.get("/:id/siblings", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(studentSiblings)
      .where(eq(studentSiblings.studentId, studentId));

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const siblingRows = await db
      .select({
        siblingId: studentSiblings.siblingId,
        siblingFirstName: students.firstName,
        siblingLastName: students.lastName,
        siblingAdmissionDate: students.admissionDate,
      })
      .from(studentSiblings)
      .leftJoin(students, eq(studentSiblings.siblingId, students.id))
      .where(eq(studentSiblings.studentId, studentId))
      .orderBy(desc(studentSiblings.siblingId))
      .limit(limitPerPage)
      .offset(offset);

    const siblingIds = siblingRows.map((row) => row.siblingId);

    const siblingEnrollmentRows = siblingIds.length
      ? await db
          .select({
            enrollment: studentClassEnrollments,
            class: classes,
            academicYear: academicYears,
          })
          .from(studentClassEnrollments)
          .leftJoin(classes, eq(studentClassEnrollments.classId, classes.id))
          .leftJoin(
            academicYears,
            eq(studentClassEnrollments.academicYearId, academicYears.id),
          )
          .where(inArray(studentClassEnrollments.studentId, siblingIds))
      : [];

    const currentClassBySibling = new Map<
      number,
      {
        className: string;
        academicYear: string;
        enrollmentDate: string;
      }
    >();

    for (const row of siblingEnrollmentRows) {
      const siblingId = row.enrollment.studentId;
      const existing = currentClassBySibling.get(siblingId);

      const currentItem = {
        className: row.class?.name ?? "Unassigned",
        academicYear: row.academicYear?.year?.toString() ?? "N/A",
        enrollmentDate: row.enrollment.enrollmentDate,
      };

      if (!existing) {
        currentClassBySibling.set(siblingId, currentItem);
        continue;
      }

      const existingDate = new Date(existing.enrollmentDate).getTime();
      const currentDate = new Date(currentItem.enrollmentDate).getTime();

      if (currentDate > existingDate) {
        currentClassBySibling.set(siblingId, currentItem);
      }
    }

    const data = siblingRows.map((row) => {
      const currentClass = currentClassBySibling.get(row.siblingId);
      return {
        id: row.siblingId,
        name: `${row.siblingFirstName ?? ""} ${row.siblingLastName ?? ""}`.trim() || "Unknown",
        admissionDate: row.siblingAdmissionDate,
        currentClass: currentClass
          ? `${currentClass.className}${
              currentClass.academicYear !== "N/A"
                ? ` (${currentClass.academicYear})`
                : ""
            }`
          : "Unassigned",
      };
    });

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
    console.error("GET /students/:id/siblings error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student siblings",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const studentId = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      admissionDate,
      cloudinaryImageUrl,
      imageCldPubId,
      registrationNumber,
      isActive,
    } = req.body;

    const trimmedFirstName = typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLastName = typeof lastName === "string" ? lastName.trim() : "";
    const normalizedGender = typeof gender === "string" ? gender.trim().toLowerCase() : "";
    const normalizedAdmissionDate = parseDateInput(admissionDate);
    const normalizedDateOfBirth = parseDateInput(dateOfBirth);
    const normalizedIsActive = parseOptionalBoolean(isActive);

    const normalizedCloudinaryImageUrl =
      typeof cloudinaryImageUrl === "string" && cloudinaryImageUrl.trim()
        ? cloudinaryImageUrl.trim()
        : null;

    const normalizedImageCldPubId =
      typeof imageCldPubId === "string" && imageCldPubId.trim()
        ? imageCldPubId.trim()
        : null;

    const normalizedRegistrationNumber =
      typeof registrationNumber === "string" && registrationNumber.trim()
        ? registrationNumber.trim()
        : null;

    if (!trimmedFirstName) {
      return res.status(400).json({ success: false, error: "firstName is required" });
    }

    if (!trimmedLastName) {
      return res.status(400).json({ success: false, error: "lastName is required" });
    }

    if (!normalizedAdmissionDate) {
      return res.status(400).json({
        success: false,
        error: "admissionDate is required and must be a valid date",
      });
    }

    if (dateOfBirth !== undefined && dateOfBirth !== null && !normalizedDateOfBirth) {
      return res.status(400).json({
        success: false,
        error: "dateOfBirth must be a valid date",
      });
    }

    if (!["male", "female", "other"].includes(normalizedGender)) {
      return res.status(400).json({
        success: false,
        error: "gender must be one of: male, female, other",
      });
    }

    if (normalizedIsActive === null) {
      return res.status(400).json({
        success: false,
        error: "isActive must be a boolean",
      });
    }

    const existingStudent = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!existingStudent.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const [updatedStudent] = await db
      .update(students)
      .set({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        dateOfBirth: normalizedDateOfBirth,
        gender: normalizedGender as "male" | "female" | "other",
        admissionDate: normalizedAdmissionDate,
        cloudinaryImageUrl: normalizedCloudinaryImageUrl,
        imageCldPubId: normalizedImageCldPubId,
        registrationNumber: normalizedRegistrationNumber,
        ...(normalizedIsActive !== undefined ? { isActive: normalizedIsActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId))
      .returning();

    return res.status(200).json({
      success: true,
      data: updatedStudent,
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "A student with this registration number already exists",
      });
    }

    console.error("PUT /students/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const studentId = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const existingStudent = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!existingStudent.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    await db.delete(students).where(eq(students.id, studentId));

    return res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23503") {
      return res.status(409).json({
        success: false,
        error: "Cannot delete student because related records exist",
      });
    }

    console.error("DELETE /students/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/:id/parents", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const parentId = parsePositiveInt(req.body?.parentId);
    const relationship =
      typeof req.body?.relationship === "string" && req.body.relationship.trim()
        ? req.body.relationship.trim()
        : null;

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    if (parentId === null) {
      return res.status(400).json({ success: false, error: "parentId is required" });
    }

    const [studentExists, parentExists] = await Promise.all([
      db.select({ id: students.id }).from(students).where(eq(students.id, studentId)),
      db.select({ id: parents.id }).from(parents).where(eq(parents.id, parentId)),
    ]);

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    if (!parentExists.length) {
      return res.status(404).json({ success: false, error: "Parent not found" });
    }

    const [createdRelation] = await db
      .insert(studentParents)
      .values({
        studentId,
        parentId,
        relationship,
      })
      .returning();

    return res.status(201).json({
      success: true,
      data: createdRelation,
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Parent is already linked to this student",
      });
    }

    console.error("POST /students/:id/parents error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id/parents/:parentId", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const parentId = parsePositiveInt(req.params.parentId);

    if (studentId === null || parentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student or parent id" });
    }

    const existingRelation = await db
      .select({ studentId: studentParents.studentId })
      .from(studentParents)
      .where(and(eq(studentParents.studentId, studentId), eq(studentParents.parentId, parentId)));

    if (!existingRelation.length) {
      return res.status(404).json({ success: false, error: "Student-parent relation not found" });
    }

    await db
      .delete(studentParents)
      .where(and(eq(studentParents.studentId, studentId), eq(studentParents.parentId, parentId)));

    return res.status(200).json({
      success: true,
      message: "Parent removed from student successfully",
    });
  } catch (error) {
    console.error("DELETE /students/:id/parents/:parentId error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/:id/siblings", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const siblingId = parsePositiveInt(req.body?.siblingId);

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    if (siblingId === null) {
      return res.status(400).json({ success: false, error: "siblingId is required" });
    }

    if (studentId === siblingId) {
      return res.status(400).json({ success: false, error: "Student cannot be their own sibling" });
    }

    const [studentExists, siblingExists] = await Promise.all([
      db.select({ id: students.id }).from(students).where(eq(students.id, studentId)),
      db.select({ id: students.id }).from(students).where(eq(students.id, siblingId)),
    ]);

    if (!studentExists.length || !siblingExists.length) {
      return res.status(404).json({ success: false, error: "Student or sibling not found" });
    }

    const existingRelations = await db
      .select({
        studentId: studentSiblings.studentId,
        siblingId: studentSiblings.siblingId,
      })
      .from(studentSiblings)
      .where(
        or(
          and(eq(studentSiblings.studentId, studentId), eq(studentSiblings.siblingId, siblingId)),
          and(eq(studentSiblings.studentId, siblingId), eq(studentSiblings.siblingId, studentId)),
        )!,
      );

    const hasForward = existingRelations.some(
      (relation) => relation.studentId === studentId && relation.siblingId === siblingId,
    );
    const hasReverse = existingRelations.some(
      (relation) => relation.studentId === siblingId && relation.siblingId === studentId,
    );

    if (hasForward && hasReverse) {
      return res.status(409).json({
        success: false,
        error: "Sibling relationship already exists",
      });
    }

    if (!hasForward) {
      await db
        .insert(studentSiblings)
        .values({ studentId, siblingId })
        .onConflictDoNothing();
    }

    if (!hasReverse) {
      await db
        .insert(studentSiblings)
        .values({ studentId: siblingId, siblingId: studentId })
        .onConflictDoNothing();
    }

    return res.status(201).json({
      success: true,
      data: { studentId, siblingId },
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Sibling relationship already exists",
      });
    }

    console.error("POST /students/:id/siblings error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id/siblings/:siblingId", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const siblingId = parsePositiveInt(req.params.siblingId);

    if (studentId === null || siblingId === null) {
      return res.status(400).json({ success: false, error: "Invalid student or sibling id" });
    }

    const existingRelation = await db
      .select({ studentId: studentSiblings.studentId })
      .from(studentSiblings)
      .where(and(eq(studentSiblings.studentId, studentId), eq(studentSiblings.siblingId, siblingId)));

    if (!existingRelation.length) {
      return res.status(404).json({ success: false, error: "Sibling relationship not found" });
    }

    await db
      .delete(studentSiblings)
      .where(
        or(
          and(eq(studentSiblings.studentId, studentId), eq(studentSiblings.siblingId, siblingId)),
          and(eq(studentSiblings.studentId, siblingId), eq(studentSiblings.siblingId, studentId)),
        )!,
      );

    return res.status(200).json({
      success: true,
      message: "Sibling removed successfully",
    });
  } catch (error) {
    console.error("DELETE /students/:id/siblings/:siblingId error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id/health-details", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const parseRequiredBoolean = (value: unknown, fieldName: string) => {
      if (value === undefined || value === null || value === "") {
        return false;
      }

      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
      }

      throw new Error(`${fieldName} must be a boolean`);
    };

    let payload: {
      diphtheria: boolean;
      polio: boolean;
      whoopingCough: boolean;
      tetanus: boolean;
      measles: boolean;
      tuberculosis: boolean;
      otherConditions: string | null;
      lastCheckupDate: string | null;
    };

    try {
      payload = {
        diphtheria: parseRequiredBoolean(req.body?.diphtheria, "diphtheria"),
        polio: parseRequiredBoolean(req.body?.polio, "polio"),
        whoopingCough: parseRequiredBoolean(req.body?.whoopingCough, "whoopingCough"),
        tetanus: parseRequiredBoolean(req.body?.tetanus, "tetanus"),
        measles: parseRequiredBoolean(req.body?.measles, "measles"),
        tuberculosis: parseRequiredBoolean(req.body?.tuberculosis, "tuberculosis"),
        otherConditions:
          typeof req.body?.otherConditions === "string" && req.body.otherConditions.trim()
            ? req.body.otherConditions.trim()
            : null,
        lastCheckupDate: parseDateInput(req.body?.lastCheckupDate),
      };
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error:
          parseError instanceof Error
            ? parseError.message
            : "Invalid health details payload",
      });
    }

    if (
      req.body?.lastCheckupDate !== undefined &&
      req.body?.lastCheckupDate !== null &&
      req.body?.lastCheckupDate !== "" &&
      !payload.lastCheckupDate
    ) {
      return res.status(400).json({
        success: false,
        error: "lastCheckupDate must be a valid date",
      });
    }

    const existingHealth = await db
      .select({ id: healthDetails.id })
      .from(healthDetails)
      .where(eq(healthDetails.studentId, studentId));

    if (existingHealth.length) {
      const [updatedHealth] = await db
        .update(healthDetails)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(healthDetails.studentId, studentId))
        .returning();

      return res.status(200).json({ success: true, data: updatedHealth });
    }

    const [createdHealth] = await db
      .insert(healthDetails)
      .values({
        studentId,
        ...payload,
      })
      .returning();

    return res.status(201).json({ success: true, data: createdHealth });
  } catch (error) {
    console.error("PUT /students/:id/health-details error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id/other-significant-data", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const livingWith =
      typeof req.body?.livingWith === "string" ? req.body.livingWith.trim() : "";

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    const allowedValues = [
      "both_parents",
      "mother_only",
      "father_only",
      "guardian",
      "other_person",
    ];

    if (!allowedValues.includes(livingWith)) {
      return res.status(400).json({
        success: false,
        error:
          "livingWith must be one of: both_parents, mother_only, father_only, guardian, other_person",
      });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const payload = {
      livingWith: livingWith as
        | "both_parents"
        | "mother_only"
        | "father_only"
        | "guardian"
        | "other_person",
      otherDetails:
        typeof req.body?.otherDetails === "string" && req.body.otherDetails.trim()
          ? req.body.otherDetails.trim()
          : null,
    };

    const existingData = await db
      .select({ id: otherSignificantData.id })
      .from(otherSignificantData)
      .where(eq(otherSignificantData.studentId, studentId));

    if (existingData.length) {
      const [updatedData] = await db
        .update(otherSignificantData)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(otherSignificantData.studentId, studentId))
        .returning();

      return res.status(200).json({ success: true, data: updatedData });
    }

    const [createdData] = await db
      .insert(otherSignificantData)
      .values({
        studentId,
        ...payload,
      })
      .returning();

    return res.status(201).json({ success: true, data: createdData });
  } catch (error) {
    console.error("PUT /students/:id/other-significant-data error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.post("/:id/previous-schools", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const schoolName =
      typeof req.body?.schoolName === "string" ? req.body.schoolName.trim() : "";
    const ageAtAdmissionRaw = req.body?.ageAtAdmission;

    if (studentId === null) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }

    if (!schoolName) {
      return res.status(400).json({ success: false, error: "schoolName is required" });
    }

    const studentExists = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!studentExists.length) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    let ageAtAdmission: number | null = null;
    if (ageAtAdmissionRaw !== undefined && ageAtAdmissionRaw !== null && ageAtAdmissionRaw !== "") {
      const parsedAge = Number.parseInt(String(ageAtAdmissionRaw), 10);
      if (Number.isNaN(parsedAge) || parsedAge < 0) {
        return res.status(400).json({
          success: false,
          error: "ageAtAdmission must be a non-negative integer",
        });
      }
      ageAtAdmission = parsedAge;
    }

    const dateOfAdmission = parseDateInput(req.body?.dateOfAdmission);
    const dateLastAttended = parseDateInput(req.body?.dateLastAttended);

    if (
      req.body?.dateOfAdmission !== undefined &&
      req.body?.dateOfAdmission !== null &&
      req.body?.dateOfAdmission !== "" &&
      !dateOfAdmission
    ) {
      return res.status(400).json({
        success: false,
        error: "dateOfAdmission must be a valid date",
      });
    }

    if (
      req.body?.dateLastAttended !== undefined &&
      req.body?.dateLastAttended !== null &&
      req.body?.dateLastAttended !== "" &&
      !dateLastAttended
    ) {
      return res.status(400).json({
        success: false,
        error: "dateLastAttended must be a valid date",
      });
    }

    const [createdSchool] = await db
      .insert(previousSchools)
      .values({
        studentId,
        schoolName,
        dateOfAdmission,
        ageAtAdmission,
        dateLastAttended,
      })
      .returning();

    return res.status(201).json({ success: true, data: createdSchool });
  } catch (error) {
    console.error("POST /students/:id/previous-schools error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id/previous-schools/:schoolId", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const schoolId = parsePositiveInt(req.params.schoolId);
    const schoolName =
      typeof req.body?.schoolName === "string" ? req.body.schoolName.trim() : "";
    const ageAtAdmissionRaw = req.body?.ageAtAdmission;

    if (studentId === null || schoolId === null) {
      return res.status(400).json({ success: false, error: "Invalid student or school id" });
    }

    if (!schoolName) {
      return res.status(400).json({ success: false, error: "schoolName is required" });
    }

    const existingSchool = await db
      .select({ id: previousSchools.id })
      .from(previousSchools)
      .where(and(eq(previousSchools.id, schoolId), eq(previousSchools.studentId, studentId)));

    if (!existingSchool.length) {
      return res.status(404).json({ success: false, error: "Previous school not found" });
    }

    let ageAtAdmission: number | null = null;
    if (ageAtAdmissionRaw !== undefined && ageAtAdmissionRaw !== null && ageAtAdmissionRaw !== "") {
      const parsedAge = Number.parseInt(String(ageAtAdmissionRaw), 10);
      if (Number.isNaN(parsedAge) || parsedAge < 0) {
        return res.status(400).json({
          success: false,
          error: "ageAtAdmission must be a non-negative integer",
        });
      }
      ageAtAdmission = parsedAge;
    }

    const dateOfAdmission = parseDateInput(req.body?.dateOfAdmission);
    const dateLastAttended = parseDateInput(req.body?.dateLastAttended);

    if (
      req.body?.dateOfAdmission !== undefined &&
      req.body?.dateOfAdmission !== null &&
      req.body?.dateOfAdmission !== "" &&
      !dateOfAdmission
    ) {
      return res.status(400).json({
        success: false,
        error: "dateOfAdmission must be a valid date",
      });
    }

    if (
      req.body?.dateLastAttended !== undefined &&
      req.body?.dateLastAttended !== null &&
      req.body?.dateLastAttended !== "" &&
      !dateLastAttended
    ) {
      return res.status(400).json({
        success: false,
        error: "dateLastAttended must be a valid date",
      });
    }

    const [updatedSchool] = await db
      .update(previousSchools)
      .set({
        schoolName,
        dateOfAdmission,
        ageAtAdmission,
        dateLastAttended,
      })
      .where(and(eq(previousSchools.id, schoolId), eq(previousSchools.studentId, studentId)))
      .returning();

    return res.status(200).json({ success: true, data: updatedSchool });
  } catch (error) {
    console.error("PUT /students/:id/previous-schools/:schoolId error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id/previous-schools/:schoolId", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.params.id);
    const schoolId = parsePositiveInt(req.params.schoolId);

    if (studentId === null || schoolId === null) {
      return res.status(400).json({ success: false, error: "Invalid student or school id" });
    }

    const existingSchool = await db
      .select({ id: previousSchools.id })
      .from(previousSchools)
      .where(and(eq(previousSchools.id, schoolId), eq(previousSchools.studentId, studentId)));

    if (!existingSchool.length) {
      return res.status(404).json({ success: false, error: "Previous school not found" });
    }

    await db
      .delete(previousSchools)
      .where(and(eq(previousSchools.id, schoolId), eq(previousSchools.studentId, studentId)));

    return res.status(200).json({
      success: true,
      message: "Previous school deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /students/:id/previous-schools/:schoolId error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
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

    const siblingIds = [...new Set(siblingRelations.map((relation) => relation.siblingId))];

    const siblingEnrollmentRows = siblingIds.length
      ? await db
          .select({
            enrollment: studentClassEnrollments,
            class: classes,
            academicYear: academicYears,
          })
          .from(studentClassEnrollments)
          .leftJoin(classes, eq(studentClassEnrollments.classId, classes.id))
          .leftJoin(
            academicYears,
            eq(studentClassEnrollments.academicYearId, academicYears.id),
          )
          .where(inArray(studentClassEnrollments.studentId, siblingIds))
      : [];

    const studentById = new Map(siblingStudents.map((row) => [row.id, row]));

    const currentClassBySibling = new Map<
      number,
      {
        class: (typeof siblingEnrollmentRows)[number]["class"];
        academicYear: (typeof siblingEnrollmentRows)[number]["academicYear"];
        enrollmentDate: string;
      }
    >();

    for (const row of siblingEnrollmentRows) {
      const siblingId = row.enrollment.studentId;
      const existing = currentClassBySibling.get(siblingId);

      if (!existing) {
        currentClassBySibling.set(siblingId, {
          class: row.class,
          academicYear: row.academicYear,
          enrollmentDate: row.enrollment.enrollmentDate,
        });
        continue;
      }

      const existingDate = new Date(existing.enrollmentDate).getTime();
      const currentDate = new Date(row.enrollment.enrollmentDate).getTime();

      if (currentDate > existingDate) {
        currentClassBySibling.set(siblingId, {
          class: row.class,
          academicYear: row.academicYear,
          enrollmentDate: row.enrollment.enrollmentDate,
        });
      }
    }

    const siblingRelationsWithStudents = siblingRelations.map((relation) => ({
      studentId: relation.studentId,
      siblingId: relation.siblingId,
      sibling: studentById.get(relation.siblingId) ?? null,
      currentClass: currentClassBySibling.get(relation.siblingId) ?? null,
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
