"use client";
import { useEffect, useRef, useState } from "react";
import { DailyPoem } from "@/components/daily-poem";
import { mountPersonalPoemEditor } from "@/lib/personal-poem";
import { observePoemLayout } from "@/lib/poem-layout";
import { tehranDayKey } from "@/lib/dashboard-overview";

export function PoemCard({ lines, onNext, scope }: { lines: readonly string[]; onNext: () => void; scope: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const editorRef = useRef<ReturnType<typeof mountPersonalPoemEditor> | null>(null);
  const [custom, setCustom] = useState<string[] | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const editor = mountPersonalPoemEditor(host.current, { scope, day: tehranDayKey, storage: { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) }, onChange: setCustom });
    editorRef.current = editor;
    const stop = observePoemLayout(editor.poem);
    return () => { editorRef.current = null; stop(); editor.dispose(); };
  }, [scope]);
  return <div className="poem-row">
    <DailyPoem lines={custom || lines} personal={Boolean(custom)} />
    <button type="button" className="poem-next" aria-label="شعر بعدی" title="شعر بعدی" onClick={() => { if (!custom || editorRef.current?.useDaily()) onNext(); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M20 12H8" /></svg></button>
    <span ref={host} />
  </div>;
}
