import express from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { payments, studentFees, students } from "../db/schema";

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const parseNullablePositiveInt = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parsePositiveInt(value);
};

const normalizeOptionalText = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const parseDateInput = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const parseMoneyString = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed.toFixed(2);
};

const toFixedMoney = (value: string | number) => {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
};

const derivePaymentStatus = (amount: string, amountPaid: string) => {
  const total = Number.parseFloat(amount);
  const paid = Number.parseFloat(amountPaid);

  if (!Number.isFinite(total) || total <= 0) return "pending" as const;
  if (!Number.isFinite(paid) || paid <= 0) return "pending" as const;
  if (paid >= total) return "paid" as const;
  return "partial" as const;
};

const reconcileStudentFeePayment = async (studentFeeId: number) => {
  const [feeRow] = await db
    .select({
      id: studentFees.id,
      amount: studentFees.amount,
    })
    .from(studentFees)
    .where(eq(studentFees.id, studentFeeId));

  if (!feeRow) {
    return;
  }

  const paymentRows = await db
    .select({ totalPaid: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.studentFeeId, studentFeeId));

  const totalPaid = toFixedMoney(paymentRows[0]?.totalPaid ?? "0");
  const status = derivePaymentStatus(String(feeRow.amount), totalPaid);

  await db
    .update(studentFees)
    .set({
      amountPaid: totalPaid,
      status,
      updatedAt: new Date(),
    })
    .where(eq(studentFees.id, studentFeeId));
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
    const studentIdFilter = parsePositiveInt(req.query.studentId);
    const studentFeeIdFilter = parsePositiveInt(req.query.studentFeeId);
    const startDateFilter = parseDateInput(req.query.startDate);
    const endDateFilter = parseDateInput(req.query.endDate);

    const conditions = [];
    if (studentIdFilter) {
      conditions.push(eq(payments.studentId, studentIdFilter));
    }
    if (studentFeeIdFilter) {
      conditions.push(eq(payments.studentFeeId, studentFeeIdFilter));
    }
    if (startDateFilter) {
      conditions.push(gte(payments.paymentDate, startDateFilter));
    }
    if (endDateFilter) {
      conditions.push(lte(payments.paymentDate, endDateFilter));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: payments.id,
        studentId: payments.studentId,
        studentFeeId: payments.studentFeeId,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        reference: payments.reference,
        notes: payments.notes,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(whereClause)
      .orderBy(desc(payments.createdAt));

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
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment id",
      });
    }

    const data = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id));
    
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

