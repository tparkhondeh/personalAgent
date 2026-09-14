import { PersonalAgentDashboard } from "@/components/personal-agent-dashboard";
import { connection } from "next/server";

export default async function Home() {
  // The mutable app shell must not get Next's year-long static CDN lifetime.
  await connection();
  return <PersonalAgentDashboard />;
}
