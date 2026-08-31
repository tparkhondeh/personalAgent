# وضعیت انتقال Production — ۲۰۲۶-۰۸-۳۱

## وضعیت فعلی

- نسخه Production از Commit `b50c3b6b75290f2f66938fc93d7783c3b8297844` در مسیر مستقل `/home/wealthos_dev/apps/personal-agent` اجرا شده است.
- برنامه با PM2 و نام `personal-agent-prod` روی `127.0.0.1:3011` فعال است.
- پورت ۳۰۱۱ از اینترنت قابل دسترسی نیست و فقط Reverse Proxy سرور باید به آن وصل شود.
- دیتابیس Production مستقل، خالی و دارای `PRAGMA integrity_check = ok` است.
- Secretها و دیتابیس Permission برابر `600` دارند.
- یادآوری هر دقیقه و بکاپ SQLite هر شب ساعت ۰۲:۱۷ اجرا می‌شوند.
- بکاپ‌ها پس از ۳۰ روز حذف می‌شوند.

## Snapshot قبل از Cutover

نسخه قابل‌بازیابی وضعیت فعلی دامنه روی سرور در این مسیر است:

`/home/wealthos_dev/backups/personal-agent/pre-cutover-20260831T1106Z`

این Snapshot شامل DNS، هدر و بدنه صفحه قبلی، TLS، پورت‌ها، crontab قبلی، PM2 قبلی و فایل `SHA256SUMS` است. صفحه قبلی فقط فهرست خالی LiteSpeed و پوشه `cgi-bin` را نمایش می‌داد.

## مانع باقی‌مانده

حساب SSH با نام `wealthos_dev` مالک cPanel نیست، `sudo` ندارد و به تنظیمات دامنه یا LiteSpeed دسترسی ندارد. مدیر سرور باید Reverse Proxy دامنه `personalagent.wealthos.ir` را به مقصد زیر تنظیم کند:

`http://127.0.0.1:3011`

تنظیم باید WebSocket/HTTP keep-alive، هدرهای `Host`، `X-Forwarded-Proto=https` و `X-Forwarded-For` را حفظ کند. پس از Cutover باید `/api/health`، HTTPS، ورود، Cookie امن، Task، Meeting و Push دوباره تست شوند.

## Rollback

برای Rollback، Reverse Proxy دامنه به Origin/Document Root قبلی بازگردانده شود. Snapshot بالا مرجع مقایسه DNS، TLS و پاسخ قبلی است. سرویس جدید را می‌توان بدون حذف داده با `pm2 stop personal-agent-prod` متوقف کرد.

## LLM

`OPENAI_API_KEY` عمداً خالی است. کلید باید مستقیماً و بدون ارسال در چت داخل فایل زیر قرار گیرد و سپس PM2 ری‌استارت شود:

`/home/wealthos_dev/apps/personal-agent/shared/.env`
