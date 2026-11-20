const VERSION="2026-11-20-private-key-routing-v7";
const j=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...h}});
const keySlots=env=>[env.OPENROUTER_API_KEY,env.OPENROUTER_API_KEY_2,env.OPENROUTER_API_KEY_3,env.OPENROUTER_API_KEY_4,env.OPENROUTER_API_KEY_5];
const activeKey=env=>{const n=Number(env.OPENROUTER_ACTIVE_KEY||1);if(!Number.isInteger(n)||n<1||n>5)throw Error("OPENROUTER_ACTIVE_KEY يجب أن يكون بين 1 و5");return keySlots(env)[n-1]||null};
const PREFERRED=[
 {name:"ERNIE 5.5 Flash",pattern:/^baidu\/.*ernie.*flash.*:free$/i},
 {name:"Nemotron 3 Ultra",pattern:/^nvidia\/.*nemotron-3-ultra.*:free$/i},
 {name:"Particle-1",pattern:/^particle-ai\/.*particle-1.*:free$/i},
 {name:"Nemotron 3.5 Super VL",pattern:/^nvidia\/.*nemotron-3[.]5-super.*:free$/i},
 {name:"Gemma 4 31B",pattern:/^google\/.*gemma-4-31b.*:free$/i},
 {name:"Dots3 Note",pattern:/^dots-studio\/.*dots.*note.*:free$/i},
 {name:"Nemotron 3.5 Lightning",pattern:/^nvidia\/.*nemotron-3[.]5-lightning.*:free$/i}
];
let catalogCache=null,catalogTime=0;
async function availableModels(){
 if(catalogCache&&Date.now()-catalogTime<600000)return catalogCache;
 const response=await fetch("https://openrouter.ai/api/v1/models",{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("تعذر تحديث قائمة النماذج المجانية من OpenRouter");
 const data=await response.json(),all=Array.isArray(data?.data)?data.data:[];
 const models=PREFERRED.map(p=>{const m=all.find(x=>p.pattern.test(x.id)&&Number(x.pricing?.prompt)===0&&Number(x.pricing?.completion)===0);return m?{id:m.id,name:p.name}:null}).filter(Boolean);
 if(models.length<2)throw Error("لا يوجد حالياً عدد كافٍ من النماذج المجانية المؤكدة");
 catalogCache=models;catalogTime=Date.now();return models;
}
function orderModels(models,key){
 let hash=0;for(const ch of key)hash=(Math.imul(hash,31)+ch.charCodeAt(0))|0;
 const start=(Math.abs(hash)+Math.floor(Date.now()/60000))%models.length;
 return [models[start],models[(start+1)%models.length]];
}
async function checkKey(env){
 let r;
 try{r=await fetch("https://openrouter.ai/api/v1/key",{headers:{"Authorization":"Bearer "+activeKey(env)},signal:AbortSignal.timeout(10000)})}
 catch(err){throw Error(err?.name==="TimeoutError"?"انتهت مهلة فحص مفتاح OpenRouter":"تعذر الاتصال بخدمة OpenRouter")}
 if(r.status===401||r.status===403)throw Error("مفتاح OpenRouter مرفوض (HTTP "+r.status+")");
 if(!r.ok)throw Error("فحص المفتاح فشل (HTTP "+r.status+")");
 const data=await r.json();
 return {ok:true,keyValid:true,modelAvailability:"not_tested",message:"المفتاح صالح، لكن توفر النماذج المجانية لم يُختبر",usage:data?.data?.usage??null,limit:data?.data?.limit??null};
}
async function ask(e,messages,max_tokens,clientKey){
 const attempts=orderModels(await availableModels(),clientKey);
 let last="النموذج المجاني غير متاح حالياً";
 const deadline=Date.now()+60000;
 for(let n=0;n<attempts.length;n++){
  const remaining=deadline-Date.now();
  if(remaining<1500)break;
  const target=attempts[n].id;
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
   if(r.status===429&&/free-models-per-day/i.test(details))throw Error("انتهت الحصة اليومية المجانية لحساب OpenRouter. تغيير النموذج لن يحل المشكلة؛ انتظر تجدد الحصة اليومية. التجارب الجاهزة تعمل دون AI.");
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
async function askProviders(env,messages,maxTokens,clientKey){
 const deadline=Date.now()+60000,errors=[];
 const providers=[];
 if(env.GEMINI_API_KEY)providers.push("gemini");
 if(env.GROQ_API_KEY)providers.push("groq");
 if(activeKey(env))providers.push("openrouter");
 if(!providers.length)throw Error("لم تُضف أي مفاتيح للمزودين");
 // Rotate independent providers by minute; never rotate accounts to evade a provider quota.
 const shift=Math.floor(Date.now()/60000)%providers.length;
 const ordered=providers.slice(shift).concat(providers.slice(0,shift));
 for(let idx=0;idx<ordered.length;idx++){
  const provider=ordered[idx],remaining=deadline-Date.now();
  if(remaining<2500)break;
  const timeout=Math.min(remaining,idx===ordered.length-1?remaining:Math.max(8000,Math.floor(remaining/(ordered.length-idx))));
  let url,headers={"Content-Type":"application/json"},body,modelName;
  if(provider==="gemini"){
   modelName=env.GEMINI_MODEL||"gemini-2.5-flash-lite";
   url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(modelName)+":generateContent";
   headers["x-goog-api-key"]=env.GEMINI_API_KEY;
   body={systemInstruction:{parts:[{text:messages.find(m=>m.role==="system")?.content||""}]},contents:[{role:"user",parts:[{text:messages.filter(m=>m.role==="user").map(m=>m.content).join("\n")}]}],generationConfig:{maxOutputTokens:maxTokens,temperature:0.4}};
  }else if(provider==="groq"){
   modelName=env.GROQ_MODEL||"llama-3.3-70b-versatile";
   url="https://api.groq.com/openai/v1/chat/completions";
   headers.Authorization="Bearer "+env.GROQ_API_KEY;
   body={model:modelName,messages,max_tokens:maxTokens,temperature:0.4};
  }else{
   try{
    const candidates=orderModels(await availableModels(),clientKey);
    modelName=candidates[0].id;
   }catch(e){errors.push("OpenRouter: "+e.message);continue}
   url="https://openrouter.ai/api/v1/chat/completions";
   headers.Authorization="Bearer "+activeKey(env);
   body={model:modelName,messages,max_tokens:maxTokens,temperature:0.4};
  }
  try{
   const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
   if(!response.ok){
    let detail="";try{const d=await response.json();detail=String(d?.error?.message||d?.error?.status||"").slice(0,100)}catch{}
    errors.push(provider+": HTTP "+response.status+(response.status===429?" (حصة أو ازدحام)":"")+(detail?": "+detail:""));
    continue;
   }
   const data=await response.json();
   const content=provider==="gemini"?(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join(""):typeof data?.choices?.[0]?.message?.content==="string"?data.choices[0].message.content:"";
   if(content.trim())return {content,model:provider+"/"+modelName,provider};
   errors.push(provider+": استجابة فارغة");
  }catch(e){errors.push(provider+": "+(e?.name==="TimeoutError"?"انتهت المهلة":"تعذر الاتصال"))}
 }
 throw Error("تعذر التوليد عبر المزودين: "+errors.join(" | ").slice(0,350));
}
export default {async fetch(req,env){
 const u=new URL(req.url);if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(u.pathname==="/api/health"&&req.method==="GET")return j({configured:!!(keySlots(env).some(Boolean)||env.GEMINI_API_KEY||env.GROQ_API_KEY),providers:{openrouter:!!activeKey(env),gemini:!!env.GEMINI_API_KEY,groq:!!env.GROQ_API_KEY},openrouterKeyCount:keySlots(env).filter(Boolean).length,model:"multi-provider",version:VERSION,preferredModels:PREFERRED.map(x=>x.name)});
 if(!["/api/test","/api/generate"].includes(u.pathname))return j({error:"غير موجود"},404);
 if(req.method!=="POST")return j({error:"طريقة غير مدعومة"},405);
 const origin=req.headers.get("Origin");if(origin&&origin!==u.origin)return j({error:"طلب خارجي غير مسموح"},403);
 if(!(keySlots(env).some(Boolean)||env.GEMINI_API_KEY||env.GROQ_API_KEY))return j({error:"لم تتم إضافة مفتاح لأي مزود"},503);
 if(!env.GEN_LIMIT)return j({error:"حماية حد الاستخدام غير مفعّلة"},503);
 if(Number(req.headers.get("Content-Length")||0)>8000)return j({error:"طلب كبير جداً"},413);
 if(u.pathname==="/api/test"){try{return j(activeKey(env)?{...await checkKey(env),version:VERSION,providers:{gemini:!!env.GEMINI_API_KEY,groq:!!env.GROQ_API_KEY}}:{ok:true,configured:true,version:VERSION,message:"تم العثور على مفاتيح مزودين، لكن لم تُختبر صلاحيتها",providers:{gemini:!!env.GEMINI_API_KEY,groq:!!env.GROQ_API_KEY}})}catch(err){return j({error:err.message},502)}}
 const ip=req.headers.get("CF-Connecting-IP")||"unknown",lim=await env.GEN_LIMIT.limit({key:"global-generation"});
 if(!lim.success)return j({error:"المختبر يسمح بطلب توليد واحد فقط في الدقيقة لجميع المستخدمين. حاول بعد دقيقة"},429,{"retry-after":"60"});
 try{
  const body=await req.json();
  const p=typeof body.prompt==="string"?body.prompt.trim():"";if(p.length<12||p.length>3500)return j({error:"الوصف يجب أن يكون بين 12 و3500 حرف"},400);
  const system=`You are a senior educational simulation designer, curriculum specialist and expert JavaScript developer. Create an ENGAGING, pedagogically meaningful, visually polished interactive experiment for an Arabic-speaking teacher. Output only an HTML BODY FRAGMENT with inline <style> and <script>, never a full HTML document, never markdown.

DESIGN QUALITY: make a genuine simulation, not a trivial counter or a generic quiz. Choose a visual metaphor appropriate to the subject: apparatus, circuit, beakers, geometry diagram, animated objects, or SVG diagram. Provide a clear learning objective, a real-world scenario, 2-3 meaningful adjustable variables or choices, a visually changing simulation, scientifically accurate calculations and units, immediate explanatory feedback, a reset button, and one prediction/challenge question with a reveal/check answer. Explain causal relationships and limits. Use Arabic RTL labels, beautiful responsive layout, CSS gradients/cards and accessible buttons. Keep the educational interaction central; avoid decorative clutter.

IMPLEMENTATION: HTML fragment only. Inline CSS scoped under .lab-experiment. One inline script in an IIFE that selects elements within .lab-experiment and wires events with addEventListener. Include <div class="lab-experiment"> as the root. Use SVG and CSS animations when useful. Do not rely on remote assets, imports, fetch, external URLs, libraries, iframes, document.write, eval, localStorage, or browser permissions. No external data. Do not fake physical accuracy: state simplifications. Ensure JavaScript syntax is valid, controls update both numerical results and visual state. Target roughly 4500-10000 characters; prioritize working controls over verbose text. Output code only.`;
  const r=await askProviders(env,[{role:"system",content:system},{role:"user",content:"Create the following high-quality teaching simulation: "+p}],5200,ip);
  let fragment=r.content.trim().replace(/^```(?:html)?\s*/i,"").replace(/\s*```$/,"");
  if(/<html\b/i.test(fragment))fragment=fragment.replace(/^[\s\S]*?<body[^>]*>/i,"").replace(/<\/body>[\s\S]*$/i,"");
  if(!fragment||fragment.length>65000||/<(?:iframe|object|embed|form|base|meta|link)\b/i.test(fragment)||/\b(?:fetch|XMLHttpRequest|WebSocket|importScripts|eval)\s*\(/i.test(fragment)||/<script\b[^>]*\bsrc\s*=/i.test(fragment)||/<script\b/i.test(fragment)&&!/<\/script>/i.test(fragment)||!/(?:<input|<button|<select)/i.test(fragment))throw Error("النموذج لم يُنتج تجربة تفاعلية مكتملة. حاول بعد دقيقة.");
  const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; form-action \'none\'"><style>body{font:16px system-ui,Tahoma,sans-serif;color:#0f172a;background:#f1f5f9;line-height:1.65;padding:12px;margin:0}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}</style></head><body>'+fragment+'</body></html>';
  return j({html,model:r.model});
 }catch(err){return j({error:err instanceof Error?err.message:"حدث خطأ"},502)}
}};
