# همراه — Personal Agent

همراه یک دستیار شخصی فارسی و مینیمال برای مدیریت کارهای شخصی، کارهای شرکتی، جلسات، تقویم و یادآوری‌هاست. کاربر با زبان طبیعی با LLM گفتگو می‌کند؛ Agent فقط پیشنهاد ساختاریافته می‌دهد و عملیات دارای اثر پس از تأیید کاربر اجرا می‌شود.

## امکانات MVP

- رابط RTL، Responsive، پاستلی و Dark Mode با فونت محلی وزیرمتن
- کارهای شخصی و شرکتی با اولویت فوری، مهم و عادی
- جلسات و نمای تقویم هفتگی
- شناخت اولیه کاربر شامل ساعت کاری، روزهای کاری، زمان سکوت و سبک برنامه‌ریزی
- ثبت‌نام و ورود امن با Better Auth
- SQLite/LibSQL و Prisma با جداسازی داده هر کاربر
- Audit Log برای عملیات داده
- گفتگوی ساختاریافته با حالت محلی یا LLM و تأیید پیش از اجرا
- یادآوری Idempotent، مرکز اعلان، اعلان محلی و زیرساخت Web Push
- PWA قابل نصب روی موبایل و دسکتاپ با پوسته آفلاین پایه
- پروژه بومی Android با Capacitor، آیکون و Splash اختصاصی
- ساخت APK، آزمایش خودکار Android 16 و پیش‌نمایش HTTPS قابل‌نصب بدون کابل در GitHub Actions
- هشدار چندمرحله‌ای کار فوری: اعلان، Alarm اندروید، اولویت بالا و Mock امن پیامک/تماس
- Backup سازگار SQLite، کنترل Rollback و هدرهای امنیتی
- تست Unit، Type Check، Lint، Build و CI

## اجرای محلی

پیش‌نیاز: Node.js 24 و pnpm 11.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:generate
pnpm db:init
pnpm dev
```

سپس `http://localhost:3000` را باز کنید. مقادیر Secret و کلید API فقط در `.env` قرار می‌گیرند؛ این فایل وارد Git نمی‌شود.

