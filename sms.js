/* Saudi bank SMS parser — pure, offline, no network. Works in browser (window.SmsParse) and Node (module.exports). */
(function(root){
'use strict';
function digits(s){return String(s||'').replace(/[٠-٩]/g,function(c){return '٠١٢٣٤٥٦٧٨٩'.indexOf(c);}).replace(/[۰-۹]/g,function(c){return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);})
  .replace(/٫/g,'.').replace(/٬/g,',').replace(/\u200f|\u200e|\u061c/g,'').replace(/：/g,':');}
var CUR='(?:SAR|SR|S\\.R|ر\\.?\\s?س|ريال(?:\\s*سعودي)?|رس)';
var NUM='(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
var BAL=/رصيد|الرصيد|المتاح|متاح|balance|\bbal\b|available|avl|limit|الحد/i;
var AMT_HINT=/مبلغ|المبلغ|amount|amt|شراء|purchase|بقيمة|بـ|دفع|paid|payment|سحب|withdraw|خصم|debit|مدفوعات/i;
function toNum(s){return Number(String(s).replace(/,/g,''));}
function findAmount(lines){var cands=[];
  var re1=new RegExp(CUR+'\\s*'+NUM,'gi'),re2=new RegExp(NUM+'\\s*'+CUR,'gi');
  lines.forEach(function(ln,i){var m,found=false;[re1,re2].forEach(function(re){re.lastIndex=0;while((m=re.exec(ln))){found=true;
      var before=ln.slice(0,m.index);var bal=BAL.test(before.slice(-22));
      cands.push({v:toNum(m[1]),i:i,pos:m.index,bal:bal,hint:AMT_HINT.test(ln)});}});
    if(!found){var mm=ln.match(/^\s*(?:مبلغ|المبلغ|amount|amt|بمبلغ|بقيمة)\s*[:\-]?\s*(\d[\d,]*(?:\.\d{1,2})?)/i);if(mm)cands.push({v:toNum(mm[1]),i:i,pos:0,bal:false,hint:true});}});
  cands=cands.filter(function(c){return c.v>0;});
  var good=cands.filter(function(c){return !c.bal;});if(!good.length)return null;
  var h=good.filter(function(c){return c.hint;});return (h.length?h[0]:good[0]).v;}
function pad(n){return String(n).padStart(2,'0');}
function valid(y,m,d){return y>=2000&&y<2100&&m>=1&&m<=12&&d>=1&&d<=31;}
function findDate(text,ref){ref=ref||new Date();var m,out=null;
  if((m=text.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/))&&valid(+m[1],+m[2],+m[3]))out=[+m[1],+m[2],+m[3]];
  else if((m=text.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/))&&valid(+m[3],+m[2],+m[1]))out=[+m[3],+m[2],+m[1]];
  else if((m=text.match(/\b(\d{2})[-\/.](\d{1,2})[-\/.](\d{2})\b/))){
    // ambiguous yy/mm/dd (Al Rajhi style) vs dd/mm/yy: pick the one closest to today (not in the future)
    var a=[2000+ +m[1],+m[2],+m[3]],b=[2000+ +m[3],+m[2],+m[1]],best=null,bd=Infinity;
    [a,b].forEach(function(c){if(!valid(c[0],c[1],c[2]))return;var t=new Date(c[0],c[1]-1,c[2]),diff=(ref-t)/864e5;var score=diff<-1?1e6-diff:Math.abs(diff);if(score<bd){bd=score;best=c;}});out=best;}
  var date=out?out[0]+'-'+pad(out[1])+'-'+pad(out[2]):null;
  var tm=text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  return {date:date,time:tm?pad(+tm[1])+':'+tm[2]:null};}
