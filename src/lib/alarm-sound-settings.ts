import { ALARM_SOUNDS, isAlarmSoundId, type createAlarmSoundController } from "./alarm-sounds";

// The exact same controls mount inside React settings and the bundled offline page.
export function mountAlarmSoundSettings(root: HTMLElement, controller: ReturnType<typeof createAlarmSoundController>) {
  let disposed = false;
  let available = false;
  const doc = root.ownerDocument;
  const section = doc.createElement("section");
  section.className = "appearance-setting";
  section.dir = "rtl";
  section.setAttribute("aria-label", "صدای زنگ این دستگاه");
  const title = doc.createElement("strong");
  title.textContent = "صدای زنگ این دستگاه";
  const label = doc.createElement("label");
  label.textContent = "انتخاب صدا ";
  const select = doc.createElement("select");
  select.setAttribute("aria-label", "انتخاب صدای زنگ");
  select.style.minHeight = "44px";
  for (const sound of ALARM_SOUNDS) {
    const option = doc.createElement("option"); option.value = sound.id; option.textContent = sound.label; select.append(option);
  }
  label.append(select);
  const buttons = doc.createElement("div");
  buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
  const button = (text: string) => {
    const node = doc.createElement("button"); node.type = "button"; node.textContent = text; node.style.minHeight = "44px"; buttons.append(node); return node;
  };
  const preview = button("شنیدن نمونه");
  const stop = button("توقف نمونه");
  const settings = button("بلندی صدا در تنظیمات گوشی");
  const help = doc.createElement("p");
  help.style.cssText = "font-size:0.875rem;line-height:1.8";
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  section.append(title, label, buttons, help, status);
  root.append(section);
  const disable = (value: boolean) => { select.disabled = value; preview.disabled = value; settings.disabled = value; stop.disabled = value; };
  disable(true);
  const failure = () => { if (!disposed) status.textContent = "این کار انجام نشد؛ دوباره تلاش کنید یا تنظیمات صدای گوشی را باز کنید."; };
  async function read() {
    try {
      const state = await controller.read();
      if (disposed) return;
      select.value = state.soundId; help.textContent = state.message;
      available = state.mode !== "legacy";
      disable(!available); settings.hidden = state.mode !== "android";
    } catch { if (!disposed) { disable(true); status.textContent = "انتخاب ذخیره‌شده قابل خواندن نیست؛ دوباره صفحه را باز کنید."; } }
  }
  select.addEventListener("change", async () => {
    if (!available || !isAlarmSoundId(select.value)) return;
    disable(true);
    try {
      await controller.stopPreview();
      await controller.save(select.value);
      if (!disposed) status.textContent = "انتخاب صدا روی این دستگاه ذخیره شد؛ زنگ‌های قبلی تغییر نکردند.";
    } catch { failure(); }
    await read();
  });
  preview.addEventListener("click", () => {
    if (available && isAlarmSoundId(select.value)) {
      status.textContent = "نمونه کوتاه با بلندی صدای فعلی پخش می‌شود.";
      void controller.preview(select.value).catch(failure);
    }
  });
  stop.addEventListener("click", () => { void controller.stopPreview().catch(failure); });
  settings.addEventListener("click", () => { void controller.openSoundSettings().catch(failure); });
  const hide = () => { if (doc.visibilityState !== "visible") void controller.stopPreview().catch(() => {}); };
  const pagehide = () => { void controller.stopPreview().catch(() => {}); };
  doc.addEventListener("visibilitychange", hide);
  doc.defaultView?.addEventListener("pagehide", pagehide);
  void read();
  return () => {
    disposed = true;
    doc.removeEventListener("visibilitychange", hide);
    doc.defaultView?.removeEventListener("pagehide", pagehide);
    void controller.stopPreview().catch(() => {});
    section.remove();
  };
}
