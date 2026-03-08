import express from "express";
import { db } from "../db";
import { academicYears } from "../db/schema";
import { eq } from "drizzle-orm";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(academicYears);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch academic years",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Academic year not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch academic year",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { year, startDate, endDate } = req.body;

    const parsedYear = Number.parseInt(String(year), 10);
    const normalizedStartDate = typeof startDate === "string" ? startDate.trim() : "";
    const normalizedEndDate = typeof endDate === "string" ? endDate.trim() : "";

    if (!Number.isFinite(parsedYear)) {
      return res.status(400).json({ success: false, error: "year must be a number" });
    }

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    const [created] = await db
      .insert(academicYears)
      .values({
        year: parsedYear,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
      })
      .returning();

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return res.status(409).json({ success: false, error: "Academic year already exists" });
    }
    console.error("POST /academic-years error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { year, startDate, endDate } = req.body;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid academic year id" });
    }

    const parsedYear = Number.parseInt(String(year), 10);
    const normalizedStartDate = typeof startDate === "string" ? startDate.trim() : "";
    const normalizedEndDate = typeof endDate === "string" ? endDate.trim() : "";

    if (!Number.isFinite(parsedYear)) {
      return res.status(400).json({ success: false, error: "year must be a number" });
    }

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    const existing = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Academic year not found" });
    }

    const [updated] = await db
      .update(academicYears)
      .set({
        year: parsedYear,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
      })
      .where(eq(academicYears.id, id))
      .returning();

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return res.status(409).json({ success: false, error: "Academic year already exists" });
    }
    console.error("PUT /academic-years/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid academic year id" });
    }

    const existing = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Academic year not found" });
    }

    await db.delete(academicYears).where(eq(academicYears.id, id));

    return res.status(200).json({ success: true, message: "Academic year deleted" });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23503") {
      return res.status(409).json({
        success: false,
        error: "Cannot delete academic year because related records exist",
      });
    }
    console.error("DELETE /academic-years/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
