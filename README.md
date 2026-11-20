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


## Multi-provider routing (v4)
The Worker can use **independent providers**, not multiple OpenRouter accounts. Set Cloudflare Worker runtime **Secrets** (never paste keys into GitHub or the browser):
- `OPENROUTER_API_KEY` — optional, OpenRouter free models only.
- `GEMINI_API_KEY` — optional, Google Gemini API.
- `GROQ_API_KEY` — optional, Groq API.

Optional non-secret Variables: `GEMINI_MODEL=gemini-2.5-flash-lite`, `GROQ_MODEL=llama-3.3-70b-versatile`. These defaults are subject to provider availability and account eligibility. Check provider free-tier limits and **disable paid billing / set spending limits** in each provider dashboard before enabling its secret: Gemini and Groq API models are not intrinsically guaranteed free for every account or over every quota. The Worker does not enforce a monetary cap for those providers.

The Worker selects among configured providers and tries a different independent provider on errors, within a 60-second overall deadline. It never rotates multiple accounts to bypass a single provider's limits. The one-request-per-minute-per-IP Cloudflare rate limit remains in place. `GET /api/health` exposes which providers have secrets configured, without exposing secret values. `POST /api/test` checks the OpenRouter key when configured; otherwise it only checks presence of other provider secrets (not their validity).


## Five OpenRouter key slots
Cloudflare Worker Secrets: `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2`, `OPENROUTER_API_KEY_3`, `OPENROUTER_API_KEY_4`, `OPENROUTER_API_KEY_5`. Keep secrets only in Cloudflare, not GitHub. Set optional plain Variable `OPENROUTER_ACTIVE_KEY` to 1–5 (defaults to 1). Only the explicitly selected key is used; no automatic account cycling or retry with another account on daily-quota exhaustion. `GET /api/health` lists configured slots without revealing secrets. Provider fallback to Gemini/Groq remains available if separately configured. OpenRouter free-tier quotas apply per account and multiple keys do not multiply an account's quota.


## Current request policy (v9)
Generation is limited to **one request per 60 seconds per client IP**, not globally. Different public IPs can generate concurrently; people behind the same school NAT/public IP share the cooldown. Client-side localStorage cooldown supplements, but does not replace, server enforcement. OpenRouter keys configured in Cloudflare are automatically selected by UTC minute among nonempty slots; this is time-based rotation, not a persistent per-request round-robin counter. Provider quotas remain independently enforced by their services.
