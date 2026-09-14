import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";
import { recoveryConfiguration, validRecoveryDestination } from "./recovery-policy";

export async function sendRecoveryEmail(user: { id: string; email: string }, token: string) {
  const config = recoveryConfiguration(process.env);
  // Fragments do not enter HTTP access logs; the POST body still uses the auth library.
  const url = config ? `${config.origin}/reset-password#token=${token}` : "";
  if (!config || !validRecoveryDestination(config.origin, user.email, url)) return;
  let reservation: string | undefined;
  try {
    reservation = await db.$transaction(async tx => {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const where = { action: "RECOVERY_EMAIL_RESERVED", createdAt: { gte: start } };
      if (await tx.auditLog.count({ where }) >= config.cap || await tx.auditLog.count({ where: { ...where, userId: user.id } }) >= 3) return undefined;
      return (await tx.auditLog.create({ data: { userId: user.id, action: "RECOVERY_EMAIL_RESERVED", entityType: "Account", status: "PENDING" } })).id;
    });
    if (!reservation) return;
    const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, requireTLS: true, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: config.host }, auth: { user: config.user, pass: config.password }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000, dnsTimeout: 8000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
    try {
      await transport.sendMail({ from: { name: "tia", address: config.from }, to: { address: user.email, name: "" }, subject: "بازیابی رمز tia", text: `برای انتخاب رمز تازه، این لینک را تا ۱۵ دقیقه باز کن:\n${url}\nاگر درخواست ندادی، این پیام را نادیده بگیر.`, disableFileAccess: true, disableUrlAccess: true });
    } finally { transport.close(); }
    await db.auditLog.update({ where: { id: reservation }, data: { status: "SUCCEEDED" } });
  } catch {
    // Never log SMTP errors, email addresses or password-reset URLs/tokens.
    if (reservation) await db.auditLog.update({ where: { id: reservation }, data: { status: "FAILED" } }).catch(() => {});
    console.warn("Account recovery delivery was not confirmed; inspect the private audit status.");
  }
}
