# معماری MVP همراه

مرورگر/PWA یا اپ Android → برنامه Next.js → احراز هویت و API → Prisma → SQLite/LibSQL

Agent از طریق AI SDK به ارائه‌دهنده LLM وصل می‌شود. Scheduler نیز Reminderهای موعدرسیده را پیدا و اعلان داخل برنامه یا Push ارسال می‌کند.

هر کار یا جلسه می‌تواند از دو یا سه زمان پیش‌فرض مستقل استفاده کند. این زمان‌ها در تنظیمات کاربر ذخیره و برای هر موعد به Reminderهای مجزا با کلید Idempotency متفاوت تبدیل می‌شوند؛ بنابراین اجرای دوباره Scheduler اعلان تکراری تولید نمی‌کند.

اپ Android با Capacitor رابط فعلی را در Build آزمایشی اجرا می‌کند و Alarmهای محلی را با پلاگین رسمی Local Notifications زمان‌بندی می‌کند. Build انتشار فقط به Origin امن HTTPS متصل خواهد شد.

Escalation برای کار فوری عقب‌افتاده یک ماشین حالت Idempotent است: `PENDING` → `PROCESSING` → `SENT` یا `READY_FOR_DEVICE` → `SCHEDULED`. تغییر موعد یا پایان کار، رکوردهای فعال را `CANCELLED` می‌کند. پیامک همچنان `SIMULATED` است؛ تماس واقعی فقط با حالت `live` سرور، کلید کاوه‌نگار، شماره Allowlist‌شده و انتخاب صریح کاربر ارسال می‌شود و در غیر این صورت `SIMULATED` باقی می‌ماند.

## مرزهای سیستم

- `src/components`: رابط و تعامل کاربر
- `src/app/api`: APIهای احراز هویت‌شده
- `src/lib/validation.ts`: اعتبارسنجی ورودی‌ها با Zod
- `src/lib/agent.ts`: اتصال قابل‌تعویض LLM و Prompt امنیتی
- `src/lib/reminders.ts`: زمان‌بندی، Quiet Hours و Idempotency
- `src/lib/escalations.ts`: برنامه چندمرحله‌ای و شناسه‌های پایدار هشدار
- `src/lib/native-escalations.ts`: مجوز و Alarm محلی Android
- `android`: پروژه بومی جدا از هسته وب
- `prisma/schema.prisma`: مدل داده و روابط

## اصول امنیتی

1. هر Query کاربر با `userId` نشست محدود می‌شود.
2. Secretها فقط از Environment Variables خوانده می‌شوند.
3. ورودی API پیش از دیتابیس با Zod بررسی می‌شود.
4. Agent داده را مستقیم تغییر نمی‌دهد؛ پیشنهاد نیازمند تأیید می‌سازد.
5. عملیات در `AuditLog` ثبت می‌شوند.
6. Endpoint زمان‌بندی با `CRON_SECRET` محافظت می‌شود.
7. زمان‌ها به UTC ذخیره و با Timezone کاربر نمایش داده می‌شوند.
8. ورود و ثبت‌نام Rate Limit دارند و پاسخ‌ها هدرهای امنیتی دریافت می‌کنند.
9. مجوز اعلان و Alarm فقط با اقدام روشن کاربر درخواست می‌شود.

برای حجم زیاد، دیتابیس به PostgreSQL و Scheduler به Worker مستقل منتقل می‌شود. مرزها برای این مهاجرت جدا شده‌اند.
