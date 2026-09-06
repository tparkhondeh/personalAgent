import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard account boundary", () => {
  const source = readFileSync("src/components/personal-agent-dashboard.tsx", "utf8");
  it("waits for authentication before mounting the guest persistence effects", () => {
    const wrapper = source.split("export function PersonalAgentDashboard()")[1].split("function SessionDashboard")[0];
    expect(wrapper).toContain('if (isPending) return <main className="session-loading"');
    expect(wrapper).toContain('key={session?.user.id ? `user:${session.user.id}` : "guest"}');
    expect(wrapper).not.toContain("localStorage.setItem(");
  });
  it("does not reclassify account data as demo items during sign-out", () => {
    const dashboard = source.split("function SessionDashboard")[1].split("function Assistant")[0];
    expect(dashboard).toContain('session: ReturnType<typeof authClient.useSession>["data"]');
    expect(dashboard).toContain('useState<Item[]>(() => session?.user ? [] : demoItems)');
    expect(dashboard).not.toContain('const { data: session } = authClient.useSession()');
  });
});
