// Private, device-local poems. Never merge account namespaces or modify the Rumi collection.
type PoemStorage = Pick<Storage, "getItem" | "setItem">;
export type PersonalPoem = { version: 1; day: string; lines: string[]; active: boolean };
export function validatePersonalPoem(lines: unknown): string[] | null {
  if (!Array.isArray(lines) || lines.length !== 4) return null;
  const normalized = lines.map(line => typeof line === "string" ? line.normalize("NFC").trim() : "");
  return normalized.every(line => line.length > 0 && [...line].length <= 200 && !/[\r\n\u0000-\u001f\u007f]/.test(line)) ? normalized : null;
}
export function personalPoemStore(storage: PoemStorage, scope: string, day: string) {
  if (!scope || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid poem namespace");
  const key = `tia.personal-poem.v1:${encodeURIComponent(scope)}:${day}`;
  let observed: string | null | undefined;
  let readable = false;
  let snapshot: PersonalPoem | null = null;
  function read(): PersonalPoem | null {
    readable = false;
    observed = storage.getItem(key);
    if (observed === null) { readable = true; snapshot = null; return null; }
    if (observed.length > 16000) throw new Error("Unreadable saved poem");
    const value = JSON.parse(observed);
    if (value?.version !== 1 || value.day !== day || typeof value.active !== "boolean" || !validatePersonalPoem(value.lines)) throw new Error("Unreadable saved poem");
    readable = true; snapshot = value; return value;
  }
  function save(lines: string[], active = true) {
    const valid = validatePersonalPoem(lines);
    if (!valid || !readable || observed === undefined || storage.getItem(key) !== observed) throw new Error("Poem changed or cannot be saved");
    const value: PersonalPoem = { version: 1, day, lines: valid, active };
    const encoded = JSON.stringify(value);
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) throw new Error("Poem was not persisted");
    observed = encoded; snapshot = value;
    return value;
  }
  return { read, save, deactivate() { if (snapshot) return save(snapshot.lines, false); return null; } };
}

// One editor for React and the bundled offline shell; all user text goes through text nodes.
export function mountPersonalPoemEditor(host: HTMLElement, options: {
  storage: PoemStorage; scope: string; day: () => string; onChange: (lines: string[] | null) => void;
}) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "poem-next poem-add";
  button.textContent = "+"; button.title = "شعر خودم"; button.setAttribute("aria-label", "افزودن یا ویرایش شعر امروز");
  host.append(button);
  const dialog = document.createElement("dialog"); dialog.className = "personal-poem-dialog";
  dialog.setAttribute("aria-label", "شعر خودم برای امروز");
  const form = document.createElement("form"); form.className = "personal-poem-form";
  const heading = document.createElement("h2"); heading.textContent = "شعر خودم برای امروز";
  const note = document.createElement("p"); note.textContent = "فقط روی همین دستگاه ذخیره می‌شود؛ فردا شعر روز برمی‌گردد.";
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const preview = document.createElement("div"); preview.className = "poem-row";
  const poem = document.createElement("div"); poem.className = "daily-poem"; poem.setAttribute("aria-label", "پیش‌نمایش شعر خودم"); preview.append(poem);
  const fields = ["مصراع اول", "مصراع دوم", "مصراع سوم", "مصراع چهارم"].map(text => {
    const label = document.createElement("label"), input = document.createElement("input");
    label.textContent = text; input.required = true; input.maxLength = 200; input.autocomplete = "off"; label.append(input);
    input.addEventListener("input", () => {
      const lines = fields.map(({ input }) => input.value);
      poem.replaceChildren(...[0, 2].map(i => {
        const row = document.createElement("span"); row.className = "poem-couplet";
        for (const text of lines.slice(i, i + 2)) { const span = document.createElement("span"); span.textContent = text; row.append(span); }
        return row;
      }));
    });
    return { label, input };
  });
  const save = document.createElement("button"); save.type = "submit"; save.textContent = "ثبت شعر امروز"; save.className = "submit-button primary";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "انصراف"; cancel.onclick = () => dialog.close();
  const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "بازگشت به شعر روز";
  const actions = document.createElement("div"); actions.className = "personal-poem-actions"; actions.append(save, cancel, reset);
  form.append(heading, note, ...fields.map(f => f.label), preview, status, actions); dialog.append(form); document.body.append(dialog);
  let openedDay = "", store: ReturnType<typeof personalPoemStore> | undefined;
  const refresh = () => {
    try { const value = personalPoemStore(options.storage, options.scope, options.day()).read(); options.onChange(value?.active ? value.lines : null); }
    catch { options.onChange(null); }
  };
  const fail = () => { status.textContent = "ذخیره نشد؛ شعر قبلی حفظ شده. پنجره را ببند و دوباره باز کن."; };
  button.onclick = () => {
    openedDay = options.day(); status.textContent = ""; save.disabled = reset.disabled = false;
    try {
      store = personalPoemStore(options.storage, options.scope, openedDay); const value = store.read();
      fields.forEach((f, i) => { f.input.value = value?.lines[i] || ""; }); reset.disabled = !value?.active;
    } catch { fields.forEach(f => { f.input.value = ""; }); save.disabled = reset.disabled = true; fail(); }
    fields[0].input.dispatchEvent(new Event("input")); dialog.showModal(); fields[0].input.focus();
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (openedDay !== options.day()) { status.textContent = "روز تغییر کرده؛ پنجره را دوباره باز کن."; return; }
    try { store!.save(fields.map(f => f.input.value)); refresh(); dialog.close(); } catch { fail(); }
  };
  reset.onclick = () => {
    if (openedDay !== options.day()) { fail(); return; }
    try { store!.deactivate(); refresh(); dialog.close(); } catch { fail(); }
  };
  const visibility = () => { if (!document.hidden) refresh(); };
  const timer = window.setInterval(refresh, 30000);
  window.addEventListener("storage", refresh); document.addEventListener("visibilitychange", visibility);
  refresh();
  return { poem, refresh, useDaily() {
    try { const current = personalPoemStore(options.storage, options.scope, options.day()); current.read(); current.deactivate(); refresh(); return true; }
    catch { button.click(); fail(); return false; }
  }, dispose() { clearInterval(timer); window.removeEventListener("storage", refresh); document.removeEventListener("visibilitychange", visibility); dialog.close(); dialog.remove(); button.remove(); } };
}
