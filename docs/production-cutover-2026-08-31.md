# وضعیت انتقال Production — به‌روزرسانی ۲۰۲۶-۰۹-۰۱

## وضعیت فعلی

- نسخه Production از Commit `b50c3b6b75290f2f66938fc93d7783c3b8297844` در مسیر مستقل `/home/wealthos_dev/apps/personal-agent` اجرا شده است.
- برنامه با PM2 و نام `personal-agent-prod` روی `127.0.0.1:3011` فعال است.
- پورت ۳۰۱۱ از اینترنت قابل دسترسی نیست و فقط Reverse Proxy سرور باید به آن وصل شود.
- دیتابیس Production مستقل، خالی و دارای `PRAGMA integrity_check = ok` است.
- Secretها و دیتابیس Permission برابر `600` دارند.
- یادآوری هر دقیقه و بکاپ SQLite هر شب ساعت ۰۲:۱۷ اجرا می‌شوند.
- بکاپ‌ها پس از ۳۰ روز حذف می‌شوند.
- کاندید انتشار سوم از Commit `9885ac6656738da306cfb5d0984234000ec64389` روی محیط آزمایشی پورت ۳۰۱۰ فعال و با عملیات واقعی تأیید شده است.
- Production همچنان روی Commit `b50c3b6b75290f2f66938fc93d7783c3b8297844` و پورت ۳۰۱۱ باقی مانده و در جریان آماده‌سازی تغییری نکرده است.
- دامنه اکنون پاسخ HTTPS سالم دارد، اما فقط صفحه `Index of /` سرویس LiteSpeed را نشان می‌دهد و هنوز به برنامه متصل نیست.

## Snapshot قبل از Cutover

نسخه قابل‌بازیابی وضعیت فعلی دامنه روی سرور در این مسیر است:

`/home/wealthos_dev/backups/personal-agent/pre-cutover-20260831T1106Z`

این Snapshot شامل DNS، هدر و بدنه صفحه قبلی، TLS، پورت‌ها، crontab قبلی، PM2 قبلی و فایل `SHA256SUMS` است. صفحه قبلی فقط فهرست خالی LiteSpeed و پوشه `cgi-bin` را نمایش می‌داد.

## مانع باقی‌مانده

حساب SSH با نام `wealthos_dev` مالک cPanel نیست، `sudo` ندارد و UAPI نیز برای آن فایل کاربر cPanel پیدا نمی‌کند. بنابراین مدیر سرور یا پشتیبانی هاست باید Reverse Proxy دامنه `personalagent.wealthos.ir` را به مقصد زیر تنظیم کند:

`http://127.0.0.1:3011`

تنظیم باید WebSocket/HTTP keep-alive، هدرهای `Host`، `X-Forwarded-Proto=https` و `X-Forwarded-For` را حفظ کند. پس از Cutover باید `/api/health`، HTTPS، ورود، Cookie امن، Task، Meeting و Push دوباره تست شوند.

## Rollback

برای Rollback، Reverse Proxy دامنه به Origin/Document Root قبلی بازگردانده شود. Snapshot بالا مرجع مقایسه DNS، TLS و پاسخ قبلی است. سپس Symlink به Release قبلی برمی‌گردد و `personal-agent-prod` با PM2 روی همان نسخه Restart می‌شود.

پیش از Cutover یک Snapshot تازه از دیتابیس، `.env`، وضعیت PM2، Cron و پاسخ دامنه ساخته می‌شود. Release و دیتابیس قبلی تا پایان Smoke Test حذف نمی‌شوند؛ بنابراین بازگشت با تغییر Symlink/PM2 و برگرداندن Reverse Proxy انجام می‌شود.

## خروجی تأییدشده آماده انتقال

- GitHub Actions: <https://github.com/tparkhondeh/personalAgent/actions/runs/33512177595>
- Server RC3: <https://github.com/tparkhondeh/personalAgent/releases/download/production-rc-3/hamrah-server-rc-3.tar.gz>
- Android RC3: <https://github.com/tparkhondeh/personalAgent/releases/download/production-rc-3/hamrah-android-rc-3.apk>
- SHA-256 سرور: `590accb327bae1aeade8eaec821b5ad37d1bf80e212d9c265278272934bbb748`
- SHA-256 Android: `256eac4f609c19809a6478a7b33639220aa379f57aeb8e67da9511038fa60819`

## LLM

`OPENAI_API_KEY` عمداً خالی است. کلید باید مستقیماً و بدون ارسال در چت داخل فایل زیر قرار گیرد و سپس PM2 ری‌استارت شود:

`/home/wealthos_dev/apps/personal-agent/shared/.env`
