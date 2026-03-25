import express from "express";
import { eq } from "drizzle-orm";
import { db } from '../db/index.js';
import { staffSubjects } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(staffSubjects);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch staff subjects",
    });
  }
});

export default router;
