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
var MER_LINE=/^\s*(?:لدى|عند|من|في|إلى|الى|لـ|التاجر|المتجر|اسم التاجر|اسم المتجر|المحل|اسم المحل|المنشأة|المنشاة|اسم المنشأة|الجهة|المستفيد|اسم المستفيد|merchant(?:\s*name)?|at|from|to|mer|store|beneficiary|payee)\s*[:\-]\s*(.+)$/i;
var NOT_MER=/^(?:\*|\d|x{2,}|حساب|بطاقة|البطاقة|الحساب|account|acc|card|a\/c|mada|مدى|visa|فيزا|apple|stc\s*pay$)/i;
function clean(s){return s.replace(/\s+(?:on|في|بتاريخ|date|بـ?\s*\d).*$/i,'').replace(/[.,،;]+$/,'').replace(/\s{2,}/g,' ').trim();}
function findMerchant(lines,text){var i,m;
  /* v2.7.0: label alone on a line, value on the next line */
  for(i=0;i<lines.length-1;i++){if(/^\s*(?:لدى|عند|التاجر|المتجر|اسم التاجر|اسم المتجر|المحل|اسم المحل|المنشأة|المنشاة|merchant(?:\s*name)?|at|store)\s*[:\-]\s*$/i.test(lines[i])){var nx=clean(lines[i+1]);if(nx&&!NOT_MER.test(nx)&&!/^\d[\d\s\/:\-.]*$/.test(nx)&&!MER_LINE.test(lines[i+1]))return nx.slice(0,40);}}
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
  [/stc(?!\s*pay)|mobily|موبايلي|zain|(?:^|[^\u0621-\u064a])زين(?![\u0621-\u064a])|(?:^|[^\u0621-\u064a])سوا(?![\u0621-\u064a])|كهرباء|electricity|\bsec\b|المياه|water|فاتورة|bill|سداد|internet|انترنت/i,['فواتير']],
  [/netflix|نتفلكس|shahid|شاهد|spotify|سبوتيفاي|playstation|بلايستيشن|steam|xbox|cinema|سينما|vox|muvi|موفي|game|ألعاب|boulevard|بوليفارد/i,['ترفيه']],
  [/noon|(?:^|[^\u0621-\u064a])نون(?![\u0621-\u064a])|amazon|أمازون|امازون|jarir|جرير|extra|اكسترا|إكسترا|shein|شي\s*ان|namshi|نمشي|ikea|ايكيا|centrepoint|سنتربوينت|h&m|zara|زارا|mall|(?:^|[^\u0621-\u064a])مول(?![\u0621-\u064a])|clothes|ملابس|store/i,['تسوق']]
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
function lookupLearnedEx(learned,key,fp,catNames){if(!learned)return null;var ok=function(c){return c&&catNames.indexOf(c)>=0;};
  if(fp&&ok(learned[fp])&&!key)return {cat:learned[fp],key:fp};
  if(!key)return null;
  var idx={};Object.keys(learned).forEach(function(k){if(k.indexOf('fp:')===0||!ok(learned[k]))return;var nk=normMerchant(k);if(nk)idx[nk]={cat:learned[k],key:k};});
  if(idx[key])return idx[key];
  var best=null,bl=0;Object.keys(idx).forEach(function(nk){if(nk.length<3)return;
    if((key.indexOf(nk+' ')===0||nk.indexOf(key+' ')===0)&&nk.length>bl){best=idx[nk];bl=nk.length;}});
  if(best)return best;
  var kw=key.split(' ');if(kw.length>=2){var p2=kw[0]+' '+kw[1];Object.keys(idx).forEach(function(nk){var w=nk.split(' ');if(!best&&w.length>=2&&w[0]+' '+w[1]===p2)best=idx[nk];});}
  if(!best&&kw[0].length>=5){var hits=Object.keys(idx).filter(function(nk){return nk.split(' ')[0]===kw[0];});
    var cs=hits.map(function(h){return idx[h];});if(cs.length&&cs.every(function(c){return c.cat===cs[0].cat;}))best=cs[0];}
  if(best)return best;
  if(fp&&ok(learned[fp]))return {cat:learned[fp],key:fp};
  return null;}
function lookupLearned(learned,key,fp,catNames){var r=lookupLearnedEx(learned,key,fp,catNames);return r?r.cat:null;}
/* ================= v2.7.0: fuzzy match to learned merchants + conservative brand/keyword dictionary ================= */
var GENERIC={};['مطعم','مطاعم','محطه','شركه','مؤسسه','موسسه','مركز','متجر','محل','سوق','اسواق','مجموعه','مجمع','للتجاره','العالميه','الدوليه','خدمات','للخدمات','restaurant','restaurants','cafe','coffee','store','stores','shop','market','group','international','services','service','center','centre','the','and','for','of','al','el','wa'].forEach(function(w){GENERIC[w]=1;});
function stripAl(t){if(/^ال.{3,}$/.test(t))return t.slice(2);if(/^al.{4,}$/.test(t)&&!/^(?:alpha|album|alert|alarm|algo|alloy|almond|alps|also|alter)/.test(t))return t.slice(2);return t;}
function tokensOf(key){var w=String(key||'').split(' ').filter(Boolean).map(stripAl).filter(function(x){return x.length>1;});
  var k=w.filter(function(x){return !GENERIC[x];});return k.length?k:w;}
function ed1(a,b){if(a===b)return true;var la=a.length,lb=b.length;if(Math.abs(la-lb)>1)return false;var i=0;while(i<la&&i<lb&&a[i]===b[i])i++;
  if(la===lb)return a.slice(i+1)===b.slice(i+1);if(la<lb)return a.slice(i)===b.slice(i+1);return a.slice(i+1)===b.slice(i);}
function tokEq(a,b){if(a===b)return true;var mn=Math.min(a.length,b.length),mx=Math.max(a.length,b.length);
  if(mn>=6&&ed1(a,b))return true;
  if(mn>=4&&(a.indexOf(b)===0||b.indexOf(a)===0)&&mn/mx>=0.6)return true;return false;}
/* same brand, different script/spelling (conservative list; first item of each group is just an id) */
var BRANDS=[['starbucks','ستاربكس'],['albaik','البيك','al baik'],['herfy','هرفي'],['kudu','كودو'],['kfc','كنتاكي'],['mcdonalds','ماكدونالدز','ماكدونالد','mc donalds'],['dunkin','دانكن'],['tim hortons','تيم هورتنز'],['barns','بارنز'],
 ['panda','بنده','بندة'],['danube','دانوب'],['othaim','عثيم'],['tamimi','تميمي'],['carrefour','كارفور'],['lulu','لولو'],['nahdi','نهدي'],['dawaa','دواء'],['whites','وايتس'],
 ['jarir','جرير'],['noon','نون'],['amazon','امازون'],['extra','اكسترا'],['ikea','ايكيا'],['shein','شي ان'],['namshi','نمشي'],
 ['hungerstation','هنقرستيشن','هنقر ستيشن'],['jahez','جاهز'],['mrsool','مرسول'],['toyou','تويو'],['careem'],['uber','اوبر'],
 ['aldrees','دريس'],['sasco','ساسكو'],['petromin','بترومين'],['adnoc','ادنوك'],['stc','اس تي سي'],['mobily','موبايلي'],['zain'],['netflix','نتفلكس'],['shahid','شاهد'],['spotify','سبوتيفاي']];
var BRAND_RE=null;
function brandId(key){if(!key)return -1;if(!BRAND_RE)BRAND_RE=BRANDS.map(function(g){return new RegExp('(?:^| )(?:'+g.map(function(v){return stripAl(arNorm(v)).replace(/[^a-z\u0621-\u064a ]/g,'');}).filter(Boolean).join('|')+')(?: |$)');});
  var t=' '+String(key).split(' ').map(stripAl).join(' ')+' ';for(var i=0;i<BRAND_RE.length;i++)if(BRAND_RE[i].test(t))return i;return -1;}
/* returns {cat,key} of the best learned merchant that is "the same place" spelled differently, or null (also null when ambiguous) */
function fuzzyLearned(learned,key,catNames){if(!learned||!key)return null;var A=tokensOf(key),bid=brandId(key),cand=[];
  Object.keys(learned).forEach(function(k){var c=learned[k];if(k.indexOf('fp:')===0||!c||catNames.indexOf(c)<0)return;var nk=normMerchant(k);if(!nk)return;
    var score=0;if(bid>=0&&brandId(nk)===bid)score=1;
    else{var B=tokensOf(nk);if(!A.length||!B.length)return;var sh=A.length<=B.length?A:B,lg=sh===A?B:A,m=0;
      sh.forEach(function(t){if(lg.some(function(u){return tokEq(t,u);}))m++;});
      var dice=2*m/(A.length+B.length),covered=m===sh.length&&(sh.length>=2||sh[0].length>=4);
      if((covered&&dice>=0.5)||dice>=0.75)score=dice;}
    if(score>0)cand.push({cat:c,key:k,score:score});});
  if(!cand.length)return null;cand.sort(function(a,b){return b.score-a.score;});var top=cand[0];
  for(var i=1;i<cand.length&&cand[i].score>=top.score-1e-9;i++)if(cand[i].cat!==top.cat)return null;
  return {cat:top.cat,key:top.key};}
/* dictionary: whole-word matches on the normalized merchant (never inside another word). '*' = any word ending. Runs before the legacy substring KW list (which stays as the last fallback). */
var DICT=[
 [['اسواق','ماركت','ميني ماركت','mini market','minimarket','خضار','خضروات','فواكه','لحوم','دواجن','اسماك','ذبائح','مسلخ','جمعيه تعاونيه','تعاونيه','hypermarket','supermarket','supermarkets','markets','grocer','groceries','تموين'],['مقاضي','بقالة']],
 [['ادنوك','adnoc','aramco','ارامكو','shell','شل','وقود','محطه وقود','petrol station','fuel station','gas station','enoc','wogas'],['بنزين']],
 [['كراج','garage','بريدجستون','bridgestone','ميشلان','michelin','بطاريه','بطاريات','battery','فحص دوري','ساهر','saher','المرور','مخالفه','مخالفات','tires','tyres'],['سيارة','بنزين']],
 [['مقهى','مقهي','كافتيريا','cafeteria','bakery','حلويات','sweets','عصير','عصائر','juice','ايس كريم','ice cream','باسكن','baskin','popeyes','بوبايز','pizza hut','بيتزا هت','papa john','باباجونز','hardees','هارديز','wendys','ويندي','taco bell','jollibee','kitchen','مطبخ','مشاوي','مشويات','دجاج','مندي','فطور','shake shack','five guys','krispy','كرسبي','cinnabon','سينابون','mama noura','ماما نوره','الطازج','tazaj','broast','بروست','كبسه','قهوه','roastery','specialty coffee'],['مطاعم','قهوة','أكل']],
 [['صيدليات','pharmacies','مجمع طبي','مركز طبي','طبي','طبيه','medical','clinic','clinics','عيادات','مستشفيات','hospitals','اسنان','dental','مختبرات','laboratory','بصريات','optical','دكتور','سليمان الحبيب','habib','دله','dallah','مواساه','mouwasat','حمادي','hammadi','medicine','vitamins','فيتامينات'],['صحة']],
 [['مكتبه','مكتبات','library','bookstore','books','aliexpress','علي اكسبريس','temu','تيمو','ebay','trendyol','ترنديول','sephora','سيفورا','نايس ون','nice one','عطور','perfume','perfumes','احذيه','shoes','حقائب','اثاث','furniture','الكترونيات','electronics','sacoo','ساكو','home centre','هوم سنتر','lc waikiki','adidas','nike','نايك','puma','mango','bershka','pull bear','مجوهرات','jewelry','jewellery','هدايا','gifts'],['تسوق']],
 [['yango','ياندكس','indrive','اندرايف','otaxi','lumi','لومي','قطار','حافلات','bus','مواصلات','ride','rides'],['مواصلات']],
 [['ترفيه','entertainment','amc','bowling','بولينج','ملاهي','youtube','يوتيوب','disney','ديزني','osn','اوسن','anghami','انغامي','nintendo','epic games','roblox','pubg','gaming','موسم الرياض','riyadh season','سينمائي'],['ترفيه']],
 [['اتصالات','lebara','ليبارا','virgin mobile','فيرجن موبايل','jawwy','جوي','salam','سلام موبايل','كهرباء','الكهرباء','مياه','تامين','insurance','bupa','بوبا','tawuniya','medgulf','ميدغلف','ابشر','absher','internet','فايبر','fiber'],['فواتير']]
];
var DICT_RE=null;
function dictCompile(){DICT_RE=DICT.map(function(e){var alts=e[0].map(function(t){var n=arNorm(t).replace(/[^a-z\u0621-\u064a* ]/g,'').replace(/\s+/g,' ').trim();
      return n.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'[^ ]*').replace(/ /g,' ');}).filter(Boolean);
    return new RegExp(' (?:ال|لل|وال|بال|فال|al ?|el )?(?:'+alts.join('|')+') ');});}
