import { LoginForm } from "@/components/login-form";
import { connection } from "next/server";

export default async function LoginPage() {
  await connection();
  return <LoginForm />;
}
