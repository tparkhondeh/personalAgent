window.HamrahCapture=(()=>{function createVoiceCapture(onState, onAudio) {
    let generation = 0, recorder = null, stream = null;
    let timer, state = "idle", disposed = false;
    const emit = (next, message) => { state = next; if (!disposed)
        onState(next, message); };
    const release = () => { clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); stream = null; };
    const cancel = (message = "ضبط لغو شد؛ صوتی نگه‌داری نمی‌شود.") => {
        generation++;
        if (recorder?.state === "recording")
            recorder.stop();
        release();
        recorder = null;
        if (!disposed)
            onAudio(null);
        emit("idle", message);
    };
    return {
        async start() {
            if (disposed || state !== "idle")
                return;
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
                emit("idle", "میکروفون در این محیط در دسترس نیست؛ می‌توانی تایپ کنی.");
                return;
            }
            const version = ++generation;
            onAudio(null);
            emit("asking", "در انتظار اجازه میکروفون…");
            try {
                const input = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (disposed || version !== generation) {
                    input.getTracks().forEach(track => track.stop());
                    return;
                }
                stream = input;
                const record = new MediaRecorder(input);
                recorder = record;
                const chunks = [];
                let size = 0;
                record.ondataavailable = event => {
                    if (disposed || version !== generation || !event.data.size)
                        return;
                    size += event.data.size;
                    if (size > 4 * 1024 * 1024) {
                        cancel("حجم ضبط بیش از حد است؛ یک پیام کوتاه‌تر ضبط کن.");
                        return;
                    }
                    chunks.push(event.data);
                };
                record.onstop = () => {
                    input.getTracks().forEach(track => track.stop());
                    if (disposed || version !== generation) {
                        chunks.length = 0;
                        return;
                    }
                    release();
                    const clip = new Blob(chunks, { type: record.mimeType });
                    chunks.length = 0;
                    if (!clip.size) {
                        cancel("صدایی دریافت نشد؛ دوباره ضبط کن.");
                        return;
                    }
                    onAudio(clip);
                    emit("ready", "ضبط آماده است؛ هنوز صدایی ارسال نشده است.");
                };
                record.onerror = () => { if (version === generation)
                    cancel("ضبط انجام نشد؛ دوباره تلاش کن."); };
                record.start(250);
                emit("recording", "در حال ضبط…");
                timer = setTimeout(() => { if (version === generation && record.state === "recording")
                    record.stop(); }, 60000);
            }
            catch {
                if (version === generation && !disposed)
                    cancel("اجازه میکروفون داده نشد یا میکروفون در دسترس نیست؛ دوباره تلاش کن یا تایپ کن.");
            }
        },
        stop() { if (recorder?.state === "recording")
            recorder.stop(); },
        cancel,
        dispose() { cancel(""); disposed = true; },
    };
}
// List-only scrolling when there is enough room; zoom/small screens retain page scrolling.
function fitProgramList(list, today) {
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const nav = document.querySelector(".mobile-nav, .bottom-nav");
    const navHeight = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
    const first = list.querySelector(".task-row, .item");
    const cardHeight = first?.getBoundingClientRect().height ?? 80;
    const available = height - list.getBoundingClientRect().top - navHeight - 48;
    const fits = height >= 640 && available >= cardHeight + 16;
    list.style.maxHeight = fits ? `${Math.floor(today ? Math.min(cardHeight + 8, available) : available)}px` : "none";
    list.dataset.scrollable = String(fits && list.scrollHeight > list.clientHeight + 1);
    return fits;
}

return {createVoiceCapture,fitProgramList};})();