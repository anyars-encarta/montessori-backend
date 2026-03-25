import express from "express";
import { eq } from "drizzle-orm";
import { db } from '../db/index.js';
import { expenses } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(expenses);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch expenses",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Expense not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch expense",
    });
  }
});

export default router;
