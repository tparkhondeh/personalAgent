# برنامه استقرار امن

حساب `wealthos_dev` برنامه را در مسیر مستقل دارد، اما مالک cPanel نیست و دسترسی `sudo` ندارد. دامنه پشت MizbanCloud و LiteSpeed است و تنظیم Origin/Reverse Proxy برای این حساب قابل مشاهده یا تغییر نیست. کاندید انتشار سوم روی محیط آزمایشی پورت ۳۰۱۰ سالم است و Production فعلی روی پورت ۳۰۱۱ بدون تغییر کار می‌کند.

## مراحل Deploy

1. Backup از تنظیمات فعلی دامنه و Origin، بدون تغییر آن‌ها.
2. ساخت `.env` Production با Secretهای تصادفی و Permission محدود.
3. استفاده از بسته تأییدشده Commit `9885ac6656738da306cfb5d0984234000ec64389` در مسیر Release جدا.
4. Backup سازگار SQLite و سپس اجرای Migrationهای قابل تکرار روی دیتابیس Production.
5. اجرای برنامه Production روی پورت داخلی `3011` و بررسی `/api/health`.
6. Smoke Test ثبت‌نام، Task، جلسه و Reminder.
7. پس از تأیید مالک، اتصال Reverse Proxy دامنه به `127.0.0.1:3011`.
8. بررسی HTTPS، Cookie امن، Web Push و Logها.

Migrationهای این پروژه با `pnpm db:init` و جدول داخلی `_hamrah_migrations` اجرا می‌شوند تا دیتابیس موجود بدون Reset و حذف داده ارتقا پیدا کند.

Scheduler باید هر دو Endpoint محافظت‌شده `/api/internal/reminders` و `/api/internal/escalations` را با `Authorization: Bearer <CRON_SECRET>` اجرا کند.

اسکریپت تأییدشده `scripts/run-schedulers.sh` فقط Origin داخلی `127.0.0.1` یا `localhost` را می‌پذیرد. هنگام Cutover، Cron فعلی یادآوری با همین اسکریپت جایگزین می‌شود تا هر دو Worker روی پورت ۳۰۱۱ اجرا شوند.

## Backup

- پیش از هر Deploy، فایل SQLite با روش snapshot سازگار SQLite کپی و تاریخ‌گذاری شود.
- `.env` جداگانه و رمزگذاری‌شده Backup شود.
- حداقل ۷ نسخه روزانه و ۴ نسخه هفتگی نگهداری شود.
- Restore دوره‌ای روی مسیر جدا تمرین شود.

## Rollback

Reverse Proxy به Document Root قبلی و Process/Symlink به Release قبلی `b50c3b6` بازگردد. Migrationهای فعلی افزایشی‌اند؛ فقط اگر بررسی عملی ناسازگاری نشان داد، Snapshot دیتابیس قبل از Deploy بازگردانده می‌شود. سپس Health Check و Login دوباره آزمایش می‌شوند.

هیچ‌یک از این مراحل روی Production بدون تأیید صریح مالک اجرا نمی‌شود.

Build انتشار Android نیز فقط پس از HTTPS نهایی و تأیید Production انجام می‌شود؛ `server.url` مبتنی بر HTTP صرفاً برای Emulator محلی است.
