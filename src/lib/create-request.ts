import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export class CreateRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function createRequestIdentity(key: string | null, userId: string, kind: "Task" | "Meeting", payload: unknown) {
  // Old clients remain compatible; new clients retain a key across uncertain retries.
  if (key === null) return null;
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new CreateRequestError(422, "شناسه ثبت معتبر نیست.");
  return { id: `create:${hash(JSON.stringify([userId, key]))}`, userId, kind, digest: hash(canonical(payload)) };
}

export async function createExactlyOnce<T extends { id: string }>(
  database: Pick<PrismaClient, "$transaction">,
  identity: ReturnType<typeof createRequestIdentity>,
  create: (tx: Prisma.TransactionClient) => Promise<T>,
  find: (tx: Prisma.TransactionClient, id: string) => Promise<T | null>,
): Promise<T> {
  const operation = () => database.$transaction(async tx => {
    if (identity) {
      const receipt = await tx.auditLog.findUnique({ where: { id: identity.id } });
      if (receipt) {
        if (receipt.userId !== identity.userId || receipt.entityType !== identity.kind || receipt.input !== identity.digest)
          throw new CreateRequestError(409, "نتیجه ثبت قبلی را بررسی کن؛ جزئیات این تلاش با آن متفاوت است.");
        const record = receipt.entityId ? await find(tx, receipt.entityId) : null;
        if (!record) throw new CreateRequestError(409, "این درخواست قبلاً ثبت شده و مورد آن دیگر موجود نیست؛ فهرست را بررسی کن.");
        return record;
      }
    }
    const record = await create(tx);
    if (identity) await tx.auditLog.create({ data: { id: identity.id, userId: identity.userId, action: "CREATE_REQUEST_CONFIRMED", entityType: identity.kind, entityId: record.id, input: identity.digest } });
    return record;
  });
  try { return await operation(); }
  catch (error) {
    // A competing transaction's unique receipt rolls back *all* work in this one.
    if (identity && error && typeof error === "object" && "code" in error && error.code === "P2002") return operation();
    throw error;
  }
}

export function createFailure(error: unknown) {
  return Response.json({ error: error instanceof CreateRequestError ? error.message : "نتیجه ثبت مشخص نشد؛ همین فرم را بدون تغییر دوباره ثبت کن." }, { status: error instanceof CreateRequestError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
