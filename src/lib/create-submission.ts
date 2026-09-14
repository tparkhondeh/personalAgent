// Memory is scoped to one form/account; no titles or credentials are persisted here.
export function createSubmissionController(newKey: () => string) {
  let key: string | null = null;
  let pending = false;
  let completed = false;
  return {
    begin() { if (pending || completed) return null; pending = true; key ??= newKey(); return key; },
    finish(success: boolean) { pending = false; if (success) completed = true; },
    reset() { if (pending) return false; key = null; completed = false; return true; },
    isPending: () => pending,
  };
}
