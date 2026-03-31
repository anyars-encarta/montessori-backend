import express from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from '../db/index.js';
import { academicYears, fees, studentFees, students, terms } from '../db/schema/index.js';

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const parseMoneyString = (value: unknown) => {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed.toFixed(2);
};

const parseDateInput = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

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

router.post("/", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.body?.studentId);
    const feeId = parsePositiveInt(req.body?.feeId);
    const termId = parsePositiveInt(req.body?.termId);
    const dueDate = parseDateInput(req.body?.dueDate);

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: "studentId must be a positive integer",
      });
    }

    if (!feeId) {
      return res.status(400).json({
        success: false,
        error: "feeId must be a positive integer",
      });
    }

    if (!termId) {
      return res.status(400).json({
        success: false,
        error: "termId must be a positive integer",
      });
    }

    if (req.body?.dueDate !== undefined && dueDate === null) {
      return res.status(400).json({
        success: false,
        error: "dueDate must be a valid date",
      });
    }

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      return res.status(404).json({
        success: false,
        error: "Student not found",
      });
    }

    const [fee] = await db
      .select({
        id: fees.id,
        amount: fees.amount,
        academicYearId: fees.academicYearId,
        applicableTermId: fees.applicableTermId,
        applyOnce: fees.applyOnce,
      })
      .from(fees)
      .where(eq(fees.id, feeId));

    if (!fee) {
      return res.status(404).json({
        success: false,
        error: "Fee not found",
      });
    }

    const [term] = await db
      .select({ id: terms.id, academicYearId: terms.academicYearId })
      .from(terms)
      .where(eq(terms.id, termId));

    if (!term) {
      return res.status(404).json({
        success: false,
        error: "Term not found",
      });
    }

    if (term.academicYearId !== fee.academicYearId) {
      return res.status(400).json({
        success: false,
        error: "Selected term must belong to the fee's academic year",
      });
    }

    if (fee.applicableTermId !== null && fee.applicableTermId !== termId) {
      return res.status(400).json({
        success: false,
        error: "Selected term is not valid for this fee",
      });
    }

    if (fee.applyOnce) {
      const existingApplied = await db
        .select({ id: studentFees.id })
        .from(studentFees)
        .where(and(eq(studentFees.studentId, studentId), eq(studentFees.feeId, feeId)))
        .limit(1);

      if (existingApplied.length > 0) {
        return res.status(409).json({
          success: false,
          error: "This one-time fee has already been assigned to this student",
        });
      }
    }

    const existingForTerm = await db
      .select({ id: studentFees.id })
      .from(studentFees)
      .where(
        and(
          eq(studentFees.studentId, studentId),
          eq(studentFees.feeId, feeId),
          eq(studentFees.academicYearId, fee.academicYearId),
          eq(studentFees.termId, termId),
        ),
      )
      .limit(1);

    if (existingForTerm.length > 0) {
      return res.status(409).json({
        success: false,
        error: "This fee is already assigned to the student for the selected term",
      });
    }

    const normalizedAmount =
      req.body?.amount !== undefined
        ? parseMoneyString(req.body.amount)
        : parseMoneyString(fee.amount);

    if (!normalizedAmount) {
      return res.status(400).json({
        success: false,
        error: "amount must be a positive number",
      });
    }

    const [created] = await db
      .insert(studentFees)
      .values({
        studentId,
        feeId,
        academicYearId: fee.academicYearId,
        termId,
        amount: normalizedAmount,
        amountPaid: "0.00",
        status: "pending",
        dueDate,
        updatedAt: new Date(),
      })
      .returning();

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to assign fee to student",
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
