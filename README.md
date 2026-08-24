# Smart Inventory على Railway

نظام عربي لإدارة المخزون يشمل الأصناف والمخازن والإضافة والصرف والتحويلات والتقارير وصور الأذونات. هذه النسخة تعمل في **خدمة Railway واحدة** وتستخدم **MySQL** للبيانات و**Railway Bucket** للصور والمستندات و**Google OAuth** لتسجيل الدخول.

## قبل النشر

أنشئ داخل مشروع Railway خدمات باسم `MySQL` و`InventoryFiles` وخدمة GitHub للتطبيق. راجع الدليل التفصيلي في [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md)، ثم انسخ أسماء المتغيرات من [`.env.railway.example`](./.env.railway.example) إلى متغيرات خدمة التطبيق؛ لا ترفع ملف `.env` حقيقيًا إلى GitHub.

بعد حصولك على النطاق العام، أضف هذا الرابط إلى Google Cloud كـ **Authorized redirect URI**:

```text
https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/oauth/google/callback
```

## أوامر التطوير

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm start
```

تستخدم الخدمة متغير `PORT` الذي توفره Railway تلقائيًا، وتتحقق Railway من الإقلاع عبر `/health`.

## نقل البيانات الحالية

لا تضع البيانات أو صور الأذونات داخل GitHub. استخدم حزمة الترحيل المولدة خارج المستودع بعد إنشاء MySQL وBucket وتسجيل الدخول بحساب المدير. يتحقق الاستيراد من بنية قاعدة البيانات وبصمة SHA-256 للملفات قبل إعادة ربطها بـBucket.
