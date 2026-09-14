import { RecoveryForm } from "@/components/recovery-form";
import { connection } from "next/server";

export default async function ResetPasswordPage() {
  await connection();
  return <RecoveryForm reset />;
}
