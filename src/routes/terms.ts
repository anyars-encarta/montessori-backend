import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { terms } from "../db/schema";

const router = express.Router();

const normalizeDateOnly = (value: unknown) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
};

const parseHolidayDates = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return [] as string[];
  }

  const rawValues =
    typeof value === "string"
      ? value
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : null;

  if (!rawValues) {
    return null;
  }

  const normalizedValues = rawValues.map(normalizeDateOnly);
  if (normalizedValues.some((item) => !item)) {
    return null;
  }

  return [...new Set(normalizedValues as string[])].sort((a, b) => a.localeCompare(b));
};

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(terms);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch terms",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(terms)
      .where(eq(terms.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Term not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch term",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, sequenceNumber, academicYearId, startDate, endDate, holidayDates } = req.body;

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const parsedSequenceNumber = Number.parseInt(String(sequenceNumber), 10);
    const parsedAcademicYearId = Number.parseInt(String(academicYearId), 10);
    const normalizedStartDate = typeof startDate === "string" ? startDate.trim() : "";
    const normalizedEndDate = typeof endDate === "string" ? endDate.trim() : "";
    const parsedHolidayDates = parseHolidayDates(holidayDates);

    if (!normalizedName) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    if (!Number.isFinite(parsedSequenceNumber) || parsedSequenceNumber < 1) {
      return res.status(400).json({
        success: false,
        error: "sequenceNumber must be a positive number",
      });
    }

    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId < 1) {
      return res.status(400).json({
        success: false,
        error: "academicYearId must be a positive number",
      });
    }

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    if (!parsedHolidayDates) {
      return res.status(400).json({
        success: false,
        error: "holidayDates must be an array of valid YYYY-MM-DD dates",
      });
    }

    const hasOutOfRangeHoliday = parsedHolidayDates.some(
      (holidayDate) => holidayDate < normalizedStartDate || holidayDate > normalizedEndDate,
    );

    if (hasOutOfRangeHoliday) {
      return res.status(400).json({
        success: false,
        error: "Each holiday date must be within the term start and end dates",
      });
    }

    const [created] = await db
      .insert(terms)
      .values({
        name: normalizedName,
        sequenceNumber: parsedSequenceNumber,
        academicYearId: parsedAcademicYearId,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        holidayDates: parsedHolidayDates,
      })
      .returning();

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return res.status(409).json({ success: false, error: "Term already exists" });
    }
    console.error("POST /terms error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { name, sequenceNumber, academicYearId, startDate, endDate, holidayDates } = req.body;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid term id" });
    }

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const parsedSequenceNumber = Number.parseInt(String(sequenceNumber), 10);
    const parsedAcademicYearId = Number.parseInt(String(academicYearId), 10);
    const normalizedStartDate = typeof startDate === "string" ? startDate.trim() : "";
    const normalizedEndDate = typeof endDate === "string" ? endDate.trim() : "";
    const parsedHolidayDates = parseHolidayDates(holidayDates);

    if (!normalizedName) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    if (!Number.isFinite(parsedSequenceNumber) || parsedSequenceNumber < 1) {
      return res.status(400).json({
        success: false,
        error: "sequenceNumber must be a positive number",
      });
    }

    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId < 1) {
      return res.status(400).json({
        success: false,
        error: "academicYearId must be a positive number",
      });
    }

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    if (!parsedHolidayDates) {
      return res.status(400).json({
        success: false,
        error: "holidayDates must be an array of valid YYYY-MM-DD dates",
      });
    }

    const hasOutOfRangeHoliday = parsedHolidayDates.some(
      (holidayDate) => holidayDate < normalizedStartDate || holidayDate > normalizedEndDate,
    );

    if (hasOutOfRangeHoliday) {
      return res.status(400).json({
        success: false,
        error: "Each holiday date must be within the term start and end dates",
      });
    }

    const existing = await db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Term not found" });
    }

    const [updated] = await db
      .update(terms)
      .set({
        name: normalizedName,
        sequenceNumber: parsedSequenceNumber,
        academicYearId: parsedAcademicYearId,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        holidayDates: parsedHolidayDates,
      })
      .where(eq(terms.id, id))
      .returning();

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return res.status(409).json({ success: false, error: "Term already exists" });
    }
    console.error("PUT /terms/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid term id" });
    }

    const existing = await db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Term not found" });
    }

    await db.delete(terms).where(eq(terms.id, id));

    return res.status(200).json({ success: true, message: "Term deleted" });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23503") {
      return res.status(409).json({
        success: false,
        error: "Cannot delete term because related records exist",
      });
    }
    console.error("DELETE /terms/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
