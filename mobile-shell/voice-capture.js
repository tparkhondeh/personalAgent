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
function localSpeechOrigin() {
    const native = window.Capacitor?.isNativePlatform?.();
    return native ? 'https://localhost' : window.location.origin;
}
function normalizeVoiceText(text) {
    return text.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
async function loadSpeechLibrary(signal) {
    const scope = window;
    if (scope.Vosk)
        return scope.Vosk;
    signal.throwIfAborted();
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${localSpeechOrigin()}/speech/vosk-0.0.8.js`;
        const cleanup = () => { script.onload = null; script.onerror = null; signal.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); script.remove(); reject(new Error('cancelled')); };
        script.onload = () => { cleanup(); resolve(); };
        script.onerror = () => { cleanup(); script.remove(); reject(new Error('engine')); };
        signal.addEventListener('abort', abort, { once: true });
        document.head.append(script);
    });
    signal.throwIfAborted();
    if (!scope.Vosk)
        throw new Error('engine');
    return scope.Vosk;
}
function createLocalSpeech() {
    let active = null;
    const cancel = () => { active?.abort(); active = null; };
    return {
        cancel,
        async transcribe(clip, progress) {
            if (active)
                throw new Error('در حال پردازش صدای قبلی است.');
            const controller = new AbortController();
            active = controller;
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
            let model, recognizer;
            const terminate = () => { model?.terminate(); };
            signal.addEventListener('abort', terminate, { once: true });
            try {
                if (!clip.size || clip.size > 4 * 1024 * 1024)
                    throw new Error('audio');
                const context = new AudioContext();
                let decoded;
                try {
                    decoded = await context.decodeAudioData(await clip.arrayBuffer());
                }
                finally {
                    await context.close();
                }
                signal.throwIfAborted();
                if (decoded.duration < 0.1 || decoded.duration > 61)
                    throw new Error('duration');
                const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
                const source = offline.createBufferSource();
                source.buffer = decoded;
                source.connect(offline.destination);
                source.start();
                const samples = (await offline.startRendering()).getChannelData(0);
                let energy = 0;
                for (const value of samples)
                    energy += value * value;
                if (Math.sqrt(energy / samples.length) < 0.001)
                    throw new Error('silence');
                progress('در حال آماده‌سازی تشخیص فارسی روی دستگاه…');
                const library = await loadSpeechLibrary(signal);
                signal.throwIfAborted();
                model = new library.Model(`${localSpeechOrigin()}/speech/fa-0.42.tar.gz`, -2);
                const wait = (listen) => new Promise((resolve, reject) => {
                    const abort = () => reject(new Error('cancelled'));
                    signal.addEventListener('abort', abort, { once: true });
                    const done = (value) => { signal.removeEventListener('abort', abort); resolve(value); };
                    const fail = () => { signal.removeEventListener('abort', abort); reject(new Error('recognition')); };
                    listen(done, fail);
                    if (signal.aborted)
                        abort();
                });
                await wait((done, fail) => { model.on('load', m => m.result === true ? done() : fail()); model.on('error', fail); });
                signal.throwIfAborted();
                progress('در حال تبدیل صدا؛ چیزی هنوز ثبت نشده است…');
                recognizer = new model.KaldiRecognizer(16000);
                const parts = [];
                let receive, failed;
                recognizer.on('result', m => receive?.(m));
                recognizer.on('partialresult', m => receive?.(m));
                recognizer.on('error', () => failed?.());
                for (let start = 0; start < samples.length; start += 16000) {
                    signal.throwIfAborted();
                    await wait((done, fail) => { failed = fail; receive = m => { if (m.event === 'result' && typeof m.result === 'object' && m.result.text)
                        parts.push(m.result.text); done(); }; recognizer.acceptWaveformFloat(samples.slice(start, start + 16000), 16000); });
                }
                await wait((done, fail) => { failed = fail; receive = m => { if (typeof m.result === 'object' && m.result.text)
                    parts.push(m.result.text); done(); }; recognizer.retrieveFinalResult(); });
                signal.throwIfAborted();
                const text = normalizeVoiceText(parts.join(' '));
                if (!text)
                    throw new Error('silence');
                return text;
            }
            catch (error) {
                if (controller.signal.aborted)
                    throw new Error('ضبط و تبدیل لغو شد؛ چیزی ثبت نشده است.');
                if (error instanceof Error && error.message === 'silence')
                    throw new Error('گفتار واضحی تشخیص داده نشد؛ نزدیک‌تر و شمرده‌تر صحبت کن.');
                throw new Error('تبدیل روی دستگاه کامل نشد؛ دوباره تلاش کن یا متن را بنویس. در وب، بار اول اینترنت برای دریافت مدل لازم است.');
            }
            finally {
                signal.removeEventListener('abort', terminate);
                recognizer?.remove();
                model?.terminate();
                if (active === controller)
                    active = null;
            }
        },
    };
}

return {createVoiceCapture,fitProgramList,createLocalSpeech,normalizeVoiceText};})();