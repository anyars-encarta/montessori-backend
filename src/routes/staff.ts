import express from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  classes,
  expenseCategories,
  expenses,
  staff,
  staffAttendances,
  staffSubjects,
  subjects,
} from "../db/schema";

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const parseBoolean = (value: unknown) => {
  const normalized = String(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
};

router.get("/", async (req, res) => {
  try {
    const {
      search,
      staffType,
      isActive,
      subjectId,
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
        filters.push(
          or(
            ilike(staff.firstName, `%${value}%`),
            ilike(staff.lastName, `%${value}%`),
            ilike(staff.email, `%${value}%`),
            ilike(staff.phone, `%${value}%`),
          ),
        );
      }
    }

    if (staffType !== undefined) {
      const typeValue = String(staffType);
      if (typeValue !== "teacher" && typeValue !== "non_teaching") {
        return res.status(400).json({ success: false, error: "Invalid staffType filter" });
      }
      filters.push(eq(staff.staffType, typeValue));
    }

    if (isActive !== undefined) {
      const activeValue = parseBoolean(isActive);
      if (activeValue === null) {
        return res.status(400).json({ success: false, error: "Invalid isActive filter" });
      }
      filters.push(eq(staff.isActive, activeValue));
    }

    if (subjectId !== undefined) {
      const parsedSubjectId = parsePositiveInt(subjectId);
      if (parsedSubjectId === null) {
        return res.status(400).json({ success: false, error: "Invalid subjectId filter" });
      }

      const staffRowsBySubject = await db
        .select({ staffId: staffSubjects.staffId })
        .from(staffSubjects)
        .where(eq(staffSubjects.subjectId, parsedSubjectId));

      const staffIdsBySubject = [...new Set(staffRowsBySubject.map((row) => row.staffId))];
      if (!staffIdsBySubject.length) {
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
      filters.push(inArray(staff.id, staffIdsBySubject));
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(staff)
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = totalCount ? Math.ceil(totalCount / limitPerPage) : 0;

    const staffRows = await db
      .select()
      .from(staff)
      .where(whereClause)
      .orderBy(desc(staff.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    if (!staffRows.length) {
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

    const staffIds = staffRows.map((row) => row.id);

    const [subjectRows, supervisedClassRows, attendanceRows, expenseRows] =
      await Promise.all([
        db
          .select({
            staffId: staffSubjects.staffId,
            subjectId: staffSubjects.subjectId,
            subject: subjects,
          })
          .from(staffSubjects)
          .leftJoin(subjects, eq(staffSubjects.subjectId, subjects.id))
          .where(inArray(staffSubjects.staffId, staffIds)),
        db.select().from(classes).where(inArray(classes.supervisorId, staffIds)),
        db
          .select()
          .from(staffAttendances)
          .where(inArray(staffAttendances.staffId, staffIds)),
        db
          .select({
            expense: expenses,
            category: expenseCategories,
          })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(inArray(expenses.createdBy, staffIds)),
      ]);

    const subjectsByStaff = new Map<number, typeof subjectRows>();
    for (const row of subjectRows) {
      const existing = subjectsByStaff.get(row.staffId) ?? [];
      existing.push(row);
      subjectsByStaff.set(row.staffId, existing);
    }

    const classesBySupervisor = new Map<number, typeof supervisedClassRows>();
    for (const row of supervisedClassRows) {
      const existing = classesBySupervisor.get(row.supervisorId) ?? [];
      existing.push(row);
      classesBySupervisor.set(row.supervisorId, existing);
    }

    const attendancesByStaff = new Map<number, typeof attendanceRows>();
    for (const row of attendanceRows) {
      const existing = attendancesByStaff.get(row.staffId) ?? [];
      existing.push(row);
      attendancesByStaff.set(row.staffId, existing);
    }

    const expensesByStaff = new Map<number, typeof expenseRows>();
    for (const row of expenseRows) {
      if (row.expense.createdBy === null) continue;
      const existing = expensesByStaff.get(row.expense.createdBy) ?? [];
      existing.push(row);
      expensesByStaff.set(row.expense.createdBy, existing);
    }

    const data = staffRows.map((row) => ({
      ...row,
      subjects: subjectsByStaff.get(row.id) ?? [],
      supervisedClasses: classesBySupervisor.get(row.id) ?? [],
      attendances: attendancesByStaff.get(row.id) ?? [],
      expenses: expensesByStaff.get(row.id) ?? [],
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
    console.error("GET /staff error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch staff",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const staffId = Number.parseInt(id, 10);

    if (Number.isNaN(staffId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid staff id",
      });
    }

    const data = await db
      .select()
      .from(staff)
      .where(eq(staff.id, staffId));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Staff member not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch staff member",
    });
  }
});

export default router;
