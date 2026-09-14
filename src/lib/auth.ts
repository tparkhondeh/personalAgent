import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "@/lib/db";
import { after } from "next/server";
import { recoveryConfiguration, recoveryPasswordPolicy } from "@/lib/recovery-policy";
import { sendRecoveryEmail } from "@/lib/recovery-email";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { ...recoveryPasswordPolicy, ...(recoveryConfiguration(process.env) ? {
    sendResetPassword: ({ user, token }: { user: { id: string; email: string }; token: string }) => { after(() => sendRecoveryEmail(user, token)); return Promise.resolve(); },
  } : {}) },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/request-password-reset": { window: 60 * 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
  advanced: { database: { generateId: "uuid" }, useSecureCookies: process.env.NODE_ENV === "production" },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});
