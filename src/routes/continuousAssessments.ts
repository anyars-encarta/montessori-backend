import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { continuousAssessments } from "../db/schema";

const router = express.Router();

const parseScoreInput = (value: unknown) => {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return null;
};

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(continuousAssessments);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch continuous assessments",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(continuousAssessments)
      .where(eq(continuousAssessments.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Continuous assessment not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch continuous assessment",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const assessmentId = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(assessmentId) || assessmentId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid continuous assessment id",
      });
    }

    const homeWork1 = parseScoreInput(req.body?.homeWork1);
    const homeWork2 = parseScoreInput(req.body?.homeWork2);
    const exercise1 = parseScoreInput(req.body?.exercise1);
    const exercise2 = parseScoreInput(req.body?.exercise2);
    const classTest = parseScoreInput(req.body?.classTest);

    if (
      homeWork1 === null ||
      homeWork2 === null ||
      exercise1 === null ||
      exercise2 === null ||
      classTest === null
    ) {
      return res.status(400).json({
        success: false,
        error:
          "homeWork1, homeWork2, exercise1, exercise2 and classTest must be valid positive numbers",
      });
    }

    const [existing] = await db
      .select({ id: continuousAssessments.id })
      .from(continuousAssessments)
      .where(eq(continuousAssessments.id, assessmentId));

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Continuous assessment not found",
      });
    }

    const totalMark = homeWork1 + homeWork2 + exercise1 + exercise2 + classTest;

    const [updated] = await db
      .update(continuousAssessments)
      .set({
        homeWork1: homeWork1.toFixed(2),
        homeWork2: homeWork2.toFixed(2),
        exercise1: exercise1.toFixed(2),
        exercise2: exercise2.toFixed(2),
        classMark: classTest.toFixed(2),
        examMark: "0.00",
        totalMark: totalMark.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(continuousAssessments.id, assessmentId))
      .returning();

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /continuous-assessments/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update continuous assessment",
    });
  }
});

export default router;
