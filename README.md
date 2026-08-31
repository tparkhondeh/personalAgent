# همراه — Personal Agent

همراه یک دستیار شخصی فارسی و مینیمال برای مدیریت کارهای شخصی، کارهای شرکتی، جلسات، تقویم و یادآوری‌هاست. کاربر با زبان طبیعی با LLM گفتگو می‌کند؛ Agent فقط پیشنهاد ساختاریافته می‌دهد و عملیات دارای اثر پس از تأیید کاربر اجرا می‌شود.

## امکانات MVP

- رابط RTL، Responsive، پاستلی و Dark Mode
- کارهای شخصی و شرکتی با اولویت فوری، مهم و عادی
- جلسات و نمای تقویم هفتگی
- شناخت اولیه کاربر شامل ساعت کاری، روزهای کاری، زمان سکوت و سبک برنامه‌ریزی
- ثبت‌نام و ورود امن با Better Auth
- SQLite/LibSQL و Prisma با جداسازی داده هر کاربر
- Audit Log برای عملیات داده
- گفتگوی ساختاریافته با LLM و تأیید پیش از اجرا
- یادآوری Idempotent، مرکز اعلان داخل برنامه و زیرساخت Web Push
- PWA قابل نصب روی موبایل و دسکتاپ
- تست Unit، Type Check، Lint، Build و CI

## اجرای محلی

پیش‌نیاز: Node.js 24 و pnpm 11.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:generate
pnpm exec prisma db execute --file prisma/migrations/20260830170000_init/migration.sql
pnpm dev
```

سپس `http://localhost:3000` را باز کنید. مقادیر Secret و کلید API فقط در `.env` قرار می‌گیرند؛ این فایل وارد Git نمی‌شود.

## کنترل کیفیت

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## متغیرهای محیطی

نمونه کامل در `.env.example` است. Production حداقل به `DATABASE_URL`، تنظیمات Better Auth، کلید LLM، کلیدهای VAPID و `CRON_SECRET` نیاز دارد.

## مستندات

- [مختصات و درصد پیشرفت پروژه](PROJECT_STATUS.md)
- [پرامپت آماده برای ادامه پروژه](docs/continuation-prompt-fa.md)
- [معماری سیستم](docs/architecture.md)
- [منابع متن‌باز و مجوزها](docs/open-source-review.md)
- [برنامه Deploy، Backup و Rollback](docs/deployment.md)

مجوز انتشار اختصاصی پروژه هنوز توسط مالک تعیین نشده است. کپی مستقیم از پروژه‌های AGPL انجام نشده و فقط از الگوهای معماری عمومی آن‌ها استفاده شده است.
