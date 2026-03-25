import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import nodemailer from "nodemailer";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { z } from "zod";

const secret = process.env.BETTER_AUTH_SECRET!;
const frontendUrls = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => Boolean(origin));
const authBaseUrl =
  process.env.BETTER_AUTH_URL
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "") || "http://localhost:8000/api/auth";
const RoleEnum = z.enum(["staff", "teacher", "admin"]);

if (!secret) throw new Error("BETTER_AUTH_SECRET is not set in the .env file");
if (!frontendUrls.length) throw new Error("FRONTEND_URL is not set in the .env file");

const isProduction = process.env.NODE_ENV === "production";
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

const hasSmtpConfig = Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 10000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 10000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 15000),
    })
  : null;

const escapeHtml = (str: string) =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

const sendResetPasswordEmail = async (user: { email: string; name?: string | null }, url: string) => {
  if (!hasSmtpConfig || !transporter) {
    const message =
      "[auth] SMTP is not configured. Reset email was not sent. Use this link in development:";

    if (isProduction) {
      throw new Error("SMTP is not configured. Please set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM.");
    }

    console.warn(message, { email: user.email, resetUrl: url });
    return;
  }

  try {
    await transporter.sendMail({
      from: smtpFrom,
      to: user.email,
      subject: "Reset your password",
      html: `
        <p>Hello ${escapeHtml(user.name ?? "there")},</p>
        <p>Click the link below to reset your password. The link expires in 1 hour.</p>
        <p><a href="${escapeHtml(url)}">Reset Password</a></p>
        <p>If you did not request a password reset, you can ignore this email.</p>
      `,
    });
  } catch (error) {
    console.error("[auth] Failed to send reset password email", {
      email: user.email,
      error,
    });

    if (isProduction) {
      throw error;
    }

    console.warn("[auth] Falling back to reset link in development", {
      email: user.email,
      resetUrl: url,
    });
  }
};

export const auth = betterAuth({
  secret,
  baseURL: authBaseUrl,
  trustedOrigins: frontendUrls,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user, url);
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "staff",
        validator: { input: RoleEnum },
      },
      imageCldPubId: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
});
