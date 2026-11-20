const j=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...h}});
const model=e=>e.OPENROUTER_MODEL||"baidu/ernie-5.5-flash-preview:free";
const backup=e=>e.OPENROUTER_FALLBACK_MODEL||"nvidia/nemotron-3-ultra-550b-a55b:free";
const isFree=id=>typeof id==="string"&&(id==="openrouter/free"||id.endsWith(":free"));
async function checkKey(env){
 let r;
 try{r=await fetch("https://openrouter.ai/api/v1/key",{headers:{"Authorization":"Bearer "+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(10000)})}
 catch(err){throw Error(err?.name==="TimeoutError"?"انتهت مهلة فحص مفتاح OpenRouter":"تعذر الاتصال بخدمة OpenRouter")}
 if(r.status===401||r.status===403)throw Error("مفتاح OpenRouter مرفوض (HTTP "+r.status+")");
 if(!r.ok)throw Error("فحص المفتاح فشل (HTTP "+r.status+")");
 const data=await r.json();
 return {ok:true,keyValid:true,modelAvailability:"not_tested",message:"المفتاح صالح، لكن توفر النماذج المجانية لم يُختبر",usage:data?.data?.usage??null,limit:data?.data?.limit??null};
}
async function ask(e,messages,max_tokens){
 const attempts=[model(e),backup(e)];
 if(attempts.some(id=>!isFree(id)))throw Error("تم رفض نموذج غير مجاني حفاظاً على مجانية المشروع");
 let last="النموذج المجاني غير متاح حالياً";
 const deadline=Date.now()+60000;
 for(let n=0;n<attempts.length;n++){
  const remaining=deadline-Date.now();
  if(remaining<1500)break;
  const target=attempts[n];
  let r;
  try{
   r=await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+e.OPENROUTER_API_KEY,"Content-Type":"application/json","X-Title":"Smart Teacher Lab"},
    body:JSON.stringify({model:target,messages,max_tokens,temperature:.4}),
    signal:AbortSignal.timeout(Math.min(remaining,n===0?45000:remaining))
   });
  }catch(err){last=err?.name==="TimeoutError"?"انتهت مهلة النموذج المجاني":"تعذر الاتصال بـ OpenRouter";continue}
  if(!r.ok){
   if(r.status===401)throw Error("مفتاح OpenRouter غير صالح");
   if(r.status===402)throw Error("رصيد OpenRouter غير كافٍ");
   if(r.status===403)throw Error("مفتاح OpenRouter لا يملك صلاحية استخدام هذا النموذج");
   let details="";try{const d=await r.json();details=String(d?.error?.message||"").slice(0,180)}catch{}
   last=r.status===429?"OpenRouter أعاد 429 للنموذج "+target+(details?": "+details:""): "خطأ OpenRouter ("+r.status+") مع "+target+(details?": "+details:"");
   if(![429,500,502,503,504].includes(r.status))throw Error(last);
   continue;
  }
  let data;try{data=await r.json()}catch{last="استجابة غير مفهومة";continue}
  const choice=data?.choices?.[0],msg=choice?.message;
  const content=typeof msg?.content==="string"?msg.content:Array.isArray(msg?.content)?msg.content.filter(x=>x?.type==="text").map(x=>x.text||"").join(""):"";
  if(!content.trim()){last="استجابة فارغة من النموذج ("+(choice?.finish_reason||"no_text")+")";continue}
  return {content,model:data.model||target};
 }
 throw Error(last+". لا تعاود الطلب قبل انتهاء فترة الانتظار.");
}
export default {async fetch(req,env){
 const u=new URL(req.url);if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(u.pathname==="/api/health"&&req.method==="GET")return j({configured:!!env.OPENROUTER_API_KEY,model:model(env)});
 if(!["/api/test","/api/generate"].includes(u.pathname))return j({error:"غير موجود"},404);
 if(req.method!=="POST")return j({error:"طريقة غير مدعومة"},405);
 const origin=req.headers.get("Origin");if(origin&&origin!==u.origin)return j({error:"طلب خارجي غير مسموح"},403);
 if(!env.OPENROUTER_API_KEY)return j({error:"لم تتم إضافة مفتاح OpenRouter بعد"},503);
 if(!env.GEN_LIMIT)return j({error:"حماية حد الاستخدام غير مفعّلة"},503);
 if(Number(req.headers.get("Content-Length")||0)>8000)return j({error:"طلب كبير جداً"},413);
 if(u.pathname==="/api/test"){try{return j(await checkKey(env))}catch(err){return j({error:err.message},502)}}
 const ip=req.headers.get("CF-Connecting-IP")||"unknown",lim=await env.GEN_LIMIT.limit({key:ip});
 if(!lim.success)return j({error:"تم بلوغ حد الطلبات. حاول بعد دقيقة"},429,{"retry-after":"60"});
 try{
  const body=await req.json();
  const p=typeof body.prompt==="string"?body.prompt.trim():"";if(p.length<12||p.length>3500)return j({error:"الوصف يجب أن يكون بين 12 و3500 حرف"},400);
  const system=`You are a senior educational simulation designer, curriculum specialist and expert JavaScript developer. Create an ENGAGING, pedagogically meaningful, visually polished interactive experiment for an Arabic-speaking teacher. Output only an HTML BODY FRAGMENT with inline <style> and <script>, never a full HTML document, never markdown.

DESIGN QUALITY: make a genuine simulation, not a trivial counter or a generic quiz. Choose a visual metaphor appropriate to the subject: apparatus, circuit, beakers, geometry diagram, animated objects, or SVG diagram. Provide a clear learning objective, a real-world scenario, 2-3 meaningful adjustable variables or choices, a visually changing simulation, scientifically accurate calculations and units, immediate explanatory feedback, a reset button, and one prediction/challenge question with a reveal/check answer. Explain causal relationships and limits. Use Arabic RTL labels, beautiful responsive layout, CSS gradients/cards and accessible buttons. Keep the educational interaction central; avoid decorative clutter.

IMPLEMENTATION: HTML fragment only. Inline CSS scoped under .lab-experiment. One inline script in an IIFE that selects elements within .lab-experiment and wires events with addEventListener. Include <div class="lab-experiment"> as the root. Use SVG and CSS animations when useful. Do not rely on remote assets, imports, fetch, external URLs, libraries, iframes, document.write, eval, localStorage, or browser permissions. No external data. Do not fake physical accuracy: state simplifications. Ensure JavaScript syntax is valid, controls update both numerical results and visual state. Target roughly 4500-10000 characters; prioritize working controls over verbose text. Output code only.`;
  const r=await ask(env,[{role:"system",content:system},{role:"user",content:"Create the following high-quality teaching simulation: "+p}],5200);
  let fragment=r.content.trim().replace(/^```(?:html)?\s*/i,"").replace(/\s*```$/,"");
  if(/<html\b/i.test(fragment))fragment=fragment.replace(/^[\s\S]*?<body[^>]*>/i,"").replace(/<\/body>[\s\S]*$/i,"");
  if(!fragment||fragment.length>65000||/<(?:iframe|object|embed|form|base|meta|link)\b/i.test(fragment)||/\b(?:fetch|XMLHttpRequest|WebSocket|importScripts|eval)\s*\(/i.test(fragment)||/<script\b[^>]*\bsrc\s*=/i.test(fragment)||/<script\b/i.test(fragment)&&!/<\/script>/i.test(fragment)||!/(?:<input|<button|<select)/i.test(fragment))throw Error("النموذج لم يُنتج تجربة تفاعلية مكتملة. حاول بعد دقيقة.");
  const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; form-action \'none\'"><style>body{font:16px system-ui,Tahoma,sans-serif;color:#0f172a;background:#f1f5f9;line-height:1.65;padding:12px;margin:0}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}</style></head><body>'+fragment+'</body></html>';
  return j({html,model:r.model});
 }catch(err){return j({error:err instanceof Error?err.message:"حدث خطأ"},502)}
}};
