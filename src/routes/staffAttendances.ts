import express from "express";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from '../db/index.js';
import { staff, staffAttendances } from '../db/schema/index.js';

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

const isWeekdayDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getUTCDay();
  return day >= 1 && day <= 5;
};

const isAttendanceStatus = (value: unknown): value is "present" | "absent" => {
  return value === "present" || value === "absent";
};

const isStaffType = (value: unknown): value is "teacher" | "non_teaching" => {
  return value === "teacher" || value === "non_teaching";
};

type NormalizedAttendanceEntry = {
  staffId: number | null;
  status: unknown;
  remarks: string | null;
};

router.get("/daily-register", async (req, res) => {
  try {
    const attendanceDate = String(req.query.attendanceDate ?? "").trim();
    const staffType = String(req.query.staffType ?? "").trim();
    const search = String(req.query.search ?? "").trim();

    if (!isIsoDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: "attendanceDate (YYYY-MM-DD) is required",
      });
    }

    if (!isWeekdayDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: "Attendance can only be marked for Monday to Friday",
      });
    }

    const filters = [eq(staff.isActive, true)];

    if (isStaffType(staffType)) {
      filters.push(eq(staff.staffType, staffType));
    }

    if (search) {
      filters.push(
        or(
          ilike(staff.firstName, `%${search}%`),
          ilike(staff.lastName, `%${search}%`),
          ilike(staff.registrationNumber, `%${search}%`),
        )!,
      );
    }

    const staffRows = await db
      .select({
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        registrationNumber: staff.registrationNumber,
        staffType: staff.staffType,
      })
      .from(staff)
      .where(and(...filters));

    if (!staffRows.length) {
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

    const staffIds = staffRows.map((row) => row.staffId);

    const attendanceRows = await db
      .select()
      .from(staffAttendances)
      .where(
        and(
          inArray(staffAttendances.staffId, staffIds),
          eq(staffAttendances.attendanceDate, attendanceDate),
        ),
      );

    const attendanceByStaff = new Map(attendanceRows.map((row) => [row.staffId, row]));

    const data = staffRows
      .map((row) => {
        const attendance = attendanceByStaff.get(row.staffId);
        return {
          staffId: row.staffId,
          staffName: `${row.firstName} ${row.lastName}`.trim(),
          registrationNumber: row.registrationNumber,
          staffType: row.staffType,
          status: attendance?.status ?? null,
          remarks: attendance?.remarks ?? null,
        };
      })
      .sort((a, b) => a.staffName.localeCompare(b.staffName));

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
    const attendanceDate = String(req.body?.attendanceDate ?? "").trim();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;

    if (!isIsoDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: "attendanceDate (YYYY-MM-DD) is required",
      });
    }

    if (!isWeekdayDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: "Attendance can only be marked for Monday to Friday",
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
      const staffId = parsePositiveInt((input as Record<string, unknown>).staffId);
      const status = (input as Record<string, unknown>).status;

      return {
        staffId,
        status,
        remarks: normalizeOptionalText((input as Record<string, unknown>).remarks),
      };
    });

    const invalidEntry = normalizedEntries.find(
      (entry) => !entry.staffId || !isAttendanceStatus(entry.status),
    );

    if (invalidEntry) {
      return res.status(400).json({
        success: false,
        error: "Each entry must include staffId and status (present or absent)",
      });
    }

    const latestByStaff = new Map<number, (typeof normalizedEntries)[number]>();
    for (const entry of normalizedEntries) {
      latestByStaff.set(entry.staffId as number, entry);
    }

    const dedupedEntries = Array.from(latestByStaff.values());
    const staffIds = dedupedEntries.map((entry) => entry.staffId as number);

    const activeStaffRows = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(inArray(staff.id, staffIds), eq(staff.isActive, true)));

    const validStaffIds = new Set(activeStaffRows.map((row) => row.id));
    const invalidStaffIds = staffIds.filter((id) => !validStaffIds.has(id));

    if (invalidStaffIds.length) {
      return res.status(400).json({
        success: false,
        error: "Some staff records are invalid or inactive",
        invalidStaffIds,
      });
    }

    const existingRows = await db
      .select({ staffId: staffAttendances.staffId })
      .from(staffAttendances)
      .where(
        and(
          inArray(staffAttendances.staffId, staffIds),
          eq(staffAttendances.attendanceDate, attendanceDate),
        ),
      );

    const existingIds = new Set(existingRows.map((row) => row.staffId));
    const updated = dedupedEntries.filter((entry) => existingIds.has(entry.staffId as number)).length;
    const inserted = dedupedEntries.length - updated;

    await db
      .insert(staffAttendances)
      .values(
        dedupedEntries.map((entry) => ({
          staffId: entry.staffId as number,
          attendanceDate,
          status: entry.status as "present" | "absent",
          remarks: entry.remarks,
        })),
      )
      .onConflictDoUpdate({
        target: [staffAttendances.staffId, staffAttendances.attendanceDate],
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

    const staffIdFilter = parsePositiveInt(req.query.staffId);
    const staffTypeFilter = String(req.query.staffType ?? "").trim();
    const statusFilter = String(req.query.status ?? "").trim();
    const fromDate = String(req.query.fromDate ?? "").trim();
    const toDate = String(req.query.toDate ?? "").trim();
    const search = String(req.query.search ?? "").trim();

    const filters = [];

    if (staffIdFilter) {
      filters.push(eq(staffAttendances.staffId, staffIdFilter));
    }

    if (isStaffType(staffTypeFilter)) {
      filters.push(eq(staff.staffType, staffTypeFilter));
    }

    if (isAttendanceStatus(statusFilter)) {
      filters.push(eq(staffAttendances.status, statusFilter));
    }

    if (fromDate && isIsoDate(fromDate)) {
      filters.push(gte(staffAttendances.attendanceDate, fromDate));
    }

    if (toDate && isIsoDate(toDate)) {
      filters.push(lte(staffAttendances.attendanceDate, toDate));
    }

    if (search) {
      filters.push(
        or(
          ilike(staff.firstName, `%${search}%`),
          ilike(staff.lastName, `%${search}%`),
          ilike(staff.registrationNumber, `%${search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(staffAttendances)
      .innerJoin(staff, eq(staffAttendances.staffId, staff.id))
      .where(whereClause);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total ? Math.ceil(total / limitPerPage) : 0;

    const data = await db
      .select({
        id: staffAttendances.id,
        staffId: staffAttendances.staffId,
        attendanceDate: staffAttendances.attendanceDate,
        status: staffAttendances.status,
        remarks: staffAttendances.remarks,
        staffName: sql<string>`${staff.firstName} || ' ' || ${staff.lastName}`,
        registrationNumber: staff.registrationNumber,
        staffType: staff.staffType,
      })
      .from(staffAttendances)
      .innerJoin(staff, eq(staffAttendances.staffId, staff.id))
      .where(whereClause)
      .orderBy(desc(staffAttendances.attendanceDate))
      .limit(limitPerPage)
      .offset(offset);

    return res.json({
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
    return res.status(500).json({
      success: false,
      error: "Failed to fetch staff attendances",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(staffAttendances)
      .where(eq(staffAttendances.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Staff attendance not found",
      });
    }

    return res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch staff attendance",
    });
  }
});

export default router;
