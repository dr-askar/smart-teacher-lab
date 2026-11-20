# مختبر المعلم الذكي — Smart Teacher Lab

تطبيق ويب عربي مجاني للمعلمين والطلاب. تصميم المهندس مؤيد ظفر الله عسكر، صدقة جارية لروح المرحوم الأستاذ المربي ظفر الله محمد عسكر.

## النشر على Cloudflare Workers
1. Cloudflare → Workers & Pages → Create application → Continue with GitHub → اختر `dr-askar/smart-teacher-lab`.
2. Project name: `smart-teacher-lab`، Build command: اتركه فارغاً، Deploy command: `npx wrangler deploy`.
3. بعد نشر Worker، افتح Settings → Variables and Secrets → Add → **Secret** باسم `OPENROUTER_API_KEY`، وضع المفتاح هناك فقط.
4. اختيارياً أضف متغير `OPENROUTER_MODEL` بقيمة `openrouter/free`.
5. افتح عنوان workers.dev واختبر الاتصال ثم أنشئ تجربة.

## الحماية
- المفتاح لا يُحفظ في GitHub أو المتصفح.
- Cloudflare Rate Limiting: 3 طلبات لكل IP في الدقيقة، عبر binding `GEN_LIMIT`.
- هذه ليست ميزانية يومية؛ اضبط حدود OpenRouter للمفتاح وراقب الاستهلاك. الخدمة المجانية غير مضمونة دائماً.
- النتائج تُعرض داخل iframe معزول `sandbox=allow-scripts`؛ يجب مراجعة التجارب علمياً وأمنياً قبل مشاركة ملف HTML المصدّر.
- المكتبة تُحفظ محلياً على جهاز المستخدم فقط؛ لا توجد مزامنة أو مشاركة عامة حتى الآن.
- قبل الإطلاق الواسع يُنصح بإضافة Turnstile وحدود إنفاق يومية.

## التطوير المحلي
`npm install` ثم `npx wrangler dev`. ضع المفتاح في `.dev.vars` محلياً (مستبعد من Git) بصيغة `OPENROUTER_API_KEY=...`.
