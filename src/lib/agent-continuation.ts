import type { Plan } from "./agent-planner";

// Editing a pending creation is not UPDATE of a persisted item. Only repair this
// exact mismatch when the local intent agrees and neither path names a target.
// Real updates/deletions, entity changes and ambiguous target selection remain
// subject to the existing ownership, validation and explicit-approval gates.
export function reviewModelContinuation(plan: Plan | null, previous: Plan | null, local: Plan | null): Plan | null {
  if (plan?.operation === "UPDATE" && !plan.targetId && previous?.operation === "CREATE" && !previous.targetId &&
      local?.operation === "CREATE" && !local.targetId && plan.entity === previous.entity && local.entity === previous.entity) {
    return { ...plan, operation: "CREATE", targetUpdatedAt: null };
  }
  return plan;
}
