import express from "express";
import { eq } from "drizzle-orm";
import { db } from '../db/index.js';
import { expenseCategories } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(expenseCategories);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch expense categories",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Expense category not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch expense category",
    });
  }
});

export default router;
