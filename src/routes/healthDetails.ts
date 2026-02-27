import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { healthDetails } from "../db/schema";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(healthDetails);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch health details",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(healthDetails)
      .where(eq(healthDetails.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Health details not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch health details",
    });
  }
});

export default router;
