import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { z } from "zod";

const secret = process.env.BETTER_AUTH_SECRET!;
const frontendUrl = process.env.FRONTEND_URL!;
const RoleEnum = z.enum(["student", "teacher", "admin"]);

if (!secret) throw new Error("BETTER_AUTH_SECRET is not set in the .env file");
if (!frontendUrl) throw new Error("FRONTEND_URL is not set in the .env file");

export const auth = betterAuth({
  secret,
  baseURL: frontendUrl,
  trustedOrigins: [frontendUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "student",
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
