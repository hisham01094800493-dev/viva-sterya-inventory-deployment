# Smart Inventory — Railway + Vercel Deployment

هذا المستودع يحتوي على تطبيق **Smart Inventory** بعد فصله إلى حزمتين مستقلتين يمكن رفع كل منهما على منصتها المخصصة. يوجد الباك إند في `backend/` ويعمل عبر Node.js وExpress وGoogle OAuth، بينما توجد واجهة React في `frontend/` وتُنشر عبر Vercel.

| المجلد | المهمة | منصة النشر | أمر التشغيل الإنتاجي |
|---|---|---|---|
| `backend/` | API، قاعدة البيانات، Google OAuth، الجلسات وtRPC | Railway | `node server.js` |
| `frontend/` | واجهة React العربية RTL | Vercel | `vite build` |

## 1. نشر الباك إند على Railway

أنشئ مشروعاً جديداً في [Railway](https://railway.app)، ثم اربطه بهذا المستودع من GitHub. في إعدادات الخدمة اجعل **Root Directory** مساوية لـ `backend`، ثم استخدم الإعدادات التالية:

| الإعداد | القيمة |
|---|---|
| Build Command | `npm install && npm run build` |
| Start Command | `node server.js` |
| Procfile | موجود بالفعل: `web: node server.js` |
| Healthcheck Path | `/health` |

أضف متغيرات البيئة في Railway. لا ترفع ملف `.env` الحقيقي إلى GitHub؛ استخدم القالب الموجود في `backend/env.example.template` كمرجع للأسماء فقط. وللتشغيل المحلي انسخه باسم `backend/.env` وأدخل القيم الحقيقية.

```env
PORT=3000
SESSION_SECRET=ضع_قيمة_عشوائية_طويلة_هنا
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_SERVER_URL=https://viva-sterya-inventory-production.up.railway.app
CLIENT_URL=https://viva-sterya-inventory.vercel.app
DATABASE_URL=mysql://...
```

بعد النشر، تأكد من أن الرابط التالي يعيد استجابة JSON تتضمن `status: "ok"`:

```text
https://viva-sterya-inventory-production.up.railway.app/health
```

### إعداد Google OAuth

أنشئ OAuth 2.0 Client من [Google Cloud Console](https://console.cloud.google.com/apis/credentials)، ثم أضف **Authorized redirect URI** التالي حرفياً:

```text
https://viva-sterya-inventory-production.up.railway.app/auth/google/callback
```

أضف أيضاً العنوان التالي ضمن **Authorized JavaScript origins** إذا طلبه Google:

```text
https://viva-sterya-inventory.vercel.app
```

## 2. نشر الواجهة على Vercel

في [Vercel](https://vercel.com/new)، اختر المستودع نفسه، ثم اجعل **Root Directory** مساوية لـ `frontend`. يكتشف Vercel تطبيق React/Vite تلقائياً بسبب وجود `vercel.json` و`package.json` داخل المجلد.

أضف متغير البيئة التالي في إعدادات مشروع Vercel، لقيم بيئات Production وPreview عند الحاجة. يوجد القالب المرجعي في `frontend/env.example.template`، ويمكن نسخه محلياً باسم `frontend/.env` عند الحاجة.

```env
VITE_API_URL=https://viva-sterya-inventory-production.up.railway.app
```

بعد الحفظ، أعد النشر من Vercel. الواجهة تستدعي `${VITE_API_URL}/api/trpc` مع `credentials: include`، ويعمل الباك إند بتكوين CORS مقيد على واجهة Vercel المحددة.

## 3. الجلسات والأمان

تم ضبط جلسة Express للاتصال بين Vercel وRailway بهذه الخصائص:

```js
cookie: { secure: true, sameSite: "none", httpOnly: true }
```

وهذا يتيح إرسال الكوكيز الآمنة عبر نطاقين مختلفين. لا تغيّر `CLIENT_URL` أو عنوان CORS أو رابط OAuth callback إلا إذا غيّرت النطاقات فعلاً، وعندها يجب تحديث القيم الثلاثة معاً وإضافة الرابط الجديد في إعدادات Google OAuth.

> **ملاحظة:** توجد نسخة منشورة مسبقاً ضمن بيئة Manus، لكن هذا المستودع جُهّز بناءً على طلبك للنشر الخارجي المنفصل على Railway وVercel.

## 4. التحقق المحلي قبل الرفع

افتح نافذتين طرفيتين. في الأولى جهز متغيرات الباك إند في ملف `backend/.env` غير المُتتبّع، ثم شغّل:

```bash
cd backend
npm install
npm run build
npm start
```

وفي الثانية أنشئ `frontend/.env` غير المُتتبّع واضعاً `VITE_API_URL=http://localhost:3000` للاختبار المحلي، ثم شغّل:

```bash
cd frontend
npm install
npm run dev
```

## 5. هيكل المستودع

```text
.
├── backend/
│   ├── src/
│   ├── server.js
│   ├── Procfile
│   └── env.example.template
├── frontend/
│   ├── src/
│   ├── vercel.json
│   └── env.example.template
├── README.md
└── .gitignore
```