## کنترل کیفیت

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod --audit-level high
```

## اپلیکیشن Android

نسخه مرجع فعلی «همراه پایدار ۱۴» است. این نسخه روی Android 13، 14 و 16 آزمایش شده و بازشدن آن روی گوشی واقعی نیز تأیید شده است. برای جلوگیری از تکرار مشکل صفحه سفید، تمام علت‌ها، راه‌حل‌ها و کنترل‌های اجباری در [راهنمای دائمی ساخت و تحویل Android](docs/ANDROID_RELEASE_PLAYBOOK.md) ثبت شده‌اند.

نسخه آزمایشی Android ساخته شده و با `pnpm android:build:debug` دوباره تولید می‌شود. خروجی محلی در `android/app/build/outputs/apk/debug/app-debug.apk` قرار می‌گیرد. پس از اتصال و تأیید USB debugging روی یک گوشی، دستور `pnpm android:install:device` ساخت، اتصال امن محلی، نصب و بازکردن برنامه را خودکار انجام می‌دهد. نسخه عمومیِ امضاشده تا تأیید آدرس امن Production ساخته نمی‌شود.

### یکسان‌بودن ظاهر اپ با نسخه لوکال

برای مقایسه نهایی، **دو نوع APK** وجود دارد:

- **متصل به سرور (`server.url`)**: همان نسخه‌ای است که باید UI آن دقیقاً شبیه مرورگر لوکال شود؛ مناسب برای تأیید نهایی.
- **آفلاین (`mobile-shell`)**: نسخه سبک‌تر برای سناریوی بدون اینترنت است و ممکن است ظاهرش فرق داشته باشد.

برای خروجی متصل، به‌صورت پیش‌فرض در محیط توسعه با `pnpm android:build:debug` ساخته می‌شود و باید روی `localhost:3001` (یا استیجینگ معادل) تست شود.

علاوه بر روش USB، Workflow مستقل `Android emulator QA` برنامه را بدون گوشی روی Android 16 ابری Build، نصب و اجرا می‌کند و نمایش اعلان، اجرای Alarm دقیق و لغو Alarm را نیز می‌آزماید. آخرین [اجرای موفق Android 16](https://github.com/tparkhondeh/personalAgent/actions/runs/33521413925) برای Commit نهایی پالت پاستیلی در GitHub Actions ثبت شده است.

برای نصب آزمایشی بدون کابل، Workflow دستی `Temporary phone preview` یک محیط کاملاً جدا با HTTPS و دیتابیس موقت می‌سازد، APK را به همان آدرس متصل می‌کند و لینک دانلود را در Summary اجرا قرار می‌دهد. [اجرای پیش‌نمایش شماره ۱](https://github.com/tparkhondeh/personalAgent/actions/runs/33493716896) بدون تغییر Production ساخته و کنترل شده است. لینک آن حدود دو ساعت فعال است؛ داده‌های این محیط موقت‌اند و نباید برای اطلاعات مهم استفاده شود.

برای آزمایش پایدار بدون دامنه، [همراه آفلاین ۳](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-offline-3/hamrah-offline-preview-3.apk) با شناسه مستقل `ir.wealthos.personalagent.offlinepreview3` منتشر شده است. این شناسه اجازه می‌دهد APK کنار نسخه‌های قبلی نصب شود و خطای تداخل Package ایجاد نکند؛ داده‌های آن فقط روی همان گوشی ذخیره می‌شوند.

کاندید نهایی پیش از Production در [اجرای شماره ۵](https://github.com/tparkhondeh/personalAgent/actions/runs/33521435867) ساخته و روی Staging تأیید شده است. این اجرا بسته مستقل سرور، Migration، Reminder، Escalation، وب و APK متصل به `https://personalagent.wealthos.ir` را در محیط تمیز آزمایش می‌کند. [APK آزمایشی RC5](https://github.com/tparkhondeh/personalAgent/releases/download/production-rc-5/hamrah-android-rc-5.apk) Debug-signed است؛ امضای خصوصی و انتشار عمومی فقط بعد از تأیید نهایی مالک انجام می‌شود.

## متغیرهای محیطی

نمونه کامل در `.env.example` است. Production حداقل به `DATABASE_URL`، تنظیمات Better Auth، کلیدهای VAPID و `CRON_SECRET` نیاز دارد. کلید LLM اختیاری است و نبود آن برنامه را به حالت محلی امن می‌برد.

در محیط توسعه، خالی‌بودن کلید LLM مانع کار برنامه نیست؛ دستیار به‌صورت خودکار از حالت محلی امن استفاده می‌کند. همچنین بدون کلید VAPID می‌توان اعلان محلی همین دستگاه را آزمایش کرد.

## مستندات

- [مختصات و درصد پیشرفت پروژه](PROJECT_STATUS.md)
- [پرامپت آماده برای ادامه پروژه](docs/continuation-prompt-fa.md)
- [معماری سیستم](docs/architecture.md)
- [منابع متن‌باز و مجوزها](docs/open-source-review.md)
- [برنامه Deploy، Backup و Rollback](docs/deployment.md)
- [راهنمای اپ Android](docs/android.md)
- [راهنمای جلوگیری از تکرار خطاهای Android](docs/ANDROID_RELEASE_PLAYBOOK.md)
- [کنترل‌های امنیت، Backup و Rollback](docs/security-backup-rollback.md)

مجوز انتشار اختصاصی پروژه هنوز توسط مالک تعیین نشده است. کپی مستقیم از پروژه‌های AGPL انجام نشده و فقط از الگوهای معماری عمومی آن‌ها استفاده شده است.