function dictSuggest(merchant,catNames){if(!DICT_RE)dictCompile();
  var t=' '+arNorm(merchant).replace(/[^a-z\u0621-\u064a]+/g,' ').trim()+' ';if(t.length<4)return null;
  for(var i=0;i<DICT.length;i++){if(!DICT_RE[i].test(t))continue;var pref=DICT[i][1];for(var j=0;j<pref.length;j++)if(catNames.indexOf(pref[j])>=0)return pref[j];}
  return null;}
function subFor(extra,cat,key){if(!extra||!extra.learnedSubs||!extra.subs||!key)return null;var s=extra.learnedSubs[key],list=extra.subs[cat];
  return (s&&Array.isArray(list)&&list.indexOf(s)>=0)?s:null;}
/* order: 1) learned (exact/prefix/fingerprint)  2) fuzzy match to learned  3) new whole-word brand/keyword dictionary  4) legacy keyword list (substring)  5) null (caller falls back to «غيرها») */
function suggestCat(merchant,catNames,learned,fp,extra){catNames=catNames||[];var key=normMerchant(merchant);
  var l=lookupLearnedEx(learned,key,fp,catNames);if(l)return {cat:l.cat,learned:true,src:'learned',sub:subFor(extra,l.cat,l.key)};
  if(!key)return null;
  var f=fuzzyLearned(learned,key,catNames);if(f)return {cat:f.cat,learned:true,src:'fuzzy',sub:subFor(extra,f.cat,f.key)};
  var d=dictSuggest(merchant,catNames);if(d)return {cat:d,learned:false,src:'dict',sub:null};
  for(var i=0;i<KW.length;i++){if(KW[i][0].test(merchant)){var pref=KW[i][1];for(var j=0;j<pref.length;j++)if(catNames.indexOf(pref[j])>=0)return {cat:pref[j],learned:false,src:'keyword',sub:null};}}
  return null;}
