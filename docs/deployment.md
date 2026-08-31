# برنامه استقرار امن

حساب `wealthos_dev` روی سرور موجود است، اما پوشه خانگی آن پروژه ندارد و دسترسی `sudo` بدون رمز نیز ندارد. دامنه پشت MizbanCloud است و مسیر Origin/Reverse Proxy هنوز برای این حساب قابل مشاهده نیست. بنابراین Deploy نهایی پیش از مشخص‌شدن روش اتصال دامنه انجام نمی‌شود.

## مراحل Deploy

1. Backup از تنظیمات فعلی دامنه و Origin، بدون تغییر آن‌ها.
2. ساخت `.env` Production با Secretهای تصادفی و Permission محدود.
3. Build در مسیر جدا از سایت فعلی.
4. اجرای Migration روی دیتابیس جدید و خالی.
5. اجرای برنامه روی پورت داخلی `3010` و بررسی `/api/health`.
6. Smoke Test ثبت‌نام، Task، جلسه و Reminder.
7. پس از تأیید مالک، اتصال Reverse Proxy دامنه به `127.0.0.1:3010`.
8. بررسی HTTPS، Cookie امن، Web Push و Logها.

Migrationهای این پروژه با `pnpm db:init` و جدول داخلی `_hamrah_migrations` اجرا می‌شوند تا دیتابیس موجود بدون Reset و حذف داده ارتقا پیدا کند.

Scheduler باید هر دو Endpoint محافظت‌شده `/api/internal/reminders` و `/api/internal/escalations` را با `Authorization: Bearer <CRON_SECRET>` اجرا کند.

## Backup

- پیش از هر Deploy، فایل SQLite با روش snapshot سازگار SQLite کپی و تاریخ‌گذاری شود.
- `.env` جداگانه و رمزگذاری‌شده Backup شود.
- حداقل ۷ نسخه روزانه و ۴ نسخه هفتگی نگهداری شود.
- Restore دوره‌ای روی مسیر جدا تمرین شود.

## Rollback

Reverse Proxy و Process به نسخه قبلی بازگردد. اگر Migration ناسازگار بود، Snapshot قبل از Deploy بازگردانده و Health Check و Login دوباره آزمایش شوند.

هیچ‌یک از این مراحل روی Production بدون تأیید صریح مالک اجرا نمی‌شود.

Build انتشار Android نیز فقط پس از HTTPS نهایی و تأیید Production انجام می‌شود؛ `server.url` مبتنی بر HTTP صرفاً برای Emulator محلی است.
