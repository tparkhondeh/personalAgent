"use client";

import Link from "next/link";
import { useEffect } from "react";

export type AppNotification = { id: string; title: string; body: string; type: string; readAt: string | null; createdAt: string };

const notificationDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function NotificationCenter({ notifications, signedIn, pushStatus, onClose, onEnablePush, onRead }: { notifications: AppNotification[]; signedIn: boolean; pushStatus: string; onClose: () => void; onEnablePush: () => void; onRead: (id?: string) => void }) {
  const unread = notifications.filter((notification) => !notification.readAt).length;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="notification-backdrop" onMouseDown={onClose}><aside className="notification-panel" role="dialog" aria-modal="true" aria-label="مرکز اعلان‌ها" onMouseDown={(event) => event.stopPropagation()}><div className="notification-heading"><div><p className="eyebrow">مرکز اعلان</p><h2>یادآوری‌های تو</h2></div><button autoFocus onClick={onClose}>بستن</button></div>{!signedIn ? <div className="notification-empty"><p>برای دیدن اعلان‌های شخصی وارد حساب شو.</p><Link href="/login">ورود یا ساخت حساب</Link></div> : <><div className="notification-controls"><button onClick={onEnablePush}>{pushStatus}</button>{unread > 0 && <button onClick={() => onRead()}>همه خوانده شد</button>}</div><div className="notification-list">{notifications.length === 0 ? <div className="notification-empty"><strong>اعلان تازه‌ای نداری</strong><p>یادآوری‌های رسیده در این بخش نمایش داده می‌شوند.</p></div> : notifications.map((notification) => <button className={`notification-item ${notification.readAt ? "read" : ""}`} key={notification.id} onClick={() => onRead(notification.id)}><span>{notification.readAt ? "خوانده‌شده" : "جدید"}</span><strong>{notification.title}</strong><p>{notification.body}</p><small>{notificationDate.format(new Date(notification.createdAt))}</small></button>)}</div></>}</aside></div>;
}
