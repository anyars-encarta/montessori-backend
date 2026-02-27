import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { studentFees } from "../db/schema";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(studentFees);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student fees",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(studentFees)
      .where(eq(studentFees.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Student fee not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student fee",
    });
  }
});

export default router;
