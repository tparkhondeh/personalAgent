// Only implemented dashboard destinations, with opaque item IDs and no free text.
export function safePushPath(value: unknown): string {
  return typeof value === "string" && /^(?:\/|\/\?view=tasks(?:&taskId=[a-zA-Z0-9_-]{1,128})?|\/\?view=calendar(?:&meetingId=[a-zA-Z0-9_-]{1,128})?)$/.test(value) ? value : "/";
}

export function selectPushTarget<T extends { id: string; source: string; done: boolean }>(search: string, ownedItems: readonly T[]): T | undefined {
  if (safePushPath(`/${search}`) === "/") return undefined;
  const params = new URLSearchParams(search);
  const source = params.get("view") === "calendar" ? "meeting" : "task";
  const id = params.get(source === "meeting" ? "meetingId" : "taskId");
  return ownedItems.find(item => item.id === id && item.source === source && !item.done);
}
