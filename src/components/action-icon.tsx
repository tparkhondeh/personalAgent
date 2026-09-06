export function ActionIcon({ name }: { name: "settings" | "bell" | "plus" }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === "plus" ? <path d="M12 5v14M5 12h14" /> : name === "bell" ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></> : <><path d="m10 3-1 3-3 1-3-1-1 4 3 2v3l-1 2 3 3 3-1 2 2 4-1 1-3 3-1 1-4-3-2V7l-3-3-3 1Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>;
}
