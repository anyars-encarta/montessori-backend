import express from "express";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  academicYears,
  classSubjects,
  classes,
  positions,
  staff,
  studentClassEnrollments,
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

router.post("/", async (req, res) => {
  try {
    const { name, level, capacity, supervisorId, subjectIds } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedLevel = typeof level === "string" ? level.trim() : "";
    const parsedCapacity = Number.parseInt(String(capacity), 10);
    const parsedSupervisorId = parsePositiveInt(supervisorId);

    if (!trimmedName) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    if (!trimmedLevel) {
      return res.status(400).json({ success: false, error: "level is required" });
    }

    if (!Number.isFinite(parsedCapacity) || parsedCapacity < 0) {
      return res
        .status(400)
        .json({ success: false, error: "capacity must be a non-negative integer" });
    }

    if (parsedSupervisorId === null) {
      return res
        .status(400)
        .json({ success: false, error: "supervisorId must be a positive integer" });
    }

    const supervisorExists = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.id, parsedSupervisorId));

    if (!supervisorExists.length) {
      return res.status(404).json({ success: false, error: "Supervisor not found" });
    }

    const parsedSubjectIds = Array.isArray(subjectIds)
      ? [...new Set(subjectIds.map((value) => parsePositiveInt(value)).filter((v) => v !== null))]
      : [];

    if (Array.isArray(subjectIds) && parsedSubjectIds.length !== subjectIds.length) {
      return res.status(400).json({
        success: false,
        error: "subjectIds must be an array of positive integers",
      });
    }

    if (parsedSubjectIds.length) {
      const foundSubjects = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(inArray(subjects.id, parsedSubjectIds));

      if (foundSubjects.length !== parsedSubjectIds.length) {
        return res.status(400).json({
          success: false,
          error: "One or more subjectIds are invalid",
        });
      }
    }

    const [createdClass] = await db
      .insert(classes)
      .values({
        name: trimmedName,
        level: trimmedLevel,
        capacity: parsedCapacity,
        supervisorId: parsedSupervisorId,
      })
      .returning();

    if (!createdClass) {
      return res.status(400).json({
        success: false,
        error: "Failed to create class",
      });
    }

    if (parsedSubjectIds.length) {
      await db.insert(classSubjects).values(
        parsedSubjectIds.map((subjectId) => ({
          classId: createdClass.id,
          subjectId,
        })),
      );
    }

    return res.status(201).json({
      success: true,
      data: createdClass,
    });
  } catch (error) {
    console.error("POST /classes error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      search,
      level,
      supervisorId,
      subjectId,
      academicYearId,
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage = Math.max(1, parsePositiveInt(page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const filters = [];

    if (search) {
      const value = String(search).trim();
      if (value) {
        filters.push(ilike(classes.name, `%${value}%`));
      }
    }

    if (level) {
      const value = String(level).trim();
      if (value) {
        filters.push(ilike(classes.level, `%${value}%`));
      }
    }

    if (supervisorId !== undefined) {
      const parsedSupervisorId = parsePositiveInt(supervisorId);
      if (parsedSupervisorId === null) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid supervisorId filter" });
      }
      filters.push(eq(classes.supervisorId, parsedSupervisorId));
    }

    if (subjectId !== undefined) {
      const parsedSubjectId = parsePositiveInt(subjectId);
      if (parsedSubjectId === null) {
        return res.status(400).json({ success: false, error: "Invalid subjectId filter" });
      }

      const classRowsBySubject = await db
        .select({ classId: classSubjects.classId })
        .from(classSubjects)
        .where(eq(classSubjects.subjectId, parsedSubjectId));

      const classIdsBySubject = [...new Set(classRowsBySubject.map((row) => row.classId))];
      if (!classIdsBySubject.length) {
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
      filters.push(inArray(classes.id, classIdsBySubject));
    }

    if (academicYearId !== undefined) {
      const parsedAcademicYearId = parsePositiveInt(academicYearId);
      if (parsedAcademicYearId === null) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid academicYearId filter" });
      }

      const classRowsByAcademicYear = await db
        .select({ classId: studentClassEnrollments.classId })
        .from(studentClassEnrollments)
        .where(eq(studentClassEnrollments.academicYearId, parsedAcademicYearId));

      const classIdsByAcademicYear = [
        ...new Set(classRowsByAcademicYear.map((row) => row.classId)),
      ];
      if (!classIdsByAcademicYear.length) {
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
      filters.push(inArray(classes.id, classIdsByAcademicYear));
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const classRows = await db
      .select({
        class: classes,
        supervisor: staff,
      })
      .from(classes)
      .leftJoin(staff, eq(classes.supervisorId, staff.id))
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    if (!classRows.length) {
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

    const classIds = classRows.map((row) => row.class.id);

    const [subjectRows, enrollmentRows, positionRows] = await Promise.all([
      db
        .select({
          classId: classSubjects.classId,
          subjectId: classSubjects.subjectId,
          subject: subjects,
        })
        .from(classSubjects)
        .leftJoin(subjects, eq(classSubjects.subjectId, subjects.id))
        .where(inArray(classSubjects.classId, classIds)),
      db
        .select({
          enrollment: studentClassEnrollments,
          student: students,
          academicYear: academicYears,
        })
        .from(studentClassEnrollments)
        .leftJoin(students, eq(studentClassEnrollments.studentId, students.id))
        .leftJoin(
          academicYears,
          eq(studentClassEnrollments.academicYearId, academicYears.id),
        )
        .where(inArray(studentClassEnrollments.classId, classIds)),
      db
        .select({
          position: positions,
          student: students,
          academicYear: academicYears,
          term: terms,
        })
        .from(positions)
        .leftJoin(students, eq(positions.studentId, students.id))
        .leftJoin(academicYears, eq(positions.academicYearId, academicYears.id))
        .leftJoin(terms, eq(positions.termId, terms.id))
        .where(inArray(positions.classId, classIds)),
    ]);

    const subjectsByClass = new Map<number, typeof subjectRows>();
    for (const row of subjectRows) {
      const existing = subjectsByClass.get(row.classId) ?? [];
      existing.push(row);
      subjectsByClass.set(row.classId, existing);
    }

    const enrollmentsByClass = new Map<number, typeof enrollmentRows>();
    for (const row of enrollmentRows) {
      const existing = enrollmentsByClass.get(row.enrollment.classId) ?? [];
      existing.push(row);
      enrollmentsByClass.set(row.enrollment.classId, existing);
    }

    const positionsByClass = new Map<number, typeof positionRows>();
    for (const row of positionRows) {
      const existing = positionsByClass.get(row.position.classId) ?? [];
      existing.push(row);
      positionsByClass.set(row.position.classId, existing);
    }

    const data = classRows.map((row) => ({
      ...row.class,
      supervisor: row.supervisor,
      subjects: subjectsByClass.get(row.class.id) ?? [],
      enrollments: enrollmentsByClass.get(row.class.id) ?? [],
      positions: positionsByClass.get(row.class.id) ?? [],
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
    console.error("GET /classes error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch classes",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const classId = Number.parseInt(id, 10);

    if (Number.isNaN(classId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid class id",
      });
    }

    const classRow = await db
      .select({
        class: classes,
        supervisor: staff,
      })
      .from(classes)
      .leftJoin(staff, eq(classes.supervisorId, staff.id))
      .where(eq(classes.id, classId));
    
    if (!classRow.length) {
      return res.status(404).json({
        success: false,
        error: "Class not found",
      });
    }

    const [subjectRows, enrollmentRows] = await Promise.all([
      db
        .select({
          classId: classSubjects.classId,
          subjectId: classSubjects.subjectId,
          subject: subjects,
        })
        .from(classSubjects)
        .leftJoin(subjects, eq(classSubjects.subjectId, subjects.id))
        .where(eq(classSubjects.classId, classId)),
      db
        .select({
          enrollment: studentClassEnrollments,
          student: students,
          academicYear: academicYears,
        })
        .from(studentClassEnrollments)
        .leftJoin(students, eq(studentClassEnrollments.studentId, students.id))
        .leftJoin(
          academicYears,
          eq(studentClassEnrollments.academicYearId, academicYears.id),
        )
        .where(eq(studentClassEnrollments.classId, classId)),
    ]);

    const data = {
      ...classRow[0]?.class,
      supervisor: classRow[0]?.supervisor,
      subjects: subjectRows,
      enrollments: enrollmentRows,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET /classes/:id error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch class",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    // Check if class exists
    const existingClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existingClass || existingClass.length === 0) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Delete the class (cascades to enrollments due to schema)
    await db.delete(classes).where(eq(classes.id, classId));

    res.status(200).json({
      success: true,
      message: "Class deleted successfully",
    });
  } catch (e) {
    console.error(`DELETE /classes/:id error:, ${e}`);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