router.post("/", async (req, res) => {
  try {
    const studentId = parsePositiveInt(req.body?.studentId);
    const studentFeeId = parseNullablePositiveInt(req.body?.studentFeeId);
    const amount = parseMoneyString(req.body?.amount);
    const paymentDate = parseDateInput(req.body?.paymentDate);
    const paymentMethod = normalizeOptionalText(req.body?.paymentMethod);
    const reference = normalizeOptionalText(req.body?.reference);
    const notes = normalizeOptionalText(req.body?.notes);

    if (!studentId) {
      return res.status(400).json({ success: false, error: "studentId is required" });
    }

    if (studentFeeId === undefined) {
      return res.status(400).json({
        success: false,
        error: "studentFeeId must be a positive integer or null",
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: "amount is required and must be greater than 0",
      });
    }

    if (!paymentDate) {
      return res.status(400).json({
        success: false,
        error: "paymentDate is required and must be a valid date",
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

    if (studentFeeId !== null) {
      const [fee] = await db
        .select({ id: studentFees.id, studentId: studentFees.studentId })
        .from(studentFees)
        .where(eq(studentFees.id, studentFeeId));

      if (!fee) {
        return res.status(404).json({
          success: false,
          error: "Student fee not found",
        });
      }

      if (fee.studentId !== studentId) {
        return res.status(400).json({
          success: false,
          error: "studentFeeId does not belong to the selected student",
        });
      }
    }

    const [createdPayment] = await db
      .insert(payments)
      .values({
        studentId,
        studentFeeId,
        amount,
        paymentDate,
        paymentMethod,
        reference,
        notes,
      })
      .returning();

    if (!createdPayment) {
      return res.status(500).json({
        success: false,
        error: "Failed to create payment",
      });
    }

    if (studentFeeId !== null) {
      await reconcileStudentFeePayment(studentFeeId);
    }

    return res.status(201).json({ success: true, data: createdPayment });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to create payment",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid payment id" });
    }

    const [existingPayment] = await db
      .select({
        id: payments.id,
        studentId: payments.studentId,
        studentFeeId: payments.studentFeeId,
      })
      .from(payments)
      .where(eq(payments.id, id));

    if (!existingPayment) {
      return res.status(404).json({ success: false, error: "Payment not found" });
    }

    const updates: {
      studentId?: number;
      studentFeeId?: number | null;
      amount?: string;
      paymentDate?: string;
      paymentMethod?: string | null;
      reference?: string | null;
      notes?: string | null;
    } = {};

    if (req.body?.studentId !== undefined) {
      const studentId = parsePositiveInt(req.body.studentId);
      if (!studentId) {
        return res.status(400).json({ success: false, error: "studentId must be a positive integer" });
      }

      const [student] = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, studentId));

      if (!student) {
        return res.status(404).json({ success: false, error: "Student not found" });
      }

      updates.studentId = studentId;
    }

    if (req.body?.studentFeeId !== undefined) {
      const studentFeeId = parseNullablePositiveInt(req.body.studentFeeId);
      if (studentFeeId === undefined) {
        return res.status(400).json({
          success: false,
          error: "studentFeeId must be a positive integer or null",
        });
      }

      updates.studentFeeId = studentFeeId;
    }

    if (req.body?.amount !== undefined) {
      const amount = parseMoneyString(req.body.amount);
      if (!amount) {
        return res.status(400).json({
          success: false,
          error: "amount must be greater than 0",
        });
      }
      updates.amount = amount;
    }

    if (req.body?.paymentDate !== undefined) {
      const paymentDate = parseDateInput(req.body.paymentDate);
      if (!paymentDate) {
        return res.status(400).json({
          success: false,
          error: "paymentDate must be a valid date",
        });
      }
      updates.paymentDate = paymentDate;
    }

    if (req.body?.paymentMethod !== undefined) {
      updates.paymentMethod = normalizeOptionalText(req.body.paymentMethod);
    }

    if (req.body?.reference !== undefined) {
      updates.reference = normalizeOptionalText(req.body.reference);
    }

    if (req.body?.notes !== undefined) {
      updates.notes = normalizeOptionalText(req.body.notes);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        error: "No valid fields were provided for update",
      });
    }

    const resolvedStudentId = updates.studentId ?? existingPayment.studentId;
    const resolvedStudentFeeId =
      updates.studentFeeId !== undefined
        ? updates.studentFeeId
        : existingPayment.studentFeeId;

    if (resolvedStudentFeeId !== null) {
      const [fee] = await db
        .select({ id: studentFees.id, studentId: studentFees.studentId })
        .from(studentFees)
        .where(eq(studentFees.id, resolvedStudentFeeId));

      if (!fee) {
        return res.status(404).json({
          success: false,
          error: "Student fee not found",
        });
      }

      if (fee.studentId !== resolvedStudentId) {
        return res.status(400).json({
          success: false,
          error: "studentFeeId does not belong to the selected student",
        });
      }
    }

    const [updatedPayment] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();

    if (existingPayment.studentFeeId !== null) {
      await reconcileStudentFeePayment(existingPayment.studentFeeId);
    }
    if (resolvedStudentFeeId !== null && resolvedStudentFeeId !== existingPayment.studentFeeId) {
      await reconcileStudentFeePayment(resolvedStudentFeeId);
    }

    return res.status(200).json({ success: true, data: updatedPayment ?? null });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to update payment",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid payment id" });
    }

    const [existingPayment] = await db
      .select({ id: payments.id, studentFeeId: payments.studentFeeId })
      .from(payments)
      .where(eq(payments.id, id));

    if (!existingPayment) {
      return res.status(404).json({ success: false, error: "Payment not found" });
    }

    await db.delete(payments).where(eq(payments.id, id));

    if (existingPayment.studentFeeId !== null) {
      await reconcileStudentFeePayment(existingPayment.studentFeeId);
    }

    return res.status(200).json({ success: true, data: {} });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete payment",
    });
  }
});

export default router;
