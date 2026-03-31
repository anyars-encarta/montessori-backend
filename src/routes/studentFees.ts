import express from "express";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from '../db/index.js';
import { studentFees, academicYears, fees } from '../db/schema/index.js';

const router = express.Router();

router.get("/yearly-summary", async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    
    const monthlySummary = await db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${studentFees.createdAt})`.as("month"),
        totalFees: sql<string>`SUM(${studentFees.amount})`
      })
      .from(studentFees)
      .innerJoin(fees, eq(studentFees.feeId, fees.id))
      .where(
        sql`EXTRACT(YEAR FROM ${studentFees.createdAt}) = ${currentYear}`
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${studentFees.createdAt})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${studentFees.createdAt})`);
    
    // Format response with month names
    const formattedData = monthNames.map((monthName, index) => {
      const monthData = monthlySummary.find(
        (item) => parseInt(item.month as any) === index + 1
      );
      return {
        month: monthName,
        monthNumber: index + 1,
        total: monthData?.totalFees ? parseFloat(monthData.totalFees as string) : 0,
      };
    });

    res.json({
      success: true,
      year: currentYear,
      data: formattedData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch yearly fee summary",
    });
  }
});

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

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = Number.parseInt(id, 10);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid student fee id",
      });
    }

    const existing = await db
      .select({ id: studentFees.id })
      .from(studentFees)
      .where(eq(studentFees.id, parsedId));

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        error: "Student fee not found",
      });
    }

    await db.delete(studentFees).where(eq(studentFees.id, parsedId));

    return res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        "Failed to delete student fee. It may be referenced by payment records.",
    });
  }
});

export default router;
