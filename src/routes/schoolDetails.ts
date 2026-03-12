import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { schoolDetails } from "../db/schema";

const router = express.Router();

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

router.get("/", async (_req, res) => {
  try {
    const data = await db.select().from(schoolDetails);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("GET /school-details error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch school details",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (id === null) {
      return res.status(400).json({ success: false, error: "Invalid school details id" });
    }

    const data = await db.select().from(schoolDetails).where(eq(schoolDetails.id, id));

    if (!data.length) {
      return res.status(404).json({ success: false, error: "School details not found" });
    }

    return res.status(200).json({ success: true, data: data[0] });
  } catch (error) {
    console.error("GET /school-details/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch school details",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, address, phone, email, website, logo, discountType, discountAmount } = req.body;

    const existing = await db
      .select({ id: schoolDetails.id })
      .from(schoolDetails)
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: "School details already exist. Please edit the existing record.",
      });
    }

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedAddress = typeof address === "string" ? address.trim() : "";
    const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    const normalizedWebsite =
      typeof website === "string" && website.trim() ? website.trim() : null;
    const normalizedLogo = typeof logo === "string" && logo.trim() ? logo.trim() : null;
    const normalizedDiscountType =
      discountType === "percentage" ? "percentage" : "value";
    const parsedDiscountAmount = Number.parseFloat(String(discountAmount));
    const normalizedDiscountAmount = Number.isFinite(parsedDiscountAmount)
      ? String(Math.max(0, parsedDiscountAmount))
      : "0";

    if (!normalizedName || !normalizedAddress || !normalizedPhone || !normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: "name, address, phone and email are required",
      });
    }

    const [created] = await db
      .insert(schoolDetails)
      .values({
        name: normalizedName,
        address: normalizedAddress,
        phone: normalizedPhone,
        email: normalizedEmail,
        website: normalizedWebsite,
        logo: normalizedLogo,
        discountType: normalizedDiscountType,
        discountAmount: normalizedDiscountAmount,
      })
      .returning();

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("POST /school-details error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (id === null) {
      return res.status(400).json({ success: false, error: "Invalid school details id" });
    }

    const { name, address, phone, email, website, logo, discountType, discountAmount } = req.body;

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedAddress = typeof address === "string" ? address.trim() : "";
    const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    const normalizedWebsite =
      typeof website === "string" && website.trim() ? website.trim() : null;
    const normalizedLogo = typeof logo === "string" && logo.trim() ? logo.trim() : null;
    const normalizedDiscountType =
      discountType === "percentage" ? "percentage" : "value";
    const parsedDiscountAmount = Number.parseFloat(String(discountAmount));
    const normalizedDiscountAmount = Number.isFinite(parsedDiscountAmount)
      ? String(Math.max(0, parsedDiscountAmount))
      : "0";

    if (!normalizedName || !normalizedAddress || !normalizedPhone || !normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: "name, address, phone and email are required",
      });
    }

    const existing = await db
      .select({ id: schoolDetails.id })
      .from(schoolDetails)
      .where(eq(schoolDetails.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "School details not found" });
    }

    const [updated] = await db
      .update(schoolDetails)
      .set({
        name: normalizedName,
        address: normalizedAddress,
        phone: normalizedPhone,
        email: normalizedEmail,
        website: normalizedWebsite,
        logo: normalizedLogo,
        discountType: normalizedDiscountType,
        discountAmount: normalizedDiscountAmount,
        updatedAt: new Date(),
      })
      .where(eq(schoolDetails.id, id))
      .returning();

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /school-details/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (id === null) {
      return res.status(400).json({ success: false, error: "Invalid school details id" });
    }

    const existing = await db
      .select({ id: schoolDetails.id })
      .from(schoolDetails)
      .where(eq(schoolDetails.id, id));

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "School details not found" });
    }

    await db.delete(schoolDetails).where(eq(schoolDetails.id, id));

    return res.status(200).json({ success: true, message: "School details deleted successfully" });
  } catch (error) {
    console.error("DELETE /school-details/:id error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
