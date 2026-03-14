import express from "express";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { classes, studentAttendances, studentClassEnrollments, students } from "../db/schema";

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const normalizeOptionalText = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const isIsoDate = (value: unknown) => {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
};

const isAttendanceStatus = (value: unknown): value is "present" | "absent" => {
  return value === "present" || value === "absent";
};

type NormalizedAttendanceEntry = {
  studentId: number | null;
  status: unknown;
  remarks: string | null;
};

router.get("/daily-register", async (req, res) => {
  try {
    const classId = parsePositiveInt(req.query.classId);
    const academicYearId = parsePositiveInt(req.query.academicYearId);
    const termId = parsePositiveInt(req.query.termId);
    const attendanceDate = String(req.query.attendanceDate ?? "").trim();

    if (!classId || !academicYearId || !termId || !isIsoDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error:
          "classId, academicYearId, termId, and attendanceDate (YYYY-MM-DD) are required",
      });
    }

    const enrollmentRows = await db
      .select({
        studentId: studentClassEnrollments.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        registrationNumber: students.registrationNumber,
      })
      .from(studentClassEnrollments)
      .innerJoin(students, eq(studentClassEnrollments.studentId, students.id))
      .where(
        and(
          eq(studentClassEnrollments.classId, classId),
          eq(studentClassEnrollments.academicYearId, academicYearId),
          eq(studentClassEnrollments.termId, termId),
          eq(students.isActive, true),
        ),
      );

    if (!enrollmentRows.length) {
      return res.json({
        success: true,
        data: [],
        summary: {
          total: 0,
          present: 0,
          absent: 0,
          unmarked: 0,
        },
      });
    }

    const studentIds = enrollmentRows.map((row) => row.studentId);

    const attendanceRows = await db
      .select()
      .from(studentAttendances)
      .where(
        and(
          inArray(studentAttendances.studentId, studentIds),
          eq(studentAttendances.attendanceDate, attendanceDate),
        ),
      );

    const attendanceByStudent = new Map(attendanceRows.map((row) => [row.studentId, row]));

    const data = enrollmentRows
      .map((row) => {
        const attendance = attendanceByStudent.get(row.studentId);
        return {
          studentId: row.studentId,
          studentName: `${row.firstName} ${row.lastName}`.trim(),
          registrationNumber: row.registrationNumber,
          status: attendance?.status ?? null,
          remarks: attendance?.remarks ?? null,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    const present = data.filter((row) => row.status === "present").length;
    const absent = data.filter((row) => row.status === "absent").length;

    return res.json({
      success: true,
      data,
      summary: {
        total: data.length,
        present,
        absent,
        unmarked: data.length - present - absent,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load daily register",
    });
  }
});

router.post("/bulk-mark", async (req, res) => {
  try {
    const classId = parsePositiveInt(req.body?.classId);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const termId = parsePositiveInt(req.body?.termId);
    const attendanceDate = String(req.body?.attendanceDate ?? "").trim();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;

    if (!classId || !academicYearId || !termId || !isIsoDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error:
          "classId, academicYearId, termId, and attendanceDate (YYYY-MM-DD) are required",
      });
    }

    if (!entries || !entries.length) {
      return res.status(400).json({
        success: false,
        error: "entries must be a non-empty array",
      });
    }

    const normalizedEntries: NormalizedAttendanceEntry[] = entries.map((entry: unknown) => {
      const input = typeof entry === "object" && entry !== null ? entry : {};
      const studentId = parsePositiveInt((input as Record<string, unknown>).studentId);
      const status = (input as Record<string, unknown>).status;

      return {
        studentId,
        status,
        remarks: normalizeOptionalText((input as Record<string, unknown>).remarks),
      };
    });

    const invalidEntry = normalizedEntries.find(
      (entry) => !entry.studentId || !isAttendanceStatus(entry.status),
    );

    if (invalidEntry) {
      return res.status(400).json({
        success: false,
        error: "Each entry must include studentId and status (present or absent)",
      });
    }

    const latestByStudent = new Map<number, (typeof normalizedEntries)[number]>();
    for (const entry of normalizedEntries) {
      latestByStudent.set(entry.studentId as number, entry);
    }

    const dedupedEntries = Array.from(latestByStudent.values());
    const studentIds = dedupedEntries.map((entry) => entry.studentId as number);

    const enrolledRows = await db
      .select({ studentId: studentClassEnrollments.studentId })
      .from(studentClassEnrollments)
      .where(
        and(
          eq(studentClassEnrollments.classId, classId),
          eq(studentClassEnrollments.academicYearId, academicYearId),
          eq(studentClassEnrollments.termId, termId),
          inArray(studentClassEnrollments.studentId, studentIds),
        ),
      );

    const enrolledIds = new Set(enrolledRows.map((row) => row.studentId));
    const invalidStudentIds = studentIds.filter((studentId) => !enrolledIds.has(studentId));

    if (invalidStudentIds.length) {
      return res.status(400).json({
        success: false,
        error: "Some students are not enrolled in the selected class/year/term",
        invalidStudentIds,
      });
    }

    const existingRows = await db
      .select({ studentId: studentAttendances.studentId })
      .from(studentAttendances)
      .where(
        and(
          inArray(studentAttendances.studentId, studentIds),
          eq(studentAttendances.attendanceDate, attendanceDate),
        ),
      );

    const existingIds = new Set(existingRows.map((row) => row.studentId));
    const updated = dedupedEntries.filter((entry) => existingIds.has(entry.studentId as number)).length;
    const inserted = dedupedEntries.length - updated;

    await db
      .insert(studentAttendances)
      .values(
        dedupedEntries.map((entry) => ({
          studentId: entry.studentId as number,
          attendanceDate,
          status: entry.status as "present" | "absent",
          remarks: entry.remarks,
        })),
      )
      .onConflictDoUpdate({
        target: [studentAttendances.studentId, studentAttendances.attendanceDate],
        set: {
          status: sql`excluded.attendance_status`,
          remarks: sql`excluded.remarks`,
        },
      });

    return res.json({
      success: true,
      data: {
        totalProcessed: dedupedEntries.length,
        inserted,
        updated,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to save attendance records",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const currentPage = Math.max(1, parsePositiveInt(req.query.page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(req.query.limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const studentIdFilter = parsePositiveInt(req.query.studentId);
    const classIdFilter = parsePositiveInt(req.query.classId);
    const academicYearIdFilter = parsePositiveInt(req.query.academicYearId);
    const termIdFilter = parsePositiveInt(req.query.termId);
    const statusFilter = String(req.query.status ?? "").trim();
    const fromDate = String(req.query.fromDate ?? "").trim();
    const toDate = String(req.query.toDate ?? "").trim();
    const search = String(req.query.search ?? "").trim();

    const filters = [];

    if (studentIdFilter) {
      filters.push(eq(studentAttendances.studentId, studentIdFilter));
    }

    if (isAttendanceStatus(statusFilter)) {
      filters.push(eq(studentAttendances.status, statusFilter));
    }

    if (fromDate && isIsoDate(fromDate)) {
      filters.push(gte(studentAttendances.attendanceDate, fromDate));
    }

    if (toDate && isIsoDate(toDate)) {
      filters.push(lte(studentAttendances.attendanceDate, toDate));
    }

    const enrollmentFilters = [];
    if (classIdFilter) {
      enrollmentFilters.push(eq(studentClassEnrollments.classId, classIdFilter));
    }

    if (academicYearIdFilter) {
      enrollmentFilters.push(eq(studentClassEnrollments.academicYearId, academicYearIdFilter));
    }

    if (termIdFilter) {
      enrollmentFilters.push(eq(studentClassEnrollments.termId, termIdFilter));
    }

    if (enrollmentFilters.length) {
      filters.push(
        inArray(
          studentAttendances.studentId,
          db
            .select({ studentId: studentClassEnrollments.studentId })
            .from(studentClassEnrollments)
            .where(and(...enrollmentFilters)),
        ),
      );
    }

    if (search) {
      filters.push(
        or(
          ilike(students.firstName, `%${search}%`),
          ilike(students.lastName, `%${search}%`),
          ilike(students.registrationNumber, `%${search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(studentAttendances)
      .innerJoin(students, eq(studentAttendances.studentId, students.id))
      .where(whereClause);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total ? Math.ceil(total / limitPerPage) : 0;

    const data = await db
      .select({
        id: studentAttendances.id,
        studentId: studentAttendances.studentId,
        attendanceDate: studentAttendances.attendanceDate,
        status: studentAttendances.status,
        remarks: studentAttendances.remarks,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        registrationNumber: students.registrationNumber,
      })
      .from(studentAttendances)
      .innerJoin(students, eq(studentAttendances.studentId, students.id))
      .where(whereClause)
      .orderBy(desc(studentAttendances.attendanceDate))
      .limit(limitPerPage)
      .offset(offset);

    const classMap = new Map<number, { id: number; name: string; level: string }>();
    if (data.length) {
      const studentIds = Array.from(new Set(data.map((row) => row.studentId)));

      const enrollmentLookupFilters = [inArray(studentClassEnrollments.studentId, studentIds)];
      if (academicYearIdFilter) {
        enrollmentLookupFilters.push(
          eq(studentClassEnrollments.academicYearId, academicYearIdFilter),
        );
      }
      if (termIdFilter) {
        enrollmentLookupFilters.push(eq(studentClassEnrollments.termId, termIdFilter));
      }

      const enrollmentRows = await db
        .select({
          studentId: studentClassEnrollments.studentId,
          classId: classes.id,
          className: classes.name,
          classLevel: classes.level,
        })
        .from(studentClassEnrollments)
        .innerJoin(classes, eq(studentClassEnrollments.classId, classes.id))
        .where(and(...enrollmentLookupFilters));

      for (const row of enrollmentRows) {
        if (!classMap.has(row.studentId)) {
          classMap.set(row.studentId, {
            id: row.classId,
            name: row.className,
            level: row.classLevel,
          });
        }
      }
    }

    const enrichedData = data.map((row) => {
      const classInfo = classMap.get(row.studentId) ?? null;
      return {
        ...row,
        class: classInfo,
      };
    });

    return res.json({
      success: true,
      data: enrichedData,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student attendances",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Invalid student attendance id",
      });
    }

    const data = await db
      .select()
      .from(studentAttendances)
      .where(eq(studentAttendances.id, id));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Student attendance not found",
      });
    }

    return res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch student attendance",
    });
  }
});

export default router;
