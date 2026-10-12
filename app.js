/* ميزانيتي — PWA. All data stays in this browser (localStorage). No network requests except loading this app's own files. */
(function(){
'use strict';
var APP_VERSION='2.3.0';
/* ===== Storage: NEVER rename KEY. Bump SCHEMA and add a migration step instead. ===== */
var KEY='mizaniyati.v1';          // historical name, kept forever
var SCHEMA=4;                      // current data schema version
var DEF_CATS=[['مطاعم','🍔'],['مقاضي','🛒'],['بنزين','⛽'],['سيارة','🔧'],['مواصلات','🚕'],['تسوق','🛍️'],['ترفيه','🎮'],['فواتير','🧾'],['صحة','💊'],['غيرها','📦']];
var OTHER='غيرها';
var GROUPED='أخرى (مجمّع)';
var INCOME_CATS=['راتب','دخل إضافي','دخل','أخرى'];
/* v3 -> v4 renames of old default categories (entries & learned merchants re-pointed, nothing deleted) */
var RENAME4={'أكل':'مطاعم','أخرى':'غيرها'};
var OLD_DEFAULTS3=['أكل','قهوة','بنزين','تسوق','فواتير','سكن','صحة','ترفيه','أخرى'];
var MIGRATIONS={
  // 1 -> 2: add schema, per-cycle budgets, lastBackup
  1:function(d){d.cycleBudgets=d.cycleBudgets||{};
    if(d.budget>0){var sd=Math.min(28,Math.max(1,parseInt(d.startDay,10)||27));d.cycleBudgets[cycleFor(today(),sd).startISO]=Number(d.budget);}
    d.lastBackup=d.lastBackup||null;return d;}
  // 2 -> 3: learned merchant→category map + theme preference (nothing removed)
  ,2:function(d){d.merchantCats=d.merchantCats&&typeof d.merchantCats==='object'?d.merchantCats:{};d.theme=d.theme||'auto';return d;}
  // 3 -> 4: new default category list. Rename أكل→مطاعم, أخرى→غيرها (tx + learned map follow);
  // unused old defaults with no new equivalent (قهوة, سكن) are dropped only if nothing references them;
  // custom categories and any category with entries are kept untouched; missing new defaults are added.
  ,3:function(d){
    var cats=Array.isArray(d.cats)?d.cats.slice():[],tx=Array.isArray(d.tx)?d.tx:[],mc=d.merchantCats&&typeof d.merchantCats==='object'?d.merchantCats:{};
    var has=function(n){return cats.some(function(c){return c&&c.name===n;});};
    Object.keys(RENAME4).forEach(function(o){var n=RENAME4[o];if(!has(o))return;
      if(has(n)){cats=cats.filter(function(c){return c.name!==o;});}           // target exists: merge into it
      else cats.forEach(function(c){if(c.name===o){c.name=n;c.emoji=DEF_CATS.find(function(x){return x[0]===n;})[1];}});
      tx.forEach(function(t){if(t&&t.type!=='income'&&t.cat===o)t.cat=n;});
      Object.keys(mc).forEach(function(k){if(mc[k]===o)mc[k]=n;});});
    var used=function(n){return tx.some(function(t){return t&&t.cat===n;})||Object.keys(mc).some(function(k){return mc[k]===n;});};
    cats=cats.filter(function(c){return !(c&&OLD_DEFAULTS3.indexOf(c.name)>=0&&!DEF_CATS.some(function(x){return x[0]===c.name;})&&!used(c.name));});
    var byName={};cats.forEach(function(c){byName[c.name]=c;});
    var out=[];DEF_CATS.forEach(function(x){if(x[0]===OTHER)return;out.push(byName[x[0]]||{name:x[0],emoji:x[1]});delete byName[x[0]];});
    cats.forEach(function(c){if(byName[c.name]&&c.name!==OTHER)out.push(c);});   // kept old/custom cats, original order
    out.push(byName[OTHER]||{name:OTHER,emoji:'📦'});
    d.cats=out;d.tx=tx;d.merchantCats=mc;return d;}
};
function migrate(d){
  var v=Number(d.schema)||1;
  if(v>SCHEMA){return d;} // data from a newer app version: keep as-is, never downgrade
  if(v<SCHEMA){try{localStorage.setItem(KEY+'.backup.schema'+v,JSON.stringify(d));}catch(e){}}
  while(v<SCHEMA){d=MIGRATIONS[v](d);v++;d.schema=v;}
  return d;}

var $=function(id){return document.getElementById(id);};
var nf0=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
var MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function money(n){return nf0.format(Math.round(n*100)/100);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parseISO(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function today(){var d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function parseNum(s){s=String(s==null?'':s).replace(/[٠-٩]/g,function(c){return '٠١٢٣٤٥٦٧٨٩'.indexOf(c);}).replace(/[٫,]/g,function(c){return c==='٫'?'.':'';}).trim();if(s==='')return NaN;var n=Number(s);return isFinite(n)?n:NaN;}

var S;
function normalize(d){
  if(!d||typeof d!=='object')d={schema:SCHEMA};
  d=migrate(d);
  d.tx=Array.isArray(d.tx)?d.tx:[];
  d.cats=Array.isArray(d.cats)&&d.cats.length?d.cats:DEF_CATS.map(function(c){return {name:c[0],emoji:c[1]};});
  d.startDay=Math.min(28,Math.max(1,parseInt(d.startDay,10)||27));d.budget=Number(d.budget)||0;d.salary=Number(d.salary)||0;
  d.cycleBudgets=d.cycleBudgets&&typeof d.cycleBudgets==='object'?d.cycleBudgets:{};
  d.merchantCats=d.merchantCats&&typeof d.merchantCats==='object'?d.merchantCats:{};if(['auto','light','dark'].indexOf(d.theme)<0)d.theme='auto';
  if(!d.schema)d.schema=SCHEMA;return d;}
function load(){var raw=null,d=null;try{raw=localStorage.getItem(KEY);d=raw?JSON.parse(raw):null;}catch(e){
    // corrupt JSON: preserve the raw text instead of overwriting it
    if(raw)try{localStorage.setItem(KEY+'.corrupt.'+Date.now(),raw);}catch(_){}}
  S=normalize(d);if(raw)save();}
function save(){S.schema=Math.max(S.schema||0,SCHEMA);S.savedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(S));}

/* ===== Cycles ===== */
function cycleFor(date,startDay){var y=date.getFullYear(),m=date.getMonth();if(date.getDate()<startDay)m-=1;
  var start=new Date(y,m,startDay),next=new Date(y,m+1,startDay),end=new Date(next.getFullYear(),next.getMonth(),next.getDate()-1);
  return {start:start,end:end,next:next,startISO:iso(start),endISO:iso(end)};}
function inCycle(t,c){return t.date>=c.startISO&&t.date<=c.endISO;}
function budgetFor(startISO){var cb=S.cycleBudgets;if(cb[startISO]!=null)return Number(cb[startISO]);
  var keys=Object.keys(cb).sort(),best=null;keys.forEach(function(k){if(k<=startISO)best=k;});
  if(best)return Number(cb[best]);if(keys.length)return Number(cb[keys[0]]);return S.budget;}
function setCurrentBudget(b){S.budget=b;S.cycleBudgets[cycleFor(today(),S.startDay).startISO]=b;save();}
function statsFor(c){var spent=0,income=0,by={},n=0;
  S.tx.forEach(function(t){if(!inCycle(t,c))return;n++;if(t.type==='income')income+=t.amount;else{spent+=t.amount;by[t.cat]=(by[t.cat]||0)+t.amount;}});
  spent=Math.round(spent*100)/100;var budget=budgetFor(c.startISO);
  return {cycle:c,spent:spent,income:Math.round(income*100)/100,budget:budget,remaining:Math.round((budget-spent)*100)/100,byCat:by,count:n};}
function summary(ref){ref=ref||today();var st=statsFor(cycleFor(ref,S.startDay));
  st.daysLeft=Math.round((st.cycle.next-ref)/864e5);st.daily=st.daysLeft>0?st.remaining/st.daysLeft:st.remaining;return st;}
/* every cycle from the earliest transaction up to the current one, newest first */
function history(ref){ref=ref||today();var cur=cycleFor(ref,S.startDay),out=[],first=cur.start;
  S.tx.forEach(function(t){var d=parseISO(t.date);if(d<first)first=d;});
  var c=cycleFor(first,S.startDay);var guard=0;
  while(c.start<=cur.start&&guard++<1200){out.push(statsFor(c));c=cycleFor(c.next,S.startDay);}
  return out.reverse();}
function compare(ref){ref=ref||today();var cur=cycleFor(ref,S.startDay),prev=cycleFor(new Date(cur.start.getFullYear(),cur.start.getMonth(),cur.start.getDate()-1),S.startDay);
  var dayN=Math.round((ref-cur.start)/864e5);var sameDay=new Date(prev.start.getFullYear(),prev.start.getMonth(),prev.start.getDate()+dayN);
  var toDate=0;S.tx.forEach(function(t){if(t.type==='expense'&&t.date>=prev.startISO&&t.date<=iso(sameDay)&&t.date<=prev.endISO)toDate+=t.amount;});
  return {cur:statsFor(cur),prev:statsFor(prev),prevToDate:Math.round(toDate*100)/100,dayN:dayN+1};}

function catEmoji(n){var c=S.cats.find(function(x){return x.name===n;});return c?c.emoji:({'دخل':'💵','راتب':'💵','دخل إضافي':'💰'}[n]||'📦');}
function fmtD(d){return d.getDate()+' '+MONTHS[d.getMonth()];}
function rangeHTML(c){return '<span class="n">'+c.start.getDate()+'</span> '+MONTHS[c.start.getMonth()]+' – <span class="n">'+c.end.getDate()+'</span> '+MONTHS[c.end.getMonth()]+(c.start.getFullYear()!==today().getFullYear()||c.end.getFullYear()!==today().getFullYear()?' <span class="n">'+c.end.getFullYear()+'</span>':'');}

function addTx(o){var a=Math.round(parseNum(o.amount)*100)/100;if(!(a>0))throw new Error('amount');
  var t={id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),type:o.type==='income'?'income':'expense',amount:a,cat:o.cat||(o.type==='income'?'دخل':OTHER),date:o.date||iso(today()),note:o.note||'',ts:Date.now()};if(o.time)t.time=o.time;if(o.mkey)t.mkey=o.mkey;if(o.fp)t.fp=o.fp;
  S.tx.push(t);save();return t;}
function updateTx(id,o){var t=S.tx.find(function(x){return x.id===id;});if(!t)return null;var a=Math.round(parseNum(o.amount)*100)/100;if(!(a>0))throw new Error('amount');
  t.type=o.type;t.amount=a;t.cat=o.cat;t.date=o.date||t.date;t.note=o.note||'';save();if(t.type==='expense')learnFromTx(t);return t;}
function deleteTx(id){S.tx=S.tx.filter(function(x){return x.id!==id;});save();}

function catBars(by){var ent=Object.keys(by).map(function(k){return [k,by[k]];}).sort(function(a,b){return b[1]-a[1];});var max=ent.length?ent[0][1]:0;
  return ent.length?ent.map(function(e){return '<div class="cat-row"><div class="hd"><span>'+catEmoji(e[0])+' '+esc(e[0])+'</span><b class="n">'+money(e[1])+' ر.س</b></div><div class="tr"><div style="width:'+(e[1]/max*100)+'%"></div></div></div>';}).join('')
    :'<div class="empty" style="padding:8px">ما فيه مصاريف في هذي الدورة</div>';}
/* ===== Charts (pure SVG) ===== */
var PAL=['#0e8a5f','#f2a33a','#4f7cff','#e0607e','#8e6be8','#9aa5a0'];
function donutHTML(by){var ent=Object.keys(by).map(function(k){return [k,by[k]];}).filter(function(e){return e[1]>0;}).sort(function(a,b){return b[1]-a[1];});
  if(!ent.length)return '';var tot=ent.reduce(function(a,e){return a+e[1];},0);
  if(ent.length>6){var rest=ent.slice(5).reduce(function(a,e){return a+e[1];},0);ent=ent.slice(0,5);ent.push([GROUPED,rest]);}
  var R0=50,C=2*Math.PI*R0,off=0,arcs='';
  ent.forEach(function(e,i){var len=e[1]/tot*C;arcs+='<circle r="'+R0+'" cx="66" cy="66" fill="none" stroke="'+PAL[i%PAL.length]+'" stroke-width="20" stroke-dasharray="'+Math.max(0,len-(ent.length>1?1.5:0))+' '+C+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 66 66)"/>';off+=len;});
  var svg='<svg viewBox="0 0 132 132" role="img" aria-label="توزيع المصروف"><circle r="'+R0+'" cx="66" cy="66" fill="none" stroke="var(--line)" stroke-width="20"/>'+arcs+
    '<text x="66" y="60" text-anchor="middle" class="dc-t">صرفت</text><text x="66" y="80" text-anchor="middle" class="dc-v" direction="ltr">'+money(Math.round(tot))+'</text></svg>';
  var lg=ent.map(function(e,i){return '<div><i style="background:'+PAL[i%PAL.length]+'"></i><span>'+(e[0]===GROUPED?'':catEmoji(e[0])+' ')+esc(e[0])+'</span><b class="n">'+Math.round(e[1]/tot*100)+'%</b></div>';}).join('');
  return '<div class="donut">'+svg+'<div class="legend">'+lg+'</div></div>';}
function barsHTML(list){/* list: oldest→newest stats, drawn right→left (RTL) */
  if(!list.length)return '';var W=320,H=150,top=22,bot=24,max=0;list.forEach(function(s){max=Math.max(max,s.spent,s.budget||0);});if(!max)max=1;
  var n=list.length,slot=W/n,bw=Math.min(34,slot*0.55),out='';
  list.forEach(function(s,i){var x=W-(i+0.5)*slot,h=(H-top-bot)*s.spent/max,y=H-bot-h,over=s.budget&&s.spent>s.budget,cur=i===n-1;
    var col=over?'var(--red)':'var(--acc)';
    if(s.budget){var by=H-bot-(H-top-bot)*s.budget/max;out+='<line x1="'+(x-bw/2-4)+'" x2="'+(x+bw/2+4)+'" y1="'+by+'" y2="'+by+'" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 2"/>';}
    out+='<rect x="'+(x-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+Math.max(h,1)+'" rx="6" fill="'+col+'" opacity="'+(cur?1:0.6)+'"/>';
    out+='<text x="'+x+'" y="'+(y-6)+'" text-anchor="middle" class="v" direction="ltr">'+(s.spent>=1000?(Math.round(s.spent/100)/10)+'k':Math.round(s.spent))+'</text>';
    out+='<text x="'+x+'" y="'+(H-6)+'" text-anchor="middle">'+MONTHS[s.cycle.end.getMonth()]+'</text>';});
  return '<div style="font-weight:600;margin-bottom:6px">مصروفك آخر الدورات</div><svg class="bars" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="مقارنة الدورات">'+out+'</svg><div class="hint" style="margin-top:2px">الخط المتقطع = الميزانية</div>';}
function txList(rows){if(!rows.length)return '';rows=rows.slice().sort(function(a,b){return a.date===b.date?(b.ts||0)-(a.ts||0):(a.date<b.date?1:-1);});
  var html='',cur='',t0=iso(today()),y=today();y.setDate(y.getDate()-1);var t1=iso(y);
  rows.forEach(function(t){if(t.date!==cur){if(cur)html+='</div>';cur=t.date;var dd=parseISO(t.date);
      var dayTotal=rows.filter(function(x){return x.date===cur&&x.type==='expense';}).reduce(function(a,x){return a+x.amount;},0);
      html+='<div class="day"><span>'+(cur===t0?'اليوم':cur===t1?'أمس':DAYS[dd.getDay()]+' '+fmtD(dd))+'</span><span class="n">'+(dayTotal?'-'+money(dayTotal):'')+'</span></div><div>';}
    html+='<button class="tx'+(t.type==='income'?' inc':'')+'" data-id="'+t.id+'"><span class="em">'+catEmoji(t.cat)+'</span><span class="mid"><div>'+esc(t.cat)+'</div>'+(t.note?'<small>'+esc(t.note)+'</small>':'')+'</span><span class="amt n'+(t.type==='income'?' in">+':'">-')+money(t.amount)+'</span></button>';});
  return html+'</div>';}

function render(){var s=summary(),c=s.cycle;
  $('cycleTxt').innerHTML=rangeHTML(c);
  $('daysTxt').innerHTML=s.daysLeft===1?'الراتب بكرة 🎉':'باقي <span class="n">'+s.daysLeft+'</span> يوم على الراتب';
  var r=$('remain');r.innerHTML='<span class="n">'+money(s.remaining)+'</span><span class="cur">ر.س</span>';r.className='big'+(s.remaining<0?' neg':'');
  var pct=s.budget?s.spent/s.budget*100:0;$('barFill').style.width=Math.min(100,pct)+'%';$('bar').className='ring-bar'+(pct>100?' over':'');
  $('spent').textContent=money(s.spent);$('budgetTap').textContent=money(s.budget)+' ر.س ✎';
  var d=$('daily');
  if(s.remaining<0){d.className='daily neg';d.innerHTML='تجاوزت الميزانية بـ <b class="n">'+money(-s.remaining)+'</b> ر.س';}
  else{d.className='daily';d.innerHTML='تقدر تصرف <b class="n">'+money(Math.floor(s.daily))+'</b> ر.س باليوم';}
  $('cats').innerHTML=s.spent?donutHTML(s.byCat):'<div class="empty" style="padding:8px">ما صرفت شي في هذي الدورة بعد</div>';
  var rows=S.tx.filter(function(t){return inCycle(t,c)&&t.type!=='income';}),inc=S.tx.filter(function(t){return inCycle(t,c)&&t.type==='income';});
  $('incWrap').style.display=inc.length?'block':'none';$('incList').innerHTML=txList(inc);
  $('incTot').textContent='+'+money(inc.reduce(function(a,t){return a+t.amount;},0));
  updateBadge(s);
  $('list').innerHTML=rows.length?txList(rows):'<div class="empty">ابدأ بتسجيل أول مصروف 👇<br>اضغط زر <b>+</b>، اكتب المبلغ، واختر التصنيف.</div>';}

/* ===== Sheets ===== */
var openSheetEl=null;
function openSheet(id){closeSheet();openSheetEl=$(id);$('scrim').style.display='block';openSheetEl.classList.add('open');}
function closeSheet(){if(openSheetEl)openSheetEl.classList.remove('open');openSheetEl=null;$('scrim').style.display='none';}
var add={type:'expense',editId:null,cat:null};
function renderChips(){var list=add.type==='income'?[{name:'راتب',emoji:'💵'},{name:'دخل إضافي',emoji:'💰'},{name:'أخرى',emoji:'📦'}]:S.cats;
  $('chips').classList.toggle('compact',!!add.editId);
  var rec=(!add.editId&&add.type==='expense')?recentMerchants():[];
  $('recent').innerHTML=rec.length?'<span class="rl">آخر الأماكن</span>'+rec.map(function(r,i){return '<button class="rchip'+(add.quick===i?' sel':'')+'" data-i="'+i+'">'+catEmoji(r.cat)+' '+esc(r.note)+'</button>';}).join(''):'';
  $('chips').innerHTML=list.map(function(c){return '<button class="chip'+((add.editId||add.quick!=null)&&add.cat===c.name?' sel':'')+'" data-cat="'+esc(c.name)+'"><span class="e">'+c.emoji+'</span>'+esc(c.name)+'</button>';}).join('');}
function setType(t){add.type=t;[].forEach.call($('typeSeg').children,function(b){b.classList.toggle('on',b.dataset.t===t);});renderChips();}
function recentMerchants(){var seen={},out=[];S.tx.slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);}).forEach(function(t){
    if(out.length>=3||t.type!=='expense'||!t.note)return;var k=SmsParse.normMerchant(t.note);if(!k||seen[k])return;seen[k]=1;
    var same=S.tx.filter(function(x){return x.type==='expense'&&x.note&&SmsParse.normMerchant(x.note)===k;}).sort(function(a,b){return (b.ts||0)-(a.ts||0);});
    var amt=same.length>=2&&same[0].amount===same[1].amount?same[0].amount:null;
    out.push({note:t.note,cat:t.cat,amount:amt});});return out;}
function pickRecent(i){var r=recentMerchants()[i];if(!r)return;add.quick=i;add.cat=r.cat;$('note').value=r.note;if(r.amount&&!$('amt').value)$('amt').value=r.amount;
  $('details').classList.add('show');$('quickSave').style.display='block';var h=$('addHint');h.className='hint';h.textContent=r.amount?'نفس المبلغ المعتاد — اضغط حفظ':'اكتب المبلغ ثم اضغط حفظ';renderChips();$('amt').focus();}
function openAdd(tx){add.editId=tx?tx.id:null;add.cat=tx?tx.cat:null;add.quick=null;$('quickSave').style.display='none';setType(tx?tx.type:'expense');
  $('amt').value=tx?tx.amount:'';$('note').value=tx?tx.note:'';$('date').value=tx?tx.date:iso(today());
  $('details').classList.toggle('show',!!(tx&&tx.note));$('editBtns').style.display=tx?'flex':'none';$('smsLink').style.display=tx?'none':'flex';$('addSheet').classList.toggle('editing',!!tx);
  var h=$('addHint');h.className='hint';h.textContent=tx?'عدّل وغيّر التصنيف أو اضغط حفظ':'اكتب المبلغ ثم اختر التصنيف';
  openSheet('addSheet');$('amt').focus();}
function commit(cat){var o={type:add.type,amount:$('amt').value,cat:cat,date:$('date').value||iso(today()),note:$('note').value.trim()};
  var snap=snapshot();
  try{if(add.editId)updateTx(add.editId,o);else{var t=addTx(o);if(t.type==='expense'&&t.note)learnFromTx(t);}}catch(e){var h=$('addHint');h.className='hint err';h.textContent='اكتب المبلغ أول';$('amt').focus();return;}
  closeSheet();render();toast('تم الحفظ',snap);}

/* ===== Undo toast (replaces confirm) ===== */
function snapshot(){return JSON.stringify({tx:S.tx,mc:S.merchantCats,cats:S.cats});}
var toastTimer=null;
function toast(msg,snap){var el=$('toast');clearTimeout(toastTimer);
  el.innerHTML='<span>'+esc(msg)+'</span>'+(snap?' · <button id="undoBtn">تراجع</button>':'');el.classList.add('show');
  if(snap)$('undoBtn').onclick=function(){var o=JSON.parse(snap);S.tx=o.tx;S.merchantCats=o.mc;S.cats=o.cats;save();el.classList.remove('show');if(openSheetEl&&openSheetEl.id==='setSheet')renderCatEdit();render();};
  toastTimer=setTimeout(function(){el.classList.remove('show');},5000);}

/* ===== Search ===== */
function searchTx(q){var k=SmsParse.normMerchant(q),raw=String(q||'').trim().toLowerCase();if(!raw)return [];
  return S.tx.filter(function(t){var hay=(t.note||'')+' '+(t.cat||'');return hay.toLowerCase().indexOf(raw)>=0||(k&&SmsParse.normMerchant(hay).indexOf(k)>=0);});}
function renderSearch(){var q=$('histSearch').value,f=$('histFound');if(!q.trim()){f.innerHTML='';$('histMain').style.display='block';return;}
  var rows=searchTx(q),tot=rows.filter(function(t){return t.type==='expense';}).reduce(function(a,t){return a+t.amount;},0);
  $('histMain').style.display='none';$('histDetail').style.display='none';
  f.innerHTML='<div class="hist-cmp"><div class="row"><span><span class="n">'+rows.length+'</span> عملية</span><b class="n" id="foundTot">'+money(tot)+' ر.س</b></div></div>'+
    '<div class="card" style="padding-top:2px">'+(txList(rows)||'<div class="empty">ما فيه نتائج</div>')+'</div>';}

/* ===== App badge: today's allowance (opt-in) ===== */
function updateBadge(s){try{if(!navigator.setAppBadge)return;
  if(S.badge){var v=Math.max(0,Math.round(s.daily));(v?navigator.setAppBadge(v):navigator.clearAppBadge()).catch(function(){});}
  else if(navigator.clearAppBadge)navigator.clearAppBadge().catch(function(){});}catch(e){}}
function setBadge(on){if(!on){S.badge=false;save();render();renderBadgeToggle();return;}
  var go=function(){S.badge=true;save();render();renderBadgeToggle();};
  try{if(window.Notification&&Notification.permission!=='granted'&&Notification.requestPermission){
      Promise.resolve(Notification.requestPermission()).then(function(p){if(p==='granted')go();else renderBadgeToggle();}).catch(function(){renderBadgeToggle();});return;}}catch(e){}
  go();}
function renderBadgeToggle(){var b=$('badgeTgl');if(b){b.setAttribute('aria-checked',S.badge?'true':'false');b.classList.toggle('on',!!S.badge);}}

/* ===== History ===== */
function renderHistory(){var cmp=compare(),h=history();
  var diff=cmp.cur.spent-cmp.prevToDate,word=diff>0?'أكثر':'أقل';
  $('histSearch').value='';$('histFound').innerHTML='';
  if(!cmp.prev.count){$('histCmp').innerHTML='';}else
  $('histCmp').innerHTML='<div class="hist-cmp"><b>هذي الدورة مقابل اللي قبلها</b>'+
    '<div class="row"><span>صرفت لين الحين (يوم <span class="n">'+cmp.dayN+'</span>)</span><b class="n">'+money(cmp.cur.spent)+' ر.س</b></div>'+
    '<div class="row"><span>الدورة الماضية لنفس اليوم</span><b class="n">'+money(cmp.prevToDate)+' ر.س</b></div>'+
    '<div class="row"><span>الدورة الماضية كاملة</span><b class="n">'+money(cmp.prev.spent)+' ر.س</b></div>'+
    (cmp.prevToDate||cmp.cur.spent?'<div class="daily '+(diff>0?'neg':'')+'" style="margin-top:8px">'+(diff===0?'نفس مصروف الدورة الماضية':'صرفت <b class="n">'+money(Math.abs(diff))+'</b> ر.س '+word+' من الدورة الماضية لنفس اليوم')+'</div>':'')+'</div>';
  $('histChart').innerHTML=barsHTML(h.slice(0,6).reverse());
  $('histList').innerHTML='<div class="card" style="padding-top:2px">'+h.map(function(st,i){var pct=st.budget?st.spent/st.budget*100:0,over=st.budget&&st.spent>st.budget;
    return '<button class="cyc" data-i="'+i+'"><span><b>'+rangeHTML(st.cycle)+'</b>'+(i===0?' <small style="display:inline;color:var(--acc)">(الحالية)</small>':'')+'<small>صرفت <span class="n">'+money(st.spent)+'</span> من <span class="n">'+money(st.budget)+'</span> ر.س</small><div class="mini'+(over?' over':'')+'"><div style="width:'+Math.min(100,pct)+'%"></div></div></span><span class="n '+(over?'bad':'ok')+'">'+(over?'-':'+')+money(Math.abs(st.remaining))+'</span></button>';}).join('')+'</div>';
  $('histMain').style.display='block';$('histDetail').style.display='none';
  $('histList').onclick=function(e){var b=e.target.closest('.cyc');if(b)showCycle(h[+b.dataset.i]);};}
function showCycle(st){var rows=S.tx.filter(function(t){return inCycle(t,st.cycle);});
  $('histDetail').innerHTML='<button class="back" id="histBack">→ رجوع للسجل</button><h2>'+rangeHTML(st.cycle)+'</h2>'+
    '<div class="hist-cmp"><div class="row"><span>الميزانية</span><b class="n">'+money(st.budget)+' ر.س</b></div><div class="row"><span>المصروف</span><b class="n">'+money(st.spent)+' ر.س</b></div>'+(st.income?'<div class="row"><span>الدخل</span><b class="n">'+money(st.income)+' ر.س</b></div>':'')+'<div class="row"><span>'+(st.remaining<0?'تجاوزت بـ':'وفّرت')+'</span><b class="n" style="color:'+(st.remaining<0?'var(--red)':'var(--acc)')+'">'+money(Math.abs(st.remaining))+' ر.س</b></div></div>'+
    '<div class="card">'+catBars(st.byCat)+'</div><h3>العمليات</h3><div class="card" id="histTx" style="padding-top:2px">'+(txList(rows)||'<div class="empty">ما فيه عمليات</div>')+'</div>';
  $('histMain').style.display='none';$('histDetail').style.display='block';$('histSheet').scrollTop=0;
  $('histBack').onclick=renderHistory;
  $('histTx').onclick=function(e){var b=e.target.closest('.tx');if(!b)return;var t=S.tx.find(function(x){return x.id===b.dataset.id;});if(t)openAdd(t);};}

/* ===== Theme ===== */
function applyTheme(){var t=S.theme||'auto',root=document.documentElement;if(t==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',t);
  var dark=t==='dark'||(t==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
  var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',dark?'#0f1412':'#0e8a5f');
  var seg=$('themeSeg');if(seg)[].forEach.call(seg.children,function(b){b.classList.toggle('on',b.dataset.v===t);});}

/* ===== Paste bank SMS ===== */
var sms={r:null};
function dmy(isoS){var p=String(isoS||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}
function fromDmy(s){var m=SmsParse.digits(s).match(/^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s*$/);if(!m)return null;var d=+m[1],mo=+m[2],y=+m[3];
  if(mo<1||mo>12||d<1||d>31)return null;var dt=new Date(y,mo-1,d);if(dt.getMonth()!==mo-1)return null;return iso(dt);}
function openSms(text){$('smsIn').value='';$('smsOut').innerHTML='';$('smsPaste').style.display=(navigator.clipboard&&navigator.clipboard.readText)?'block':'none';openSheet('smsSheet');if(typeof text==='string'&&text){$('smsIn').value=text;parseSms();}else $('smsIn').focus();}
function catNames(){return S.cats.map(function(c){return c.name;});}
function parseSms(){var txt=$('smsIn').value,out=$('smsOut');if(!txt.trim()){out.innerHTML='';sms.r=null;return;}
  var r=SmsParse.parse(txt,{cats:catNames(),learned:S.merchantCats,ref:today()});sms.r=r;
  if(r.credit){out.innerHTML='<div class="note-ok">💚 '+(r.salary?'هذي رسالة <b>راتب</b>':'هذي رسالة إيداع أو استرداد')+(r.amount?' (<b class="n">'+money(r.amount)+'</b> ر.س)':'')+'، فما راح نسجلها كمصروف.'+(r.amount?'<br><button class="link" id="smsIncome" style="margin:6px 0 0">'+(r.salary?'سجّلها كدخل (راتب)':'سجّلها كدخل')+'</button>':'')+'</div>';return;}
  if(!(r.amount>0)){out.innerHTML='<div class="hint err" style="margin-top:12px">ما قدرت ألقى المبلغ في الرسالة 🤔 تأكد إنها رسالة شراء.</div>';return;}
  var cat=r.cat||OTHER;if(catNames().indexOf(cat)<0)cat=S.cats[S.cats.length-1].name;
  out.innerHTML='<div class="sms-card"><div class="big2"><input id="smsAmt" inputmode="decimal" value="'+r.amount+'" style="font-size:34px;font-weight:800;text-align:center;max-width:none;background:none;width:100%" aria-label="المبلغ"></div>'+
    '<div class="f"><label>التصنيف</label><select id="smsCat">'+S.cats.map(function(c){return '<option'+(c.name===cat?' selected':'')+' value="'+esc(c.name)+'">'+c.emoji+' '+esc(c.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="f"><label>المكان</label><input id="smsNote" maxlength="80" value="'+esc(r.merchant)+'" placeholder="—" style="text-align:right"></div>'+
    '<div class="f"><label>التاريخ'+(r.time?' <span class="n">'+r.time+'</span>':'')+'</label><input id="smsDate" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" dir="ltr" value="'+dmy(r.date||iso(today()))+'"></div></div>'+
    (r.learned?'<div class="hint" style="margin-top:6px">✨ التصنيف من اختيارك السابق لهذا المكان</div>':'')+
    '<button class="btn" id="smsOk">تأكيد ✓</button>';}
function confirmSms(){var r=sms.r||{},cat=$('smsCat').value,note=$('smsNote').value.trim(),d=fromDmy($('smsDate').value);
  if(!d){$('smsDate').classList.add('bad');$('smsDate').focus();return;}
  var snap=snapshot();
  // key on the merchant as parsed from the SMS (what the next paste will produce), not the user-edited note
  var mkey=r.mkey||SmsParse.normMerchant(note),fp=mkey?'':(r.fp||'');
  try{addTx({type:'expense',amount:$('smsAmt').value,cat:cat,date:d,note:note||r.merchant,time:r.time||null,mkey:mkey,fp:fp});}catch(e){$('smsAmt').focus();return;}
  learnKeys(mkey,fp,cat);
  if(note&&r.mkey&&SmsParse.normMerchant(note)!==r.mkey)learnKeys(SmsParse.normMerchant(note),'',cat);
  closeSheet();render();toast('تم الحفظ',snap);}
/* learning: on EVERY save with a category (new SMS entry, quick add with a note, or later edit) */
function learnKeys(mkey,fp,cat){if(SmsParse.learn(S.merchantCats,mkey,fp,cat))save();}
function learnFromTx(t){if(!t||t.type!=='expense'||!t.cat)return;
  if(t.mkey||t.fp)learnKeys(t.mkey,t.fp,t.cat);
  var nk=SmsParse.normMerchant(t.note);if(nk&&nk!==t.mkey)learnKeys(nk,'',t.cat);}

/* ===== Settings & backup ===== */
function daysSince(isoStr){return isoStr?Math.floor((Date.now()-Date.parse(isoStr))/864e5):Infinity;}
function openSettings(){$('sDay').value=S.startDay;$('sBudget').value=summary().budget||'';$('sSalary').value=S.salary||'';renderCatEdit();
  var ds=daysSince(S.lastBackup);
  $('backupRemind').innerHTML=(S.tx.length&&ds>=30)?'<div class="remind">💡 '+(S.lastBackup?'آخر نسخة احتياطية قبل <span class="n">'+ds+'</span> يوم.':'ما أخذت نسخة احتياطية للحين.')+' يفضّل تحفظ نسخة في ملفاتك.</div>':'';
  $('lastBackup').innerHTML=S.lastBackup?'آخر نسخة: <span class="n">'+S.lastBackup.slice(0,10)+'</span>':'';
  renderBadgeToggle();$('badgeRow').style.display=('setAppBadge' in navigator)?'flex':'none';applyTheme();$('verTxt').textContent='الإصدار '+APP_VERSION+' · بيانات v'+S.schema;openSheet('setSheet');}
function renderCatEdit(){$('catEdit').innerHTML=S.cats.map(function(c,i){return '<span>'+c.emoji+' '+esc(c.name)+'<button data-i="'+i+'" aria-label="حذف '+esc(c.name)+'">✕</button></span>';}).join('');}
function saveSettings(){var d=parseInt($('sDay').value,10);if(d>=1&&d<=28)S.startDay=d;var b=parseNum($('sBudget').value);if(b>=0&&$('sBudget').value.trim()!=='')setCurrentBudget(b);
  var sl=parseNum($('sSalary').value);S.salary=sl>0?sl:0;save();render();var f=$('setSaved');f.classList.add('show');clearTimeout(f._t);f._t=setTimeout(function(){f.classList.remove('show');},1500);}
function exportBackup(){var name='ميزانيتي-نسخة-'+iso(today())+'.json',json=JSON.stringify(S,null,2);
  var file=null;try{file=new File([json],name,{type:'application/json'});}catch(e){}
  function done(){S.lastBackup=new Date().toISOString();save();openSettings();}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    return navigator.share({files:[file],title:'نسخة ميزانيتي'}).then(done).catch(function(e){if(e&&e.name!=='AbortError')download();});}
  download();
  function download(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();a.remove();done();}}
function importBackup(text){var d=JSON.parse(text);if(!d||!Array.isArray(d.tx))throw new Error('bad');
  try{localStorage.setItem(KEY+'.before-restore',JSON.stringify(S));}catch(e){}
  S=normalize(d);save();}

function bind(){
  [].forEach.call(document.querySelectorAll('[data-close]'),function(b){b.onclick=closeSheet;});
  $('fab').onclick=function(){openAdd(null);};$('scrim').onclick=closeSheet;
  $('typeSeg').onclick=function(e){var b=e.target.closest('button');if(b)setType(b.dataset.t);};
  $('chips').onclick=function(e){var b=e.target.closest('.chip');if(!b)return;if(add.editId||add.quick!=null){add.cat=b.dataset.cat;renderChips();}else commit(b.dataset.cat);};
  $('recent').onclick=function(e){var b=e.target.closest('.rchip');if(b)pickRecent(+b.dataset.i);};
  $('quickSave').onclick=function(){commit(add.cat);};
  $('histSearch').oninput=renderSearch;
  $('histFound').onclick=function(e){var b=e.target.closest('.tx');if(!b)return;var t=S.tx.find(function(x){return x.id===b.dataset.id;});if(t)openAdd(t);};
  $('incList').onclick=function(e){var b=e.target.closest('.tx');if(!b)return;var t=S.tx.find(function(x){return x.id===b.dataset.id;});if(t)openAdd(t);};
  $('badgeTgl').onclick=function(){setBadge(!S.badge);};
  ['sDay','sBudget','sSalary'].forEach(function(id){$(id).onchange=saveSettings;});
  $('detailsLink').onclick=function(){$('details').classList.toggle('show');};
  $('saveEdit').onclick=function(){commit(add.cat);};
  $('delBtn').onclick=function(){var snap=snapshot();deleteTx(add.editId);closeSheet();render();toast('تم الحذف',snap);};
  $('list').onclick=function(e){var b=e.target.closest('.tx');if(!b)return;var t=S.tx.find(function(x){return x.id===b.dataset.id;});if(t)openAdd(t);};
  $('budgetTap').onclick=function(){$('budgetIn').value=summary().budget||'';openSheet('budgetSheet');$('budgetIn').focus();};
  $('budgetSave').onclick=function(){var b=parseNum($('budgetIn').value);if(b>=0)setCurrentBudget(b);closeSheet();render();};
  $('gearBtn').onclick=openSettings;$('setSave').onclick=function(){saveSettings();closeSheet();};
  $('histBtn').onclick=function(){renderHistory();openSheet('histSheet');};
  // two-tap confirm: first tap arms the button (حذف؟), second tap deletes; undo toast afterwards
  $('catEdit').onclick=function(e){var b=e.target.closest('button');if(!b||S.cats.length<=1)return;
    if(!b.classList.contains('arm')){[].forEach.call($('catEdit').querySelectorAll('.arm'),function(x){x.classList.remove('arm');x.textContent='✕';});b.classList.add('arm');b.textContent='حذف؟';return;}
    var c=S.cats[+b.dataset.i],snap=snapshot();S.cats.splice(+b.dataset.i,1);save();renderCatEdit();toast('تم حذف «'+c.name+'»',snap);};
  $('addCat').onclick=function(){var n=$('newCat').value.trim();if(!n||S.cats.some(function(c){return c.name===n;}))return;
    S.cats.push({name:n,emoji:$('newEmoji').value.trim()||'🏷️'});save();$('newCat').value='';$('newEmoji').value='';renderCatEdit();};
  $('exportBtn').onclick=exportBackup;
  $('themeSeg').onclick=function(e){var b=e.target.closest('button');if(!b)return;S.theme=b.dataset.v;save();applyTheme();};
  if(window.matchMedia){var mq=matchMedia('(prefers-color-scheme: dark)');(mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(applyTheme);}
  $('smsLink').onclick=openSms;
  $('smsIn').oninput=parseSms;
  $('smsPaste').onclick=function(){navigator.clipboard.readText().then(function(t){$('smsIn').value=t||'';parseSms();}).catch(function(){$('smsIn').focus();});};
  $('smsOut').onclick=function(e){if(e.target.id==='smsOk')confirmSms();
    else if(e.target.id==='smsIncome'){addTx({type:'income',amount:sms.r.amount,cat:sms.r.salary?'راتب':'دخل إضافي',date:sms.r.date||iso(today())});closeSheet();render();}};
  $('importBtn').onclick=function(){$('importFile').click();};
  $('importFile').onchange=function(){var f=this.files[0];if(!f)return;var rd=new FileReader();
    rd.onload=function(){try{JSON.parse(rd.result);if(!confirm('بيتم استبدال بياناتك الحالية بالنسخة الاحتياطية. متابعة؟'))return;importBackup(rd.result);closeSheet();render();alert('تم الاسترجاع ✅');}
      catch(e){alert('الملف غير صالح');}};rd.readAsText(f);this.value='';};
  $('clearBtn').onclick=function(){if(confirm('بيتم مسح كل العمليات والإعدادات نهائياً. متأكد؟')&&confirm('آخر تأكيد: ما تقدر ترجعها إلا من نسخة احتياطية.')){
    try{localStorage.setItem(KEY+'.before-clear',JSON.stringify(S));}catch(e){}localStorage.removeItem(KEY);load();closeSheet();render();showOnb();}};
  $('onbDone').onclick=function(){var b=parseNum($('onbBudget').value);if(!(b>0)){$('onbErr').textContent='اكتب ميزانيتك الشهرية';return;}
    var sl=parseNum($('onbSalary').value);S.salary=sl>0?sl:0;S.onboarded=true;setCurrentBudget(b);$('onb').style.display='none';render();};
  window.addEventListener('storage',function(e){if(e.key===KEY){load();applyTheme();render();}});
}
function showOnb(){$('onbBudget').value='';$('onbSalary').value='';$('onb').style.display='flex';$('onbBudget').focus();}

/* iOS Shortcuts auto-capture: ?sms=<urlencoded> or #sms=<urlencoded> opens the prefilled confirm card, then the param is removed */
function smsFromUrl(){var txt=null;try{var q=new URLSearchParams(location.search);if(q.has('sms'))txt=q.get('sms');
    var h=location.hash.replace(/^#/,'');if(txt==null&&/(^|&)sms=/.test(h))txt=new URLSearchParams(h).get('sms');}catch(e){}
  if(txt==null)return null;
  try{var u=new URL(location.href);u.searchParams.delete('sms');if(/(^|&)sms=/.test(u.hash.slice(1)))u.hash='';window.history.replaceState(null,'',u.pathname+u.search+u.hash);}catch(e){}
  return txt;}
load();bind();applyTheme();render();if(!S.onboarded)showOnb();
var pending=smsFromUrl();if(pending&&S.onboarded)openSms(pending);
window.addEventListener('hashchange',function(){var t=smsFromUrl();if(t&&S.onboarded)openSms(t);});
if(navigator.storage&&navigator.storage.persist){navigator.storage.persisted().then(function(p){if(!p)return navigator.storage.persist();}).catch(function(){});}
if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('sw.js').catch(function(){});}
window.App={S:function(){return S;},cycleFor:cycleFor,summary:summary,history:history,compare:compare,addTx:addTx,setCurrentBudget:setCurrentBudget,budgetFor:budgetFor,importBackup:importBackup,render:render,searchTx:searchTx,smsFromUrl:smsFromUrl,parseSms:function(t){return SmsParse.parse(t,{cats:catNames(),learned:S.merchantCats,ref:today()});},VERSION:APP_VERSION,SCHEMA:SCHEMA};
})();
