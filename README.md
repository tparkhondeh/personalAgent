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
- ساخت APK و آزمایش خودکار Android 16 در GitHub Actions بدون نیاز به گوشی
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

نسخه آزمایشی Android ساخته شده و با `pnpm android:build:debug` دوباره تولید می‌شود. خروجی محلی در `android/app/build/outputs/apk/debug/app-debug.apk` قرار می‌گیرد. پس از اتصال و تأیید USB debugging روی یک گوشی، دستور `pnpm android:install:device` ساخت، اتصال امن محلی، نصب و بازکردن برنامه را خودکار انجام می‌دهد. نسخه عمومیِ امضاشده تا تأیید آدرس امن Production ساخته نمی‌شود.

علاوه بر روش USB، Workflow مستقل `Android emulator QA` برنامه را بدون گوشی روی Android 16 ابری Build، نصب و اجرا می‌کند و نمایش اعلان، اجرای Alarm دقیق و لغو Alarm را نیز می‌آزماید. آخرین [اجرای موفق و فایل APK آزمایشی](https://github.com/tparkhondeh/personalAgent/actions/runs/33488117509) در GitHub Actions ثبت شده است.

## متغیرهای محیطی

نمونه کامل در `.env.example` است. Production حداقل به `DATABASE_URL`، تنظیمات Better Auth، کلید LLM، کلیدهای VAPID و `CRON_SECRET` نیاز دارد.

در محیط توسعه، خالی‌بودن کلید LLM مانع کار برنامه نیست؛ دستیار به‌صورت خودکار از حالت محلی امن استفاده می‌کند. همچنین بدون کلید VAPID می‌توان اعلان محلی همین دستگاه را آزمایش کرد.

## مستندات

- [مختصات و درصد پیشرفت پروژه](PROJECT_STATUS.md)
- [پرامپت آماده برای ادامه پروژه](docs/continuation-prompt-fa.md)
- [معماری سیستم](docs/architecture.md)
- [منابع متن‌باز و مجوزها](docs/open-source-review.md)
- [برنامه Deploy، Backup و Rollback](docs/deployment.md)
- [راهنمای اپ Android](docs/android.md)
- [کنترل‌های امنیت، Backup و Rollback](docs/security-backup-rollback.md)

مجوز انتشار اختصاصی پروژه هنوز توسط مالک تعیین نشده است. کپی مستقیم از پروژه‌های AGPL انجام نشده و فقط از الگوهای معماری عمومی آن‌ها استفاده شده است.
