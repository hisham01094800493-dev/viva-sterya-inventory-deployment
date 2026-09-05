# نقل التطبيق من Railway إلى Koyeb وAiven

هذا الدليل يجهز التطبيق ليعمل على Koyeb مع MySQL على Aiven. لا تُحفظ كلمات المرور أو شهادات قاعدة البيانات داخل GitHub.

## 1. إعداد Aiven

أنشئ خدمة **MySQL** في Aiven، ثم من صفحة **Connection information** انسخ المضيف والمنفذ واسم المستخدم وكلمة المرور واسم قاعدة البيانات. فعّل TLS، وحمّل شهادة CA إذا طلبت لوحة Aiven ذلك. قيمة `DB_SSL_CA` اختيارية فقط عند الحاجة؛ أما `DB_SSL=true` فهي مفعلة افتراضياً في الإنتاج.

بعد تشغيل الخدمة الجديدة، استورد ملف SQL الناتج من Railway:

```bash
export AIVEN_MYSQL_URL='mysql://USER:PASSWORD@HOST:PORT/DATABASE'
mysql --protocol=TCP --ssl-mode=REQUIRED --host=HOST --port=PORT --user=USER --password DATABASE < railway-mysql-YYYYMMDD-HHMMSS.sql
```

استبدل القيم بالأجزاء الفعلية من بيانات اتصال Aiven، ولا تضع الأمر في مستودع Git.

## 2. استخراج بيانات Railway

من Railway انسخ رابط MySQL الخاص بالخدمة فقط إلى جلسة طرفية محلية، ثم نفذ:

```bash
export RAILWAY_MYSQL_URL='mysql://USER:PASSWORD@HOST:PORT/DATABASE'
chmod +x scripts/export-railway-mysql.sh
scripts/export-railway-mysql.sh ./railway-mysql.sql
sha256sum ./railway-mysql.sql
```

احتفظ بالملف خارج GitHub واحذفه بعد التأكد من نجاح الاستيراد. يستخدم السكريبت `--single-transaction` و`--quick` لتقليل أثر التصدير على قاعدة الإنتاج.

## 3. نشر Koyeb من GitHub

1. أنشئ تطبيقاً جديداً في Koyeb واختر **GitHub** ثم هذا المستودع.
2. اجعل **Builder** هو Dockerfile، واترك مسار Dockerfile هو `Dockerfile`.
3. استخدم المنفذ الداخلي `8000`، وفعّل health check من نوع HTTP على `/health`.
4. أضف متغيرات البيئة من `.env.koyeb.example` في لوحة Koyeb. أدخل القيم الحقيقية يدوياً كـSecrets، ولا ترفع ملف `.env`.
5. نفذ أول Deploy بعد اكتمال استيراد Aiven. يقوم أمر التشغيل بتطبيق migrations ثم يبدأ الخادم.

## 4. متغيرات Koyeb المطلوبة

| المتغير | مطلوب | القيمة |
|---|---:|---|
| `NODE_ENV` | نعم | `production` |
| `PORT` | نعم | `8000` أو القيمة التي يحددها Koyeb |
| `APP_URL` | نعم | رابط Koyeb النهائي |
| `SESSION_SECRET` | نعم | قيمة عشوائية طويلة |
| `DB_HOST` | نعم | مضيف Aiven |
| `DB_PORT` | نعم | منفذ Aiven |
| `DB_USER` | نعم | مستخدم Aiven |
| `DB_PASSWORD` | نعم | كلمة مرور Aiven |
| `DB_NAME` | نعم | اسم قاعدة Aiven |
| `DB_SSL` | نعم | `true` |
| `DB_SSL_CA` | عند الحاجة | محتوى شهادة CA من Aiven |
| `ADMIN_EMAIL` | حسب OAuth | بريد المدير |
| `GOOGLE_CLIENT_ID` | حسب OAuth | معرّف Google OAuth |
| `GOOGLE_CLIENT_SECRET` | حسب OAuth | سر Google OAuth |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | عند استخدام الرفع | بيانات تخزين الملفات الحالية |

لا يحتاج Koyeb إلى `DATABASE_URL` لأن الكود يبنيه تلقائياً من متغيرات `DB_*`. يبقى دعم `DATABASE_URL` متاحاً للتوافق مع Railway، لكن لا تستخدمه إذا كانت سياسة النشر تشترط الفصل الصريح للمتغيرات.

## 5. تحديث Google OAuth

بعد معرفة رابط Koyeb، أضف:

```text
https://YOUR-KOYEB-DOMAIN/api/oauth/google/callback
```

إلى Authorized redirect URIs في Google Cloud، ثم حدّث `APP_URL` في Koyeb.

## ملاحظات الاستمرارية

لا توجد خطة استضافة يمكن ضمان أنها «مجانية إلى الأبد» أو محصنة من إيقاف الحساب. تحقق من حدود Koyeb وAiven الحالية، وسياسات الخمول والحصص، واحتفظ بنسخ احتياطية دورية. كما أن جلسات التطبيق محفوظة في MySQL عبر `express-mysql-session`، ولذلك لا تعتمد على ذاكرة حاوية Koyeb.
