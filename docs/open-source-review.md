# بررسی پروژه‌ها و کتابخانه‌های متن‌باز

| پروژه | کاربرد | مجوز | تصمیم |
|---|---|---|---|
| Next.js | برنامه Full-stack | MIT | استفاده مستقیم؛ پایه رسمی و بالغ |
| Prisma 7 | ORM و Migration | Apache-2.0 | استفاده مستقیم؛ Type-safe و مستند |
| Better Auth | ورود و Session | MIT | استفاده مستقیم؛ رمز عبور و Cookie امن |
| Vercel AI SDK | اتصال Provider-agnostic LLM | Apache-2.0 | استفاده مستقیم؛ خروجی ساختاریافته |
| Zod | Schema Validation | MIT | استفاده مستقیم در APIها |
| RRule | کارهای تکرارشونده | BSD-3-Clause | استفاده مستقیم |
| web-push 3.6.7 | Web Push/VAPID | MPL-2.0 | بر اساس package.json و LICENSE نصب‌شده، دوباره بررسی در ۱۴ سپتامبر ۲۰۲۶ |
| Vazirmatn 33.0.3 | فونت فارسی محلی | SIL OFL-1.1 | استفاده مستقیم و بارگذاری از Bundle پروژه |
| Capacitor 8 | پوسته بومی Android | MIT | استفاده مستقیم؛ اشتراک کد با نسخه وب |
| Capacitor Local Notifications | اعلان و Alarm محلی Android | MIT | استفاده مستقیم با مجوز کاربر |
| Sharp | تولید تکرارپذیر آیکون و Splash | Apache-2.0 | فقط در زمان توسعه و Build Asset |
| Ganjoor Data | متن رباعیات کلاسیک مولانا | متن کلاسیک در مالکیت عمومی؛ داده عمومی و منبع‌دهی‌شده | Snapshot ثابت Commit `1afaf46`؛ فقط ۳۶۰ رباعی منتخب و بدون وابستگی زمان اجرا |
| FullCalendar | الگوی تقویم | MIT برای Standard | فعلاً استفاده نشده؛ UI سبک اختصاصی سریع‌تر بود |
| Vikunja | Task Management | AGPL-3.0 | فقط مطالعه معماری؛ کدی کپی نشده |
| Cal.com | Scheduling | AGPL-3.0/Commercial | فقط مطالعه UX؛ کدی کپی نشده |

پروژه‌های AGPL به‌صورت Fork یا Copy وارد نشدند تا محصول به انتشار اجباری کل کد وابسته نشود. نسخه‌های دقیق Dependencyها در `pnpm-lock.yaml` ثبت شده‌اند.

## بررسی برای فروشگاه — ۱۴ سپتامبر ۲۰۲۶

فهرست تولید `pnpm licenses list --prod --json` علاوه بر MIT/Apache/BSD، وجود MPL در web-push/lightningcss، EPL-2.0 در elkjs، CC-BY-4.0 در caniuse-lite، OFL در وزیرمتن و ترکیب Apache/LGPL در بسته باینری Windows مربوط به Sharp را نشان داد. وجود کتابخانه در ابزار ساخت/سرور با قرارگرفتن آن داخل APK یکی نیست. اعلام پیشین MIT برای web-push با مدرک نصب‌شده اصلاح شد؛ نسخه نهایی باید NOTICE/مجوز و حدود توزیع وابستگی‌های واقعی خود را نگه دارد. این فهرست جای بازبینی مجوز انتشار عمومی یا تصمیم مالک درباره مجوز خود پروژه نیست.
