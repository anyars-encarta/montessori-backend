import express from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { payments } from "../db/schema";

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
        month: sql<number>`EXTRACT(MONTH FROM ${payments.paymentDate})`.as("month"),
        totalPayments: sql<string>`SUM(${payments.amount})`
      })
      .from(payments)
      .where(
        sql`EXTRACT(YEAR FROM ${payments.paymentDate}) = ${currentYear}`
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${payments.paymentDate})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${payments.paymentDate})`);
    
    // Format response with month names
    const formattedData = monthNames.map((monthName, index) => {
      const monthData = monthlySummary.find(
        (item) => parseInt(item.month as any) === index + 1
      );
      return {
        month: monthName,
        monthNumber: index + 1,
        total: monthData?.totalPayments ? parseFloat(monthData.totalPayments as string) : 0,
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
      error: "Failed to fetch yearly payment summary",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await db.select().from(payments);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch payments",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(payments)
      .where(eq(payments.id, parseInt(id)));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment",
    });
  }
});

export default router;
