import express from "express";
import { eq } from "drizzle-orm";
import { db } from '../db/index.js';
import { parents } from '../db/schema/index.js';

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

router.get("/", async (req, res) => {
  try {
    const data = await db
      .select()
      .from(parents)
      .orderBy(parents.firstName, parents.lastName);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch parents",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await db
      .select()
      .from(parents)
      .where(eq(parents.id, parseInt(id)))
      .orderBy(parents.firstName, parents.lastName);

    if (!data.length) {
      return res.status(404).json({
        success: false,
        error: "Parent not found",
      });
    }

    res.json({
      success: true,
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch parent",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, occupation, address } = req.body;

    const trimmedFirstName =
      typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLastName = typeof lastName === "string" ? lastName.trim() : "";
    const normalizedEmail =
      typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : null;
    const normalizedPhone =
      typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const normalizedOccupation =
      typeof occupation === "string" && occupation.trim()
        ? occupation.trim()
        : null;
    const normalizedAddress =
      typeof address === "string" && address.trim() ? address.trim() : null;

    if (!trimmedFirstName) {
      return res
        .status(400)
        .json({ success: false, error: "firstName is required" });
    }

    if (!trimmedLastName) {
      return res
        .status(400)
        .json({ success: false, error: "lastName is required" });
    }

    const [createdParent] = await db
      .insert(parents)
      .values({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: normalizedEmail,
        phone: normalizedPhone,
        occupation: normalizedOccupation,
        address: normalizedAddress,
      })
      .returning();

    if (!createdParent) {
      return res.status(400).json({
        success: false,
        error: "Failed to create parent",
      });
    }

    return res.status(201).json({
      success: true,
      data: createdParent,
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "A parent with this email already exists",
      });
    }

    console.error("POST /parents error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parentId = parsePositiveInt(req.params.id);
    const { firstName, lastName, email, phone, occupation, address } = req.body;

    if (parentId === null) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid parent id" });
    }

    const trimmedFirstName =
      typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLastName = typeof lastName === "string" ? lastName.trim() : "";
    const normalizedEmail =
      typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : null;
    const normalizedPhone =
      typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const normalizedOccupation =
      typeof occupation === "string" && occupation.trim()
        ? occupation.trim()
        : null;
    const normalizedAddress =
      typeof address === "string" && address.trim() ? address.trim() : null;

    if (!trimmedFirstName) {
      return res
        .status(400)
        .json({ success: false, error: "firstName is required" });
    }

    if (!trimmedLastName) {
      return res
        .status(400)
        .json({ success: false, error: "lastName is required" });
    }

    const existingParent = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.id, parentId));

    if (!existingParent.length) {
      return res
        .status(404)
        .json({ success: false, error: "Parent not found" });
    }

    const [updatedParent] = await db
      .update(parents)
      .set({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: normalizedEmail,
        phone: normalizedPhone,
        occupation: normalizedOccupation,
        address: normalizedAddress,
        updatedAt: new Date(),
      })
      .where(eq(parents.id, parentId))
      .returning();

    return res.status(200).json({
      success: true,
      data: updatedParent,
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "A parent with this email already exists",
      });
    }

    console.error("PUT /parents/:id error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const parentId = parsePositiveInt(req.params.id);

    if (parentId === null) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid parent id" });
    }

    const existingParent = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.id, parentId));

    if (!existingParent.length) {
      return res
        .status(404)
        .json({ success: false, error: "Parent not found" });
    }

    await db.delete(parents).where(eq(parents.id, parentId));

    return res.status(200).json({
      success: true,
      message: "Parent deleted successfully",
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23503") {
      return res.status(409).json({
        success: false,
        error: "Cannot delete parent because related records exist",
      });
    }

    console.error("DELETE /parents/:id error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
