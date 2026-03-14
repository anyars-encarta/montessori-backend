import express from "express";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { classSubjects, continuousAssessments, staffSubjects, subjects } from "../db/schema";

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

router.get("/", async (req, res) => {
  try {
    const currentPage = Math.max(1, parsePositiveInt(req.query.page) ?? 1);
    const limitPerPage = Math.min(Math.max(1, parsePositiveInt(req.query.limit) ?? 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const codeFilter = typeof req.query.code === "string" ? req.query.code.trim() : "";

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
          ilike(subjects.description, `%${search}%`),
        ),
      );
    }

    if (codeFilter) {
      conditions.push(ilike(subjects.code, `%${codeFilter}%`));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(whereClause);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total ? Math.ceil(total / limitPerPage) : 0;

    const data = await db
      .select()
      .from(subjects)
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
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
      error: "Failed to fetch subjects",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Invalid subject id",
      });
    }

    const data = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, id));
    
    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Subject not found",
      });
    }

    return res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch subject",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = normalizeOptionalText(req.body?.name);
    const code = normalizeOptionalText(req.body?.code)?.toUpperCase();
    const description = normalizeOptionalText(req.body?.description);
    const cloudinaryImageUrl = normalizeOptionalText(req.body?.cloudinaryImageUrl);
    const imageCldPubId = normalizeOptionalText(req.body?.imageCldPubId);

    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    if (code) {
      const existingWithCode = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.code, code));

      if (existingWithCode.length) {
        return res.status(409).json({
          success: false,
          error: "A subject with this code already exists",
        });
      }
    }

    const [createdSubject] = await db
      .insert(subjects)
      .values({
        name,
        code,
        description,
        cloudinaryImageUrl,
        imageCldPubId,
      })
      .returning();

    if (!createdSubject) {
      return res.status(500).json({
        success: false,
        error: "Failed to create subject",
      });
    }

    return res.status(201).json({ success: true, data: createdSubject });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to create subject",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid subject id" });
    }

    const [existingSubject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.id, id));

    if (!existingSubject) {
      return res.status(404).json({ success: false, error: "Subject not found" });
    }

    const updates: {
      name?: string;
      code?: string | null;
      description?: string | null;
      cloudinaryImageUrl?: string | null;
      imageCldPubId?: string | null;
      updatedAt?: Date;
    } = {};

    if (req.body?.name !== undefined) {
      const name = normalizeOptionalText(req.body.name);
      if (!name) {
        return res.status(400).json({ success: false, error: "name cannot be empty" });
      }
      updates.name = name;
    }

    if (req.body?.code !== undefined) {
      const code = normalizeOptionalText(req.body.code)?.toUpperCase() ?? null;

      if (code) {
        const existingWithCode = await db
          .select({ id: subjects.id })
          .from(subjects)
          .where(and(eq(subjects.code, code), ne(subjects.id, id)));

        if (existingWithCode.length) {
          return res.status(409).json({
            success: false,
            error: "A subject with this code already exists",
          });
        }
      }

      updates.code = code;
    }

    if (req.body?.description !== undefined) {
      updates.description = normalizeOptionalText(req.body.description);
    }

    if (req.body?.cloudinaryImageUrl !== undefined) {
      updates.cloudinaryImageUrl = normalizeOptionalText(req.body.cloudinaryImageUrl);
    }

    if (req.body?.imageCldPubId !== undefined) {
      updates.imageCldPubId = normalizeOptionalText(req.body.imageCldPubId);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        error: "No valid fields were provided for update",
      });
    }

    updates.updatedAt = new Date();

    const [updatedSubject] = await db
      .update(subjects)
      .set(updates)
      .where(eq(subjects.id, id))
      .returning();

    return res.json({ success: true, data: updatedSubject ?? null });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to update subject",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Invalid subject id" });
    }

    const [existingSubject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.id, id));

    if (!existingSubject) {
      return res.status(404).json({ success: false, error: "Subject not found" });
    }

    const [classSubjectCount, staffSubjectCount, assessmentCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(classSubjects)
        .where(eq(classSubjects.subjectId, id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(staffSubjects)
        .where(eq(staffSubjects.subjectId, id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(continuousAssessments)
        .where(eq(continuousAssessments.subjectId, id)),
    ]);

    const linkedCount =
      Number(classSubjectCount[0]?.count ?? 0) +
      Number(staffSubjectCount[0]?.count ?? 0) +
      Number(assessmentCount[0]?.count ?? 0);

    if (linkedCount > 0) {
      return res.status(409).json({
        success: false,
        error: "Cannot delete subject because it is already linked to classes, staff, or assessments",
      });
    }

    await db.delete(subjects).where(eq(subjects.id, id));

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete subject",
    });
  }
});

export default router;
