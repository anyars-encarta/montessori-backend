import express from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from '../db/index.js';
import {
  classes,
  expenseCategories,
  expenses,
  staff,
  staffAttendances,
  staffSubjects,
  subjects,
} from '../db/schema/index.js';

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

const isGender = (value: unknown): value is "male" | "female" | "other" => {
  return value === "male" || value === "female" || value === "other";
};

const isStaffType = (value: unknown): value is "teacher" | "non_teaching" => {
  return value === "teacher" || value === "non_teaching";
};

const parseSubjectIds = (value: unknown) => {
  if (value === undefined) {
    return { provided: false, values: [] as number[] };
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value.map((item) => parsePositiveInt(item));
  if (parsed.some((item) => item === null)) {
    return null;
  }

  const deduped = [...new Set(parsed as number[])];
  return { provided: true, values: deduped };
};

router.post("/", async (req, res) => {
  try {
    const firstName = normalizeOptionalText(req.body?.firstName);
    const lastName = normalizeOptionalText(req.body?.lastName);
    const email = normalizeOptionalText(req.body?.email);
    const phone = normalizeOptionalText(req.body?.phone);
    const address = normalizeOptionalText(req.body?.address);
    const dateOfBirth = normalizeOptionalText(req.body?.dateOfBirth);
    const gender = req.body?.gender;
    const staffType = req.body?.staffType;
    const cloudinaryImageUrl = normalizeOptionalText(req.body?.cloudinaryImageUrl);
    const imageCldPubId = normalizeOptionalText(req.body?.imageCldPubId);
    const hireDate = normalizeOptionalText(req.body?.hireDate);
    const registrationNumber = normalizeOptionalText(req.body?.registrationNumber);
    const isActive =
      req.body?.isActive === undefined ? true : parseBoolean(req.body?.isActive);
    const parsedSubjectIds = parseSubjectIds(req.body?.subjectIds);

    if (!firstName) {
      return res.status(400).json({ success: false, error: "firstName is required" });
    }

    if (!lastName) {
      return res.status(400).json({ success: false, error: "lastName is required" });
    }

    if (!isGender(gender)) {
      return res.status(400).json({
        success: false,
        error: "gender must be one of: male, female, other",
      });
    }

    if (!isStaffType(staffType)) {
      return res.status(400).json({
        success: false,
        error: "staffType must be one of: teacher, non_teaching",
      });
    }

    if (!hireDate || !isIsoDate(hireDate)) {
      return res.status(400).json({
        success: false,
        error: "hireDate is required and must be in YYYY-MM-DD format",
      });
    }

    if (dateOfBirth && !isIsoDate(dateOfBirth)) {
      return res.status(400).json({
        success: false,
        error: "dateOfBirth must be in YYYY-MM-DD format",
      });
    }

    if (isActive === null) {
      return res.status(400).json({
        success: false,
        error: "isActive must be true or false",
      });
    }

    if (!parsedSubjectIds) {
      return res.status(400).json({
        success: false,
        error: "subjectIds must be an array of positive integers",
      });
    }

    if (staffType !== "teacher" && parsedSubjectIds.values.length) {
      return res.status(400).json({
        success: false,
        error: "Only teachers can be assigned subjects",
      });
    }

    if (email) {
      const existingEmail = await db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.email, email));

      if (existingEmail.length) {
        return res.status(409).json({
          success: false,
          error: "A staff member with this email already exists",
        });
      }
    }

    if (registrationNumber) {
      const existingRegNumber = await db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.registrationNumber, registrationNumber));

      if (existingRegNumber.length) {
        return res.status(409).json({
          success: false,
          error: "A staff member with this registration number already exists",
        });
      }
    }

    if (parsedSubjectIds.values.length) {
      const foundSubjects = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(inArray(subjects.id, parsedSubjectIds.values));

      if (foundSubjects.length !== parsedSubjectIds.values.length) {
        return res.status(400).json({
          success: false,
          error: "One or more subjectIds are invalid",
        });
      }
    }

    const [createdStaff] = await db
      .insert(staff)
      .values({
        firstName,
        lastName,
        email,
        phone,
        address,
        dateOfBirth,
        gender,
        staffType,
        cloudinaryImageUrl,
        imageCldPubId,
        hireDate,
        registrationNumber,
        isActive: isActive ?? true,
      })
      .returning();

    if (!createdStaff) {
      return res.status(500).json({
        success: false,
        error: "Failed to create staff member",
      });
    }

    if (parsedSubjectIds.values.length) {
      await db.insert(staffSubjects).values(
        parsedSubjectIds.values.map((subjectId) => ({
          staffId: createdStaff.id,
          subjectId,
        })),
      );
    }

    return res.status(201).json({
      success: true,
      data: createdStaff,
    });
  } catch (error) {
    console.error("POST /staff error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create staff member",
    });
  }
});

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

    const subjectRows = await db
      .select({
        staffId: staffSubjects.staffId,
        subjectId: staffSubjects.subjectId,
        subject: subjects,
      })
      .from(staffSubjects)
      .leftJoin(subjects, eq(staffSubjects.subjectId, subjects.id))
      .where(eq(staffSubjects.staffId, staffId));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Staff member not found",
      });
    }

    res.json({
      success: true,
      data: {
        ...data[0],
        subjects: subjectRows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch staff member",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const staffId = parsePositiveInt(req.params.id);
    if (!staffId) {
      return res.status(400).json({ success: false, error: "Invalid staff id" });
    }

    const [existingStaff] = await db
      .select()
      .from(staff)
      .where(eq(staff.id, staffId));

    if (!existingStaff) {
      return res.status(404).json({ success: false, error: "Staff member not found" });
    }

    const updates: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      dateOfBirth?: string | null;
      gender?: "male" | "female" | "other";
      staffType?: "teacher" | "non_teaching";
      cloudinaryImageUrl?: string | null;
      imageCldPubId?: string | null;
      hireDate?: string;
      registrationNumber?: string | null;
      isActive?: boolean;
      updatedAt?: Date;
    } = {};

    if (req.body?.firstName !== undefined) {
      const firstName = normalizeOptionalText(req.body.firstName);
      if (!firstName) {
        return res.status(400).json({ success: false, error: "firstName cannot be empty" });
      }
      updates.firstName = firstName;
    }

    if (req.body?.lastName !== undefined) {
      const lastName = normalizeOptionalText(req.body.lastName);
      if (!lastName) {
        return res.status(400).json({ success: false, error: "lastName cannot be empty" });
      }
      updates.lastName = lastName;
    }

    if (req.body?.email !== undefined) {
      const email = normalizeOptionalText(req.body.email);
      if (email) {
        const existingEmail = await db
          .select({ id: staff.id })
          .from(staff)
          .where(and(eq(staff.email, email), sql`${staff.id} <> ${staffId}`));

        if (existingEmail.length) {
          return res.status(409).json({
            success: false,
            error: "A staff member with this email already exists",
          });
        }
      }
      updates.email = email;
    }

    if (req.body?.phone !== undefined) {
      updates.phone = normalizeOptionalText(req.body.phone);
    }

    if (req.body?.address !== undefined) {
      updates.address = normalizeOptionalText(req.body.address);
    }

    if (req.body?.dateOfBirth !== undefined) {
      const dateOfBirth = normalizeOptionalText(req.body.dateOfBirth);
      if (dateOfBirth && !isIsoDate(dateOfBirth)) {
        return res.status(400).json({
          success: false,
          error: "dateOfBirth must be in YYYY-MM-DD format",
        });
      }
      updates.dateOfBirth = dateOfBirth;
    }

    if (req.body?.gender !== undefined) {
      if (!isGender(req.body.gender)) {
        return res.status(400).json({
          success: false,
          error: "gender must be one of: male, female, other",
        });
      }
      updates.gender = req.body.gender;
    }

    if (req.body?.staffType !== undefined) {
      if (!isStaffType(req.body.staffType)) {
        return res.status(400).json({
          success: false,
          error: "staffType must be one of: teacher, non_teaching",
        });
      }
      updates.staffType = req.body.staffType;
    }

    if (req.body?.cloudinaryImageUrl !== undefined) {
      updates.cloudinaryImageUrl = normalizeOptionalText(req.body.cloudinaryImageUrl);
    }

    if (req.body?.imageCldPubId !== undefined) {
      updates.imageCldPubId = normalizeOptionalText(req.body.imageCldPubId);
    }

    if (req.body?.hireDate !== undefined) {
      const hireDate = normalizeOptionalText(req.body.hireDate);
      if (!hireDate || !isIsoDate(hireDate)) {
        return res.status(400).json({
          success: false,
          error: "hireDate must be in YYYY-MM-DD format",
        });
      }
      updates.hireDate = hireDate;
    }

    if (req.body?.registrationNumber !== undefined) {
      const registrationNumber = normalizeOptionalText(req.body.registrationNumber);

      if (registrationNumber) {
        const existingRegNumber = await db
          .select({ id: staff.id })
          .from(staff)
          .where(
            and(
              eq(staff.registrationNumber, registrationNumber),
              sql`${staff.id} <> ${staffId}`,
            ),
          );

        if (existingRegNumber.length) {
          return res.status(409).json({
            success: false,
            error: "A staff member with this registration number already exists",
          });
        }
      }

      updates.registrationNumber = registrationNumber;
    }

    if (req.body?.isActive !== undefined) {
      const isActive = parseBoolean(req.body.isActive);
      if (isActive === null) {
        return res.status(400).json({
          success: false,
          error: "isActive must be true or false",
        });
      }
      updates.isActive = isActive;
    }

    const parsedSubjectIds = parseSubjectIds(req.body?.subjectIds);
    if (parsedSubjectIds === null) {
      return res.status(400).json({
        success: false,
        error: "subjectIds must be an array of positive integers",
      });
    }

    const effectiveStaffType = updates.staffType ?? existingStaff.staffType;

    if (parsedSubjectIds?.provided && effectiveStaffType !== "teacher" && parsedSubjectIds.values.length) {
      return res.status(400).json({
        success: false,
        error: "Only teachers can be assigned subjects",
      });
    }

    if (parsedSubjectIds?.provided && parsedSubjectIds.values.length) {
      const foundSubjects = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(inArray(subjects.id, parsedSubjectIds.values));

      if (foundSubjects.length !== parsedSubjectIds.values.length) {
        return res.status(400).json({
          success: false,
          error: "One or more subjectIds are invalid",
        });
      }
    }

    const hasFieldUpdates = Object.keys(updates).length > 0;
    const shouldSyncSubjects =
      parsedSubjectIds?.provided === true || updates.staffType === "non_teaching";

    if (!hasFieldUpdates && !shouldSyncSubjects) {
      return res.status(400).json({
        success: false,
        error: "No valid fields were provided for update",
      });
    }

    if (hasFieldUpdates) {
      updates.updatedAt = new Date();
      await db.update(staff).set(updates).where(eq(staff.id, staffId));
    }

    if (shouldSyncSubjects) {
      await db.delete(staffSubjects).where(eq(staffSubjects.staffId, staffId));

      if (effectiveStaffType === "teacher" && parsedSubjectIds?.provided && parsedSubjectIds.values.length) {
        await db.insert(staffSubjects).values(
          parsedSubjectIds.values.map((subjectId) => ({
            staffId,
            subjectId,
          })),
        );
      }
    }

    const [updatedStaff] = await db
      .select()
      .from(staff)
      .where(eq(staff.id, staffId));

    return res.json({
      success: true,
      data: updatedStaff ?? null,
    });
  } catch (error) {
    console.error("PUT /staff/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update staff member",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const staffId = parsePositiveInt(req.params.id);
    if (!staffId) {
      return res.status(400).json({ success: false, error: "Invalid staff id" });
    }

    const [existingStaff] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.id, staffId));

    if (!existingStaff) {
      return res.status(404).json({ success: false, error: "Staff member not found" });
    }

    const [supervisedClassCount, expenseCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.supervisorId, staffId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(expenses)
        .where(eq(expenses.createdBy, staffId)),
    ]);

    if (Number(supervisedClassCount[0]?.count ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        error: "Cannot delete staff member because they supervise one or more classes",
      });
    }

    if (Number(expenseCount[0]?.count ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        error: "Cannot delete staff member because they are referenced by existing expenses",
      });
    }

    await db.delete(staffSubjects).where(eq(staffSubjects.staffId, staffId));
    await db.delete(staffAttendances).where(eq(staffAttendances.staffId, staffId));
    await db.delete(staff).where(eq(staff.id, staffId));

    return res.status(204).send();
  } catch (error) {
    console.error("DELETE /staff/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete staff member",
    });
  }
});

export default router;
