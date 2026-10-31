# تقرير الاختبار الفعلي (Live End-to-End Test)

**التاريخ:** 2026-10-31 / 2026-11-01 (توقيت القاهرة)
**الفرع:** `fix/daily-report-5pm-notifications`
**الهدف:** إثبات أن التقرير اليومي يصل فعليًا (بريد + إشعارات) بعد الإصلاح، وليس فقط نجاح اختبارات الوحدة.

---

## بيئة الاختبار (كاملة، حقيقية)

| المكوّن | الإعداد |
|---|---|
| قاعدة البيانات | MariaDB 10.11 محلية، السكيما كاملة عبر `drizzle-kit push` (28 جدول) |
| السيرفر | `node dist/index.js` — النسخة المبنية إنتاجيًا (`NODE_ENV=production`) |
| SMTP | سيرفر SMTP محلي حقيقي يستقبل الرسائل ويحفظها (`aiosmtpd` على 127.0.0.1:2525) |
| البيانات | مخزن + مدير + 4 أصناف (3 منها تحت حد الطلب) |
| الأسرار | `CRON_SECRET=test-cron-secret-abc123`, `SESSION_SECRET` مضبوط |

---

## النتائج الفعلية

### 1) نقطة النبضة — GET بدون سر
```
GET /api/scheduled/daily-report-heartbeat
→ 403 {"error":"cron-only"}
```
✅ صحيح: مرفوض، لكن بسبب الصلاحية (403) وليس 404.

### 2) نقطة النبضة — GET مع السر (قبل وقت الاستحقاق)
```
GET + Authorization: Bearer <secret>
→ 200 {"ok":true,"source":"external-cron","status":"skipped","reason":"not-due","reportDate":"2026-11-01"}
```
✅ صحيح: GET مقبول (وهذا كان سبب المشكلة الأصلي)، ولم يُرسل شيئًا لأن الوقت لم يحن.

### 3) نقطة النبضة — POST مع السر
```
POST + Authorization: Bearer <secret>
→ 200 {"ok":true,"source":"external-cron","status":"skipped","reason":"not-due"}
```
✅ متوافق مع الطريقتين.

### 4) طريقة غير مدعومة
```
DELETE → 405
```
✅ صحيح.

### 5) **الاختبار الحاسم** — ضبط وقت الجدولة على الوقت الحالي بتوقيت القاهرة ثم النبضة
```
GET + secret
→ 200 {
    "ok": true, "source": "external-cron", "status": "success",
    "reportDate": "2026-11-01", "runId": 1,
    "lowStockCount": 0, "criticalCount": 0, "buildingAlerts": 0, "unassigned": 0,
    "email": true, "emailError": null,
    "managers": 2, "managersError": null,
    "whatsapp": false, "whatsappError": "Missing WhatsApp configuration credentials."
  }
```
✅ **الإيميل اتبعت فعليًا** (`email: true`)، **2 إشعارات داخلية** اتحفظت للمدير والمدير العام.

### 6) التحقق من صندوق البريد الحقيقي
```
رسالة واحدة وصلت: 1
From: reports@viva.test
To: manager@viva.test
Subject: =?UTF-8?B?...?= (Smart Inventory — التقرير التنفيذي اليومي 2026-11-01)
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable
حجم الرسالة: 10,997 بايت / HTML: 6,677 بايت
```
المحتوى العربي داخل الرسالة (تم فك الترميز والتحقق):
- ✅ `dir="rtl"` موجود
- ✅ جدول الأصناف موجود
- ✅ طماطم / زيت زيتون / أرز / دقيق — كلها ظاهرة بأرصدتها
- ✅ التاريخ `2026-11-01` ظاهر
- ✅ عنوان «الملخص التنفيذي اليومي» ظاهر

### 7) الحماية من الإرسال المكرر
```
نبضة ثانية في نفس اليوم
→ 200 {"status":"skipped","reason":"not-due"}
عدد الرسائل في الصندوق: 1 (لم يزد)
```
✅ لا إرسال مكرر — وهذا يمنع إزعاج المدراء كل 5 دقائق.

### 8) نقطة التشخيص الجديدة
```
GET /api/scheduled/daily-report-status + secret
→ 200 {
    "ok": true, "enabled": true, "time": "00:34",
    "timeZone": "Africa/Cairo",
    "nextRunAt": "2026-10-31T22:34:00.000Z",
    "lastRun": { "status": "success", "reportDate": "2026-11-01", ... },
    "channels": { "email": true, "whatsapp": false, "inApp": true, "recipients": 1 },
    "cronSecretConfigured": true
  }
```
✅ تعرض حالة كل قناة وميعاد التشغيل القادم.

### 9) نقطة التشخيص بسر خاطئ
```
GET /api/scheduled/daily-report-status + Bearer wrong
→ 401
```
✅ محمية.

---

## سجل قاعدة البيانات بعد التشغيل

```
report_scheduler_runs:
  id: 1
  report_date: 2026-11-01
  status: success
  started_at: 2026-10-31 22:34:45
  completed_at: 2026-10-31 22:34:45
  error_message: NULL
  result_summary: {"lowStockCount":0,...,"email":true,"managers":2,...}

notifications:
  id 1 → user 2 (manager)  type: daily_report  title: التقرير التنفيذي اليومي
  id 2 → user 1 (admin)    type: daily_report  title: التقرير التنفيذي اليومي
```

---

## ملاحظات مهمة من الاختبار

1. **الواتساب غير مفعّل** في بيئة الاختبار (`Missing WhatsApp configuration credentials`) — يحتاج `WHATSAPP_*` في متغيرات البيئة. التقرير لم يفشل بسبب ذلك، وهذا سلوك صحيح (فشل قناة واحدة لا يوقف الباقي).
2. **`lowStockCount: 0`** رغم وجود 3 أصناف تحت حد الطلب — السبب أن نسبة التنبيه 20%، والأصناف (30 من 50، 5 من 20، 10 من 25) أعلى من 20% من حد الطلب. هذا سلوك المنطق الحالي وليس خطأ. لو أردت التنبيه عند الوصول لحد الطلب نفسه، ارفع النسبة إلى 100%.
3. **`nextRunAt`** ظهر مساويًا للوقت الحالي لأن وقت الجدولة كان مضبوطًا على 00:34 للاختبار — في الإنتاج سيكون 17:00 القاهرة.

---

## الخلاصة

| الاختبار | النتيجة |
|---|---|
| GET بدون سر | ✅ 403 |
| GET مع السر | ✅ 200 (كان 404 قبل الإصلاح) |
| POST مع السر | ✅ 200 |
| DELETE | ✅ 405 |
| **إرسال التقرير فعليًا** | ✅ **الإيميل وصل + إشعارين داخليين** |
| محتوى الإيميل العربي | ✅ كامل وصحيح |
| منع التكرار | ✅ لا إرسال ثانٍ |
| نقطة التشخيص | ✅ تعمل ومحمية |

**الحل مُثبت عمليًا وليس نظريًا.**
