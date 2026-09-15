// Generated from shared alarm sources; do not edit.
window.HamrahAlarmSounds=(()=>{
// Import-free: also compiled into the bundled/offline alarm helper.
const ALARM_SOUNDS = [
    { id: "dawn", label: "سپیده", file: "tia_alarm_dawn_v1.wav" },
    { id: "chime", label: "آوای آرام", file: "tia_alarm_chime_v1.wav" },
    { id: "pulse", label: "ضرب‌آهنگ", file: "tia_alarm_pulse_v1.wav" },
];
const DEFAULT_ALARM_SOUND = "dawn";
const ALARM_SOUND_STORAGE_KEY = "tia.alarm-sound.v1";
const ALARM_SOUND_HELP = "انتخاب صدا فقط برای زنگ‌های جدید این دستگاه است؛ زمان و صدای زنگ‌های قبلی حفظ می‌شود. بلندی زنگ و اعلان جداست و حالت مزاحم نشوید رعایت می‌شود.";
const LEGACY_ALARM_SOUND_HELP = "این نسخه اپ قابلیت انتخاب صدای زنگ و بازکردن تنظیمات صدا را ندارد؛ زنگ‌های جدید با صدای قبلی تنظیم می‌شوند. بلندی صدا را از تنظیمات خود گوشی تغییر دهید.";
const WEB_ALARM_SOUND_HELP = "در مرورگر فقط نمونه صدا پخش و انتخاب همین مرورگر ذخیره می‌شود؛ صدای زنگ گوشی از داخل اپ اندروید تنظیم می‌شود.";
function isAlarmSoundId(value) {
    return ALARM_SOUNDS.some(sound => sound.id === value);
}
function alarmSound(value) {
    return ALARM_SOUNDS.find(sound => sound.id === value) ?? ALARM_SOUNDS[0];
}
function alarmSoundChannelId(id) { return `tia-alarm-v1-${id}`; }
function createAlarmSoundController(env) {
    let audio;
    let previewVersion = 0;
    let previewQueue = Promise.resolve();
    function enqueuePreview(action) {
        const next = previewQueue.then(action);
        previewQueue = next.catch(() => { });
        return next;
    }
    function stopWebPreview() {
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio = undefined;
        }
    }
    return {
        async read() {
            if (env.native) {
                if (env.plugin) {
                    const result = await env.plugin.getSelection();
                    if (!isAlarmSoundId(result.soundId))
                        throw new Error("انتخاب صدای دستگاه معتبر نیست.");
                    return { soundId: result.soundId, mode: "android", message: ALARM_SOUND_HELP };
                }
                return { soundId: DEFAULT_ALARM_SOUND, mode: "legacy", message: LEGACY_ALARM_SOUND_HELP };
            }
            // Storage failures stay visible; do not replace unreadable saved data.
            if (!env.storage)
                throw new Error("حافظه انتخاب صدا در دسترس نیست.");
            const stored = env.storage.getItem(ALARM_SOUND_STORAGE_KEY);
            if (stored !== null && !isAlarmSoundId(stored))
                throw new Error("انتخاب صدای ذخیره‌شده قابل خواندن نیست.");
            return { soundId: stored ?? DEFAULT_ALARM_SOUND, mode: "web", message: WEB_ALARM_SOUND_HELP };
        },
        async save(soundId) {
            if (!isAlarmSoundId(soundId))
                throw new Error("صدای انتخاب‌شده معتبر نیست.");
            if (env.native) {
                if (!env.plugin)
                    throw new Error(LEGACY_ALARM_SOUND_HELP);
                const saved = await env.plugin.setSelection({ soundId });
                if (saved.soundId !== soundId)
                    throw new Error("انتخاب صدا ذخیره نشد.");
            }
            else {
                if (!env.storage)
                    throw new Error("حافظه انتخاب صدا در دسترس نیست.");
                env.storage.setItem(ALARM_SOUND_STORAGE_KEY, soundId);
                if (env.storage.getItem(ALARM_SOUND_STORAGE_KEY) !== soundId)
                    throw new Error("انتخاب صدا ذخیره نشد.");
            }
            // No preview, scheduling, permission request or channel mutation on save.
        },
        preview(soundId) {
            if (!isAlarmSoundId(soundId))
                return Promise.reject(new Error("صدای انتخاب‌شده معتبر نیست."));
            const version = ++previewVersion;
            stopWebPreview();
            return enqueuePreview(async () => {
                if (version !== previewVersion)
                    return;
                if (env.native) {
                    if (!env.plugin)
                        throw new Error(LEGACY_ALARM_SOUND_HELP);
                    await env.plugin.preview({ soundId });
                }
                else {
                    if (!env.createAudio)
                        throw new Error("پخش نمونه صدا در دسترس نیست.");
                    audio = env.createAudio(`${env.assetBase ?? "/alarm-sounds/"}${alarmSound(soundId).file}`);
                    await audio.play();
                }
            });
        },
        stopPreview() {
            ++previewVersion;
            stopWebPreview();
            return enqueuePreview(async () => { if (env.native && env.plugin)
                await env.plugin.stopPreview(); });
        },
        async openSoundSettings() {
            if (!env.native || !env.plugin)
                throw new Error(env.native ? LEGACY_ALARM_SOUND_HELP : WEB_ALARM_SOUND_HELP);
            await env.plugin.openSoundSettings();
        },
    };
}
// Missing plugins retain the exact legacy channel; never invent a working alarm stream.
async function prepareDeviceAlarmChannel(plugin, ensureLegacy, legacyChannelId) {
    if (plugin) {
        // A present but failing plugin is an error, not silent success with another sound.
        const result = await plugin.ensureChannel();
        if (!isAlarmSoundId(result.soundId) || result.channelId !== alarmSoundChannelId(result.soundId)) {
            throw new Error("کانال صدای زنگ معتبر نیست.");
        }
        return { channelId: result.channelId, sound: alarmSound(result.soundId).file, legacySound: false };
    }
    await ensureLegacy();
    return { channelId: legacyChannelId, sound: "urgent_alarm.wav", legacySound: true };
}
function createDeviceAlarmScheduler(port) {
    let generation = 0;
    let queue = Promise.resolve();
    const now = port.now ?? Date.now;
    const enqueue = (action) => {
        const next = queue.then(action);
        queue = next.catch(() => { });
        return next;
    };
    const cancelOwned = async () => {
        const pending = await port.getPending();
        const owned = pending.notifications.filter(item => item.extra?.owner === port.owner);
        if (owned.length)
            await port.cancel({ notifications: owned.map(({ id }) => ({ id })) });
    };
    return {
        sync(load, options = {}) {
            const current = generation;
            return enqueue(async () => {
                const result = { scheduled: 0, retained: 0, acceptedIds: [], permissionRequired: false, legacySound: false };
                const invalidated = () => ({ ...result, retained: 0, acceptedIds: [] });
                if (current !== generation)
                    return invalidated();
                const requests = await load();
                if (current !== generation)
                    return invalidated();
                const unique = new Map();
                for (const request of requests) {
                    if (!Number.isInteger(request.id) || request.id < 1 || request.id > 2147483647 || !Number.isFinite(request.at)) {
                        throw new Error("Invalid device reminder");
                    }
                    const duplicate = unique.get(request.id);
                    if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(request))
                        throw new Error("Conflicting device reminder IDs");
                    unique.set(request.id, request);
                }
                const pending = (await port.getPending()).notifications;
                if (current !== generation)
                    return invalidated();
                for (const item of pending) {
                    if (unique.has(item.id) && item.extra?.owner !== port.owner)
                        throw new Error("Device reminder ID belongs to another owner");
                    const requested = unique.get(item.id);
                    for (const key of ["attemptId", "reminderId", "taskId"]) {
                        if (requested?.extra?.[key] !== undefined && item.extra?.[key] !== undefined && requested.extra[key] !== item.extra[key]) {
                            throw new Error("Device reminder ID collision");
                        }
                    }
                }
                const owned = pending.filter(item => item.extra?.owner === port.owner);
                const obsolete = owned.filter(item => !unique.has(item.id));
                if (options.cancelObsolete !== false && obsolete.length)
                    await port.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
                if (current !== generation)
                    return invalidated();
                const existing = new Set(owned.map(item => item.id));
                result.acceptedIds = [...unique.keys()].filter(id => existing.has(id));
                result.retained = result.acceptedIds.length;
                const missing = [...unique.values()].filter(item => !existing.has(item.id) && item.at > now());
                // No channel/permission/settings work for retained or expired schedules.
                if (!missing.length)
                    return result;
                const permissions = await port.checkPermissions();
                if (current !== generation)
                    return invalidated();
                if (permissions.display !== "granted")
                    return { ...result, permissionRequired: true };
                const alarm = missing.some(item => item.alarm) ? await port.prepareAlarm() : undefined;
                if (current !== generation)
                    return invalidated();
                const notification = missing.some(item => !item.alarm) ? await port.prepareNotification() : undefined;
                if (current !== generation)
                    return invalidated();
                const notifications = missing.filter(item => item.at > now()).map(({ at, alarm: isAlarm, extra, ...item }) => ({
                    ...item, channelId: isAlarm ? alarm.channelId : notification,
                    ...(isAlarm ? { sound: alarm.sound } : {}),
                    smallIcon: "ic_stat_hamrah", autoCancel: true,
                    schedule: { at: new Date(at), allowWhileIdle: isAlarm },
                    extra: { ...extra, owner: port.owner },
                }));
                // Capacitor uses stable numeric IDs. On a partial/ambiguous failure, the next
                // serialized retry reads pending IDs and only schedules the missing future ones.
                try {
                    if (notifications.length)
                        await port.schedule({ notifications });
                }
                finally {
                    // clear() must not await a stalled fetch/native call. Remove any late or
                    // partially accepted native writes when that old call finally settles.
                    if (current !== generation && notifications.length) {
                        await port.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
                    }
                }
                if (current !== generation)
                    return invalidated();
                return { ...result, scheduled: notifications.length,
                    acceptedIds: [...result.acceptedIds, ...notifications.map(item => item.id)], legacySound: alarm?.legacySound ?? false };
            });
        },
        clear() {
            ++generation;
            // Cancellation starts immediately, not behind a network request. Future
            // syncs still wait for both the old operation and this cancellation barrier.
            const canceled = cancelOwned();
            queue = Promise.allSettled([queue, canceled]).then(() => { });
            return canceled;
        },
    };
}
// The exact same controls mount inside React settings and the bundled offline page.
function mountAlarmSoundSettings(root, controller) {
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
        const option = doc.createElement("option");
        option.value = sound.id;
        option.textContent = sound.label;
        select.append(option);
    }
    label.append(select);
    const buttons = doc.createElement("div");
    buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    const button = (text) => {
        const node = doc.createElement("button");
        node.type = "button";
        node.textContent = text;
        node.style.minHeight = "44px";
        buttons.append(node);
        return node;
    };
    const preview = button("شنیدن نمونه");
    const stop = button("توقف نمونه");
    const settings = button("بلندی صدا در تنظیمات گوشی");
    const help = doc.createElement("p");
    help.style.cssText = "font-size:0.875rem;line-height:1.8";
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    section.append(title, label, buttons, help, status);
    root.append(section);
    const disable = (value) => { select.disabled = value; preview.disabled = value; settings.disabled = value; stop.disabled = value; };
    disable(true);
    const failure = () => { if (!disposed)
        status.textContent = "این کار انجام نشد؛ دوباره تلاش کنید یا تنظیمات صدای گوشی را باز کنید."; };
    async function read() {
        try {
            const state = await controller.read();
            if (disposed)
                return;
            select.value = state.soundId;
            help.textContent = state.message;
            available = state.mode !== "legacy";
            disable(!available);
            settings.hidden = state.mode !== "android";
        }
        catch {
            if (!disposed) {
                disable(true);
                status.textContent = "انتخاب ذخیره‌شده قابل خواندن نیست؛ دوباره صفحه را باز کنید.";
            }
        }
    }
    select.addEventListener("change", async () => {
        if (!available || !isAlarmSoundId(select.value))
            return;
        disable(true);
        try {
            await controller.stopPreview();
            await controller.save(select.value);
            if (!disposed)
                status.textContent = "انتخاب صدا روی این دستگاه ذخیره شد؛ زنگ‌های قبلی تغییر نکردند.";
        }
        catch {
            failure();
        }
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
    const hide = () => { if (doc.visibilityState !== "visible")
        void controller.stopPreview().catch(() => { }); };
    const pagehide = () => { void controller.stopPreview().catch(() => { }); };
    doc.addEventListener("visibilitychange", hide);
    doc.defaultView?.addEventListener("pagehide", pagehide);
    void read();
    return () => {
        disposed = true;
        doc.removeEventListener("visibilitychange", hide);
        doc.defaultView?.removeEventListener("pagehide", pagehide);
        void controller.stopPreview().catch(() => { });
        section.remove();
    };
}


function nativePlugin() {
  const cap=window.Capacitor;
  return cap?.getPlatform?.()==="android" && cap?.isPluginAvailable?.("TiaAlarmSounds") ? cap.Plugins?.TiaAlarmSounds : undefined;
}
function createController() {
  let storage; try { storage=window.localStorage; } catch {}
  return createAlarmSoundController({native:window.Capacitor?.getPlatform?.()==="android",plugin:nativePlugin(),storage,createAudio:url=>new Audio(url),assetBase:"./alarm-sounds/"});
}
return {ALARM_SOUNDS,ALARM_SOUND_HELP,LEGACY_ALARM_SOUND_HELP,createController,createDeviceAlarmScheduler,
mount:root=>mountAlarmSoundSettings(root,createController()),
prepareAlarm:(ensureLegacy,legacyChannelId)=>prepareDeviceAlarmChannel(nativePlugin(),ensureLegacy,legacyChannelId)};
})();
