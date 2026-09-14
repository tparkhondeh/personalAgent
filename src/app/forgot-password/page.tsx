import { RecoveryForm } from "@/components/recovery-form";
import { connection } from "next/server";

export default async function ForgotPasswordPage() {
  await connection();
  return <RecoveryForm />;
}
