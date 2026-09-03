# وضعیت انتقال Production — به‌روزرسانی ۲۰۲۶-۰۹-۰۱

## وضعیت فعلی

- نسخه Production از Commit `49cceed` در مسیر مستقل `/home/wealthos_dev/apps/personal-agent` (با symlink روی `current`) اجرا شده است.
- برنامه با PM2 و نام `personal-agent-prod` روی `127.0.0.1:3011` فعال است.
- پورت ۳۰۱۱ از اینترنت قابل دسترسی نیست و فقط Reverse Proxy سرور باید به آن وصل شود.
- دیتابیس Production مستقل، خالی و دارای `PRAGMA integrity_check = ok` است.
- Secretها و دیتابیس Permission برابر `600` دارند.
- یادآوری هر دقیقه و بکاپ SQLite هر شب ساعت ۰۲:۱۷ اجرا می‌شوند.
- بکاپ‌ها پس از ۳۰ روز حذف می‌شوند.
- کاندید انتشار پنجم از Commit `49cceedd8462e9a65172e6ed375a78d8edf7d226` روی محیط آزمایشی پورت ۳۰۱۰ فعال و با عملیات واقعی تأیید شده است.
- Production اکنون روی Commit `49cceed` و پورت داخلی ۳۰۱۱ فعال شده و در جریان آماده‌سازی دامنه/Proxy باقی مانده است.
- دامنه اکنون پاسخ HTTPS سالم دارد، اما فقط صفحه `Index of /` سرویس LiteSpeed را نشان می‌دهد و هنوز به برنامه متصل نیست.

## Snapshot قبل از Cutover

نسخه قابل‌بازیابی وضعیت فعلی دامنه روی سرور در این مسیر است:

`/home/wealthos_dev/backups/personal-agent/pre-cutover-20260831T1106Z`

این Snapshot شامل DNS، هدر و بدنه صفحه قبلی، TLS، پورت‌ها، crontab قبلی، PM2 قبلی و فایل `SHA256SUMS` است. صفحه قبلی فقط فهرست خالی LiteSpeed و پوشه `cgi-bin` را نمایش می‌داد.

## مانع باقی‌مانده

دو مانع عملی پیش از Cutover باقی مانده است:

1. حساب SSH با نام `wealthos_dev` مالک cPanel نیست، `sudo` ندارد و UAPI نیز برای آن فایل کاربر cPanel پیدا نمی‌کند. بنابراین مدیر سرور یا پشتیبانی هاست باید Reverse Proxy دامنه `personalagent.wealthos.ir` را به مقصد زیر تنظیم کند.
2. دیسک اصلی سرور حدود ۱۰۰٪ مصرف شده و تقریباً ۱٫۴ گیگابایت آزاد دارد. مدیر سرور باید بدون حذف Backupهای لازم یا داده سایر پروژه‌ها فضای کافی آزاد کند.

`http://127.0.0.1:3011`

تنظیم باید WebSocket/HTTP keep-alive، هدرهای `Host`، `X-Forwarded-Proto=https` و `X-Forwarded-For` را حفظ کند. پس از Cutover باید `/api/health`، HTTPS، ورود، Cookie امن، Task، Meeting و Push دوباره تست شوند.

## Rollback

برای Rollback، Reverse Proxy دامنه به Origin/Document Root قبلی بازگردانده شود. Snapshot بالا مرجع مقایسه DNS، TLS و پاسخ قبلی است. سپس Symlink به Release قبلی برمی‌گردد و `personal-agent-prod` با PM2 روی همان نسخه Restart می‌شود.

پیش از Cutover یک Snapshot تازه از دیتابیس، `.env`، وضعیت PM2، Cron و پاسخ دامنه ساخته می‌شود. Release و دیتابیس قبلی تا پایان Smoke Test حذف نمی‌شوند؛ بنابراین بازگشت با تغییر Symlink/PM2 و برگرداندن Reverse Proxy انجام می‌شود.

## خروجی تأییدشده آماده انتقال

- GitHub Actions: <https://github.com/tparkhondeh/personalAgent/actions/runs/33521435867>
- Server RC5: <https://github.com/tparkhondeh/personalAgent/releases/download/production-rc-5/hamrah-server-rc-5.tar.gz>
- Android RC5: <https://github.com/tparkhondeh/personalAgent/releases/download/production-rc-5/hamrah-android-rc-5.apk>
- SHA-256 سرور: `9fbde5e63b08245b1ead7907043d638364e946c27907b1bf4b7d1f40e8bb3939`
- SHA-256 Android: `4e3011cfe1e12d0d388dc8671fea572a8605e096f70a974289d0f78491db73e1`

## LLM

`OPENAI_API_KEY` عمداً خالی است. کلید باید مستقیماً و بدون ارسال در چت داخل فایل زیر قرار گیرد و سپس PM2 ری‌استارت شود:

`/home/wealthos_dev/apps/personal-agent/shared/.env`