var MER_LINE=/^\s*(?:لدى|عند|من|في|إلى|الى|لـ|التاجر|المتجر|اسم التاجر|الجهة|المستفيد|اسم المستفيد|merchant(?:\s*name)?|at|from|to|mer|store|beneficiary|payee)\s*[:\-]\s*(.+)$/i;
var NOT_MER=/^(?:\*|\d|x{2,}|حساب|بطاقة|البطاقة|الحساب|account|acc|card|a\/c|mada|مدى|visa|فيزا|apple|stc\s*pay$)/i;
function clean(s){return s.replace(/\s+(?:on|في|بتاريخ|date|بـ?\s*\d).*$/i,'').replace(/[.,،;]+$/,'').replace(/\s{2,}/g,' ').trim();}
function findMerchant(lines,text){var i,m;
  for(i=0;i<lines.length;i++){m=lines[i].match(MER_LINE);if(m){var v=clean(m[1]);if(v&&!NOT_MER.test(v)&&!/^\d[\d\s\/:\-.]*$/.test(v))return v.slice(0,40);}}
  m=text.match(/\bat\s+([A-Za-z][A-Za-z0-9 .&'\-]{1,40}?)(?=\s+(?:on|in|using|via|with|date)\b|[,.\n]|\s+\d|$)/i);if(m)return m[1].trim();
  m=text.match(/\b(?:to|paid to)\s+([A-Za-z][A-Za-z0-9 .&'\-]{1,40}?)(?=\s+(?:was|on|is|has|using|via)\b|[,.\n]|$)/i);if(m)return m[1].trim();
  m=text.match(/(?:لدى|عند|شراء\s+من|(?:حوالة|تحويل)[^\n]{0,12}?(?:إلى|الى|لـ))\s+([^\n،,:]{2,40}?)(?=\s+(?:في|بتاريخ|بمبلغ|بقيمة)\b|[\n،,]|$)/);if(m)return clean(m[1]);
  return '';}
var CREDIT=/إيداع|ايداع|حوالة\s*واردة|حواله\s*وارده|واردة|استرداد|مسترد|إرجاع|ارجاع|راتب|عكس\s*عملية|refund|refunded|\bcredit(?:ed)?\b|deposit|incoming|received|reversal|salary/i;
var DEBIT=/شراء|purchase|\bpos\b|نقاط\s*البيع|سحب|withdraw|خصم|debit|مدفوعات|دفع|paid|payment|حوالة\s*صادرة|outgoing|سداد|اشتراك/i;
function isCredit(text){var t=text.replace(/credit\s*card|بطاقة\s*ائتمان(?:ية)?|بطاقة\s*الائتمان/gi,'');
  if(!CREDIT.test(t))return false;
  if(/حوالة\s*واردة|إيداع|ايداع|استرداد|refund|deposit|salary|راتب|reversal/i.test(t))return true;
  return !DEBIT.test(t);}
/* keyword → list of preferred category names (first existing wins) */
var KW=[
  [/aldrees|الدريس|sasco|ساسكو|naft|نفط|محطة|بنزين|وقود|fuel|petrol|gas\s*station|maraya|مرايا|المحروقات/i,['بنزين']],
  [/oil\s*change|تغيير\s*(?:زيت|الزيت)|زيت|maintenance|صيانة|tyre|tire|كفرات|كفر|إطارات|اطارات|car\s*accessor|اكسسوارات\s*سيارات|parking|مواقف|car\s*wash|مغسلة|غسيل\s*سيارات|petromin\s*express|بترومين\s*اكسبرس|ورشة|workshop|قطع\s*غيار|spare\s*parts|auto\s*parts/i,['سيارة','بنزين']],
  [/petromin|بترومين/i,['بنزين']],
  [/panda|بنده|بندة|danube|الدانوب|tamimi|التميمي|othaim|العثيم|lulu|لولو|carrefour|كارفور|nesto|نستو|farm\s*superstores|\bfarm\b|المزرعة|bin\s*dawood|بن\s*داود|manuel|مانويل|hyper|هايبر|supermarket|سوبرماركت|سوبر\s*ماركت|بقالة|بقاله|تموينات|grocery|nana|نعناع|ninja|نينجا/i,['مقاضي','بقالة']],
  [/starbucks|ستاربكس|barn'?s|بارنز|dunkin|دانكن|tim\s*hortons|تيم\s*هورتنز|half\s*million|هاف\s*مليون|dose|دوز|caf[eé]|coffee|كافيه|كوفي|قهوة|كافي|espresso|roast|jahez|جاهز|hunger\s*station|هنقرستيشن|هنقر|mrsool|مرسول|keeta|كيتا|toyou|تويو|chefz|مطعم|restaurant|mc\s*donald|ماكدونالد|albaik|al\s*baik|البيك|kfc|كنتاكي|burger|برجر|herfy|هرفي|kudu|كودو|shawarma|شاورما|pizza|بيتزا|domino|subway|grill|مشويات|بخاري|مندي/i,['مطاعم','قهوة','أكل']],
  [/careem|كريم|uber|اوبر|أوبر|bolt|jeeny|جيني|taxi|تاكسي|سارب|darb|درب|saptco|سابتكو|metro|مترو/i,['مواصلات']],
  [/pharmacy|صيدلية|صيدليه|nahdi|النهدي|dawaa|الدواء|whites|وايتس|hospital|مستشفى|clinic|عيادة|مستوصف|dental|أسنان|\blab\b|مختبر/i,['صحة']],
  [/stc(?!\s*pay)|mobily|موبايلي|zain|زين|سوا|كهرباء|electricity|\bsec\b|المياه|water|فاتورة|bill|سداد|internet|انترنت/i,['فواتير']],
  [/netflix|نتفلكس|shahid|شاهد|spotify|سبوتيفاي|playstation|بلايستيشن|steam|xbox|cinema|سينما|vox|muvi|موفي|game|ألعاب|boulevard|بوليفارد/i,['ترفيه']],
  [/noon|نون|amazon|أمازون|امازون|jarir|جرير|extra|اكسترا|إكسترا|shein|شي\s*ان|namshi|نمشي|ikea|ايكيا|centrepoint|سنتربوينت|h&m|zara|زارا|mall|مول|clothes|ملابس|store/i,['تسوق']]
];
/* ---- merchant keys for learning: tolerant to case, Arabic letter variants, digits, branch/city/country suffixes ---- */
var STOP={ksa:1,sa:1,sau:1,saudi:1,arabia:1,riyadh:1,ryadh:1,riyad:1,jeddah:1,jedda:1,dammam:1,khobar:1,alkhobar:1,makkah:1,mecca:1,madinah:1,medina:1,
  qassim:1,buraidah:1,tabuk:1,abha:1,taif:1,hail:1,jubail:1,dhahran:1,branch:1,br:1,co:1,ltd:1,est:1,llc:1,inc:1,company:1,trading:1,pos:1,mada:1,
  'الرياض':1,'رياض':1,'جده':1,'الدمام':1,'الخبر':1,'مكه':1,'المدينه':1,'المنوره':1,'القصيم':1,'بريده':1,'تبوك':1,'ابها':1,'الطايف':1,'الطائف':1,'حايل':1,'الجبيل':1,'الظهران':1,
  'فرع':1,'الفرع':1,'شركه':1,'مؤسسه':1,'موسسه':1,'السعوديه':1,'المملكه':1,'العربيه':1,'للتجاره':1,'التجاريه':1,'المحدوده':1,'محدوده':1};
function arNorm(s){return digits(s).toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
  .replace(/عبد\s+ال/g,'عبدال');}
function normMerchant(m){var t=arNorm(m).replace(/[^a-z\u0621-\u064a]+/g,' ').trim();if(!t)return '';
  var w=t.split(/\s+/),k=w.filter(function(x){return x.length>1&&!STOP[x];});
  return (k.length?k:w).join(' ');}
/* fingerprint of the message text minus amounts/dates/times/card digits — for SMS with no merchant */
function fingerprint(raw){var t=arNorm(raw).replace(/[a-z]{3}\s*[\d.,]+/g,' ').replace(/[^a-z\u0621-\u064a]+/g,' ').replace(/\s+/g,' ').trim();
  if(t.length<4)return '';var h=5381;for(var i=0;i<t.length;i++)h=((h*33)^t.charCodeAt(i))>>>0;return 'fp:'+h.toString(36);}
/* learned map lookup: exact key, then token-prefix (either way), then first-two-words, then fingerprint */
function lookupLearned(learned,key,fp,catNames){if(!learned)return null;var ok=function(c){return c&&catNames.indexOf(c)>=0;};
  if(fp&&ok(learned[fp])&&!key)return learned[fp];
  if(!key)return null;
  var idx={};Object.keys(learned).forEach(function(k){if(k.indexOf('fp:')===0||!ok(learned[k]))return;var nk=normMerchant(k);if(nk)idx[nk]=learned[k];});
  if(idx[key])return idx[key];
  var best=null,bl=0;Object.keys(idx).forEach(function(nk){if(nk.length<3)return;
    if((key.indexOf(nk+' ')===0||nk.indexOf(key+' ')===0)&&nk.length>bl){best=idx[nk];bl=nk.length;}});
  if(best)return best;
  var kw=key.split(' ');if(kw.length>=2){var p2=kw[0]+' '+kw[1];Object.keys(idx).forEach(function(nk){var w=nk.split(' ');if(!best&&w.length>=2&&w[0]+' '+w[1]===p2)best=idx[nk];});}
  if(!best&&kw[0].length>=5){var hits=Object.keys(idx).filter(function(nk){return nk.split(' ')[0]===kw[0];});
    var cs=hits.map(function(h){return idx[h];});if(cs.length&&cs.every(function(c){return c===cs[0];}))best=cs[0];}
  if(best)return best;
  if(fp&&ok(learned[fp]))return learned[fp];
  return null;}
function suggestCat(merchant,catNames,learned,fp){var key=normMerchant(merchant);
  var l=lookupLearned(learned,key,fp,catNames||[]);if(l)return {cat:l,learned:true};
  if(!key)return null;
  for(var i=0;i<KW.length;i++){if(KW[i][0].test(merchant)){var pref=KW[i][1];for(var j=0;j<pref.length;j++)if(catNames.indexOf(pref[j])>=0)return {cat:pref[j],learned:false};}}
  return null;}
function parse(raw,opts){opts=opts||{};var text=digits(raw).trim();var lines=text.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
  var r={ok:false,credit:false,amount:null,date:null,time:null,merchant:'',mkey:'',fp:'',salary:false,cat:null,learned:false};if(!text)return r;
  r.credit=isCredit(text);r.amount=findAmount(lines);var dt=findDate(text,opts.ref);r.date=dt.date;r.time=dt.time;
  r.merchant=findMerchant(lines,text);r.mkey=normMerchant(r.merchant);r.fp=r.mkey?'':fingerprint(text);
  r.salary=r.credit&&/راتب|رواتب|salary|payroll/i.test(text);
  var s=suggestCat(r.merchant,opts.cats||[],opts.learned,r.fp);if(s){r.cat=s.cat;r.learned=s.learned;}
  r.ok=r.amount>0&&!r.credit;return r;}
/* remember the user's choice: always on save (not only when changed). Returns true if the map changed. */
function learn(map,mkey,fp,cat){if(!map||!cat)return false;var k=mkey||fp;if(!k)return false;if(map[k]===cat)return false;map[k]=cat;return true;}
var api={learn:learn,parse:parse,suggestCat:suggestCat,normMerchant:normMerchant,fingerprint:fingerprint,lookupLearned:lookupLearned,digits:digits};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SmsParse=api;
})(this);