function parse(raw,opts){opts=opts||{};var text=digits(raw).trim();var lines=text.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
  var r={ok:false,credit:false,amount:null,date:null,time:null,merchant:'',mkey:'',fp:'',salary:false,cat:null,learned:false,src:null,sub:null};if(!text)return r;
  r.credit=isCredit(text);r.amount=findAmount(lines);var dt=findDate(text,opts.ref);r.date=dt.date;r.time=dt.time;
  r.merchant=findMerchant(lines,text);r.mkey=normMerchant(r.merchant);r.fp=r.mkey?'':fingerprint(text);
  r.salary=r.credit&&/راتب|رواتب|salary|payroll/i.test(text);
  var s=suggestCat(r.merchant,opts.cats||[],opts.learned,r.fp,{learnedSubs:opts.learnedSubs,subs:opts.subs});if(s){r.cat=s.cat;r.learned=s.learned;r.src=s.src;r.sub=s.sub||null;}
  r.ok=r.amount>0&&!r.credit;return r;}
/* remember the user's choice: always on save (not only when changed). Returns true if the map changed. */
function learn(map,mkey,fp,cat){if(!map||!cat)return false;var k=mkey||fp;if(!k)return false;if(map[k]===cat)return false;map[k]=cat;return true;}
/* v2.7.0: remember the user's subcategory for the same key as the category (falsy sub clears it). Returns true if changed. */
function learnSub(map,mkey,fp,sub){if(!map)return false;var k=mkey||fp;if(!k)return false;
  if(sub){if(map[k]===sub)return false;map[k]=sub;return true;}
  if(k in map){delete map[k];return true;}return false;}
var api={learnSub:learnSub,suggestCat:suggestCat,fuzzyLearned:fuzzyLearned,dictSuggest:dictSuggest,brandId:brandId,lookupLearnedEx:lookupLearnedEx,learn:learn,parse:parse,normMerchant:normMerchant,fingerprint:fingerprint,lookupLearned:lookupLearned,digits:digits};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SmsParse=api;
})(this);
