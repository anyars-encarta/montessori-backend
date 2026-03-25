import express from "express";
import { db } from '../db/index.js';
import { studentParents } from '../db/schema/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(studentParents);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch student parents",
    });
  }
});

export default router;
