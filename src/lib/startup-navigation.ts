export type DashboardView = "today" | "tasks" | "calendar" | "assistant" | "settings";

// Launch destination only: never read/write storage or open/clear an editor.
// Explicit, supported links win; an ordinary app launch always opens Tasks.
export function initialDashboardView(search = ""): DashboardView {
  const values = new URLSearchParams(search).getAll("view");
  if (values.length !== 1) return "tasks";
  switch (values[0]) {
    case "today": case "tasks": case "calendar": case "assistant": case "settings":
      return values[0];
    default: return "tasks";
  }
}
