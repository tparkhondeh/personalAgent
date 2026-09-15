import { LoginForm } from "@/components/login-form";
import { auth } from "@/lib/auth";
import { loginReturnTo } from "@/lib/login-redirect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  await connection();
  const session = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (session?.user) redirect(loginReturnTo((await searchParams).returnTo));
  return <LoginForm />;
}
