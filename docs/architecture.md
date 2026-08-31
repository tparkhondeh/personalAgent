# معماری MVP همراه

مرورگر کاربر → برنامه Next.js → احراز هویت و API → Prisma → SQLite/LibSQL

Agent از طریق AI SDK به ارائه‌دهنده LLM وصل می‌شود. Scheduler نیز Reminderهای موعدرسیده را پیدا و اعلان داخل برنامه یا Push ارسال می‌کند.

## مرزهای سیستم

- `src/components`: رابط و تعامل کاربر
- `src/app/api`: APIهای احراز هویت‌شده
- `src/lib/validation.ts`: اعتبارسنجی ورودی‌ها با Zod
- `src/lib/agent.ts`: اتصال قابل‌تعویض LLM و Prompt امنیتی
- `src/lib/reminders.ts`: زمان‌بندی، Quiet Hours و Idempotency
- `prisma/schema.prisma`: مدل داده و روابط

## اصول امنیتی

1. هر Query کاربر با `userId` نشست محدود می‌شود.
2. Secretها فقط از Environment Variables خوانده می‌شوند.
3. ورودی API پیش از دیتابیس با Zod بررسی می‌شود.
4. Agent داده را مستقیم تغییر نمی‌دهد؛ پیشنهاد نیازمند تأیید می‌سازد.
5. عملیات در `AuditLog` ثبت می‌شوند.
6. Endpoint زمان‌بندی با `CRON_SECRET` محافظت می‌شود.
7. زمان‌ها به UTC ذخیره و با Timezone کاربر نمایش داده می‌شوند.

برای حجم زیاد، دیتابیس به PostgreSQL و Scheduler به Worker مستقل منتقل می‌شود. مرزها برای این مهاجرت جدا شده‌اند.
