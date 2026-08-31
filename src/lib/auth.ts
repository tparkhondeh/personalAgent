import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "@/lib/db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  advanced: { database: { generateId: "uuid" }, useSecureCookies: process.env.NODE_ENV === "production" },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});
