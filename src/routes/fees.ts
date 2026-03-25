import express from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from '../db/index.js';
import { academicYears, fees, terms } from '../db/schema/index.js';

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const normalizeOptionalText = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const parseMoneyString = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed.toFixed(2);
};

const parseOptionalBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
};

const parseNullablePositiveInt = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parsePositiveInt(value);
};

const isFeeType = (
  value: unknown,
): value is "admission" | "tuition" | "feeding" | "other" => {
  return (
    value === "admission" ||
    value === "tuition" ||
    value === "feeding" ||
    value === "other"
  );
};

router.get("/", async (req, res) => {
  try {
    const currentPage = Math.max(1, parsePositiveInt(req.query.page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(req.query.limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const feeTypeFilter = typeof req.query.feeType === "string" ? req.query.feeType.trim() : "";
    const applicableLevelFilter =
      typeof req.query.applicableToLevel === "string"
        ? req.query.applicableToLevel.trim()
        : "";
    const academicYearIdFilter = parsePositiveInt(req.query.academicYearId);
    const applicableTermIdFilter = parsePositiveInt(req.query.applicableTermId);

    const conditions = [];

    if (search) {
      conditions.push(ilike(fees.name, `%${search}%`));
    }

    if (feeTypeFilter && isFeeType(feeTypeFilter)) {
      conditions.push(eq(fees.feeType, feeTypeFilter));
    }

    if (applicableLevelFilter) {
      conditions.push(ilike(fees.applicableToLevel, `%${applicableLevelFilter}%`));
    }

    if (academicYearIdFilter) {
      conditions.push(eq(fees.academicYearId, academicYearIdFilter));
    }

    if (applicableTermIdFilter) {
      conditions.push(eq(fees.applicableTermId, applicableTermIdFilter));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(fees)
      .where(whereClause);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total ? Math.ceil(total / limitPerPage) : 0;

    const data = await db
      .select({
        id: fees.id,
        name: fees.name,
        description: fees.description,
        amount: fees.amount,
        feeType: fees.feeType,
        academicYearId: fees.academicYearId,
        applicableTermId: fees.applicableTermId,
        applicableToLevel: fees.applicableToLevel,
        applyOnce: fees.applyOnce,
        createdAt: fees.createdAt,
        updatedAt: fees.updatedAt,
      })
      .from(fees)
      .where(whereClause)
      .orderBy(desc(fees.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    return res.json({
      success: true,
      data,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch fees",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Invalid fee id",
      });
    }

    const data = await db
      .select()
      .from(fees)
      .where(eq(fees.id, id));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Fee not found",
      });
    }

    return res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch fee",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = normalizeOptionalText(req.body?.name);
    const description = normalizeOptionalText(req.body?.description);
    const amount = parseMoneyString(req.body?.amount);
    const academicYearId = parsePositiveInt(req.body?.academicYearId);
    const applicableTermId = parseNullablePositiveInt(req.body?.applicableTermId);
    const applicableToLevel = normalizeOptionalText(req.body?.applicableToLevel);
    const applyOnce = parseOptionalBoolean(req.body?.applyOnce) ?? false;
    const feeType = req.body?.feeType;

    console.log("Creating fee with data:", {
      name,
      description,
      amount,
      feeType,
      academicYearId,
      applicableTermId,
      applicableToLevel,
      applyOnce,
    });
    
    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    if (!amount) {
      return res.status(400).json({ success: false, error: "amount is required and must be non-negative" });
    }

    if (!academicYearId) {
      return res.status(400).json({ success: false, error: "academicYearId is required" });
    }

    if (!isFeeType(feeType)) {
      return res.status(400).json({
        success: false,
        error: "feeType must be one of: admission, tuition, feeding, other",
      });
    }

    if (req.body?.applyOnce !== undefined && parseOptionalBoolean(req.body?.applyOnce) === null) {
      return res.status(400).json({
        success: false,
        error: "applyOnce must be a boolean",
      });
    }

    if (applicableTermId === undefined) {
      return res.status(400).json({
        success: false,
        error: "applicableTermId must be a positive integer or null",
      });
    }

    const [academicYear] = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, academicYearId));

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: "academicYearId does not reference an existing academic year",
      });
    }

    if (applicableTermId !== null) {
      const [term] = await db
        .select({ id: terms.id, academicYearId: terms.academicYearId })
        .from(terms)
        .where(eq(terms.id, applicableTermId));

      if (!term) {
        return res.status(400).json({
          success: false,
          error: "applicableTermId does not reference an existing term",
        });
      }

      if (term.academicYearId !== academicYearId) {
        return res.status(400).json({
          success: false,
          error: "applicableTermId must belong to the selected academic year",
        });
      }
    }

    const [createdFee] = await db
      .insert(fees)
      .values({
        name,
        description,
        amount,
        feeType,
        academicYearId,
        applicableTermId,
        applicableToLevel,
        applyOnce,
      })
      .returning();

    if (!createdFee) {
      return res.status(500).json({
        success: false,
        error: "Failed to create fee",
      });
    }

    return res.status(201).json({ success: true, data: createdFee });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to create fee",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid fee id" });
    }

    const [existingFee] = await db
      .select({ id: fees.id, academicYearId: fees.academicYearId, applicableTermId: fees.applicableTermId })
      .from(fees)
      .where(eq(fees.id, id));

    if (!existingFee) {
      return res.status(404).json({ success: false, error: "Fee not found" });
    }

    const updates: {
      name?: string;
      description?: string | null;
      amount?: string;
      feeType?: "admission" | "tuition" | "feeding" | "other";
      academicYearId?: number;
      applicableToLevel?: string | null;
      applicableTermId?: number | null;
      applyOnce?: boolean;
      updatedAt?: Date;
    } = {};

    if (req.body?.name !== undefined) {
      const name = normalizeOptionalText(req.body.name);
      if (!name) {
        return res.status(400).json({ success: false, error: "name cannot be empty" });
      }
      updates.name = name;
    }

    if (req.body?.description !== undefined) {
      updates.description = normalizeOptionalText(req.body.description);
    }

    if (req.body?.amount !== undefined) {
      const amount = parseMoneyString(req.body.amount);
      if (!amount) {
        return res.status(400).json({
          success: false,
          error: "amount must be a non-negative number",
        });
      }
      updates.amount = amount;
    }

    if (req.body?.feeType !== undefined) {
      if (!isFeeType(req.body.feeType)) {
        return res.status(400).json({
          success: false,
          error: "feeType must be one of: admission, tuition, feeding, other",
        });
      }
      updates.feeType = req.body.feeType;
    }

    if (req.body?.academicYearId !== undefined) {
      const academicYearId = parsePositiveInt(req.body.academicYearId);
      if (!academicYearId) {
        return res.status(400).json({
          success: false,
          error: "academicYearId must be a positive integer",
        });
      }

      const [academicYear] = await db
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(eq(academicYears.id, academicYearId));

      if (!academicYear) {
        return res.status(400).json({
          success: false,
          error: "academicYearId does not reference an existing academic year",
        });
      }

      updates.academicYearId = academicYearId;
    }

    if (req.body?.applicableTermId !== undefined) {
      const applicableTermId = parseNullablePositiveInt(req.body.applicableTermId);
      if (applicableTermId === undefined) {
        return res.status(400).json({
          success: false,
          error: "applicableTermId must be a positive integer or null",
        });
      }
      updates.applicableTermId = applicableTermId;
    }

    if (req.body?.applyOnce !== undefined) {
      const applyOnce = parseOptionalBoolean(req.body.applyOnce);
      if (applyOnce === null) {
        return res.status(400).json({
          success: false,
          error: "applyOnce must be a boolean",
        });
      }
      updates.applyOnce = applyOnce;
    }

    if (req.body?.applicableToLevel !== undefined) {
      updates.applicableToLevel = normalizeOptionalText(req.body.applicableToLevel);
    }

    const resolvedAcademicYearId = updates.academicYearId ?? existingFee.academicYearId;
    const resolvedApplicableTermId =
      updates.applicableTermId !== undefined
        ? updates.applicableTermId
        : existingFee.applicableTermId;

    if (resolvedApplicableTermId !== null) {
      const [term] = await db
        .select({ id: terms.id, academicYearId: terms.academicYearId })
        .from(terms)
        .where(eq(terms.id, resolvedApplicableTermId));

      if (!term) {
        return res.status(400).json({
          success: false,
          error: "applicableTermId does not reference an existing term",
        });
      }

      if (term.academicYearId !== resolvedAcademicYearId) {
        return res.status(400).json({
          success: false,
          error: "applicableTermId must belong to the selected academic year",
        });
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        error: "No valid fields were provided for update",
      });
    }

    updates.updatedAt = new Date();

    const [updatedFee] = await db
      .update(fees)
      .set(updates)
      .where(eq(fees.id, id))
      .returning();

    return res.json({ success: true, data: updatedFee ?? null });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to update fee",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid fee id" });
    }

    const [existingFee] = await db
      .select({ id: fees.id })
      .from(fees)
      .where(eq(fees.id, id));

    if (!existingFee) {
      return res.status(404).json({ success: false, error: "Fee not found" });
    }

    await db.delete(fees).where(eq(fees.id, id));

    return res.status(200).json({ success: true, data: {} });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete fee. It may be referenced by student fee records.",
    });
  }
});

export default router;
