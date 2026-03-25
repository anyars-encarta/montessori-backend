import express from "express";
import { db } from '../db/index.js';
import { studentSiblings } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(studentSiblings);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student siblings",
    });
  }
});

export default router;
