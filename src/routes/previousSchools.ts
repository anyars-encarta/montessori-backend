import express from "express";
import { eq } from "drizzle-orm";
import { db } from '../db/index.js';
import { previousSchools } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(previousSchools);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch previous schools",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(previousSchools)
      .where(eq(previousSchools.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Previous school not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch previous school",
    });
  }
});

export default router;
