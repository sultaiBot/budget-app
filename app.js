/* ميزانيتي — PWA. All data stays in this browser (localStorage). No network requests except loading this app's own files. */
(function(){
'use strict';
var APP_VERSION='2.0.0';
/* ===== Storage: NEVER rename KEY. Bump SCHEMA and add a migration step instead. ===== */
var KEY='mizaniyati.v1';          // historical name, kept forever
var SCHEMA=2;                      // current data schema version
var DEF_CATS=[['أكل','🍔'],['قهوة','☕'],['بنزين','⛽'],['تسوق','🛍️'],['فواتير','🧾'],['سكن','🏠'],['صحة','💊'],['ترفيه','🎮'],['أخرى','📦']];
var MIGRATIONS={
  // 1 -> 2: add schema, per-cycle budgets, lastBackup
  1:function(d){d.cycleBudgets=d.cycleBudgets||{};
    if(d.budget>0){var sd=Math.min(28,Math.max(1,parseInt(d.startDay,10)||27));d.cycleBudgets[cycleFor(today(),sd).startISO]=Number(d.budget);}
    d.lastBackup=d.lastBackup||null;return d;}
  // 2 -> 3: add future steps here, e.g. 2:function(d){...;return d;}
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
  var t={id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),type:o.type==='income'?'income':'expense',amount:a,cat:o.cat||(o.type==='income'?'دخل':'أخرى'),date:o.date||iso(today()),note:o.note||'',ts:Date.now()};
  S.tx.push(t);save();return t;}
function updateTx(id,o){var t=S.tx.find(function(x){return x.id===id;});if(!t)return null;var a=Math.round(parseNum(o.amount)*100)/100;if(!(a>0))throw new Error('amount');
  t.type=o.type;t.amount=a;t.cat=o.cat;t.date=o.date||t.date;t.note=o.note||'';save();return t;}
function deleteTx(id){S.tx=S.tx.filter(function(x){return x.id!==id;});save();}

function catBars(by){var ent=Object.keys(by).map(function(k){return [k,by[k]];}).sort(function(a,b){return b[1]-a[1];});var max=ent.length?ent[0][1]:0;
  return ent.length?ent.map(function(e){return '<div class="cat-row"><div class="hd"><span>'+catEmoji(e[0])+' '+esc(e[0])+'</span><b class="n">'+money(e[1])+' ر.س</b></div><div class="tr"><div style="width:'+(e[1]/max*100)+'%"></div></div></div>';}).join('')
    :'<div class="empty" style="padding:8px">ما فيه مصاريف في هذي الدورة</div>';}
function txList(rows){if(!rows.length)return '';rows=rows.slice().sort(function(a,b){return a.date===b.date?(b.ts||0)-(a.ts||0):(a.date<b.date?1:-1);});
  var html='',cur='',t0=iso(today()),y=today();y.setDate(y.getDate()-1);var t1=iso(y);
  rows.forEach(function(t){if(t.date!==cur){if(cur)html+='</div>';cur=t.date;var dd=parseISO(t.date);
      var dayTotal=rows.filter(function(x){return x.date===cur&&x.type==='expense';}).reduce(function(a,x){return a+x.amount;},0);
      html+='<div class="day"><span>'+(cur===t0?'اليوم':cur===t1?'أمس':DAYS[dd.getDay()]+' '+fmtD(dd))+'</span><span class="n">'+(dayTotal?'-'+money(dayTotal):'')+'</span></div><div>';}
    html+='<button class="tx" data-id="'+t.id+'"><span class="em">'+catEmoji(t.cat)+'</span><span class="mid"><div>'+esc(t.cat)+'</div>'+(t.note?'<small>'+esc(t.note)+'</small>':'')+'</span><span class="amt n'+(t.type==='income'?' in">+':'">-')+money(t.amount)+'</span></button>';});
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
  $('cats').innerHTML=s.spent?catBars(s.byCat):'<div class="empty" style="padding:8px">ما صرفت شي في هذي الدورة بعد</div>';
  var rows=S.tx.filter(function(t){return inCycle(t,c);});
  $('list').innerHTML=rows.length?txList(rows):'<div class="empty">ابدأ بتسجيل أول مصروف 👇<br>اضغط زر <b>+</b>، اكتب المبلغ، واختر التصنيف.</div>';}

/* ===== Sheets ===== */
var openSheetEl=null;
function openSheet(id){closeSheet();openSheetEl=$(id);$('scrim').style.display='block';openSheetEl.classList.add('open');}
function closeSheet(){if(openSheetEl)openSheetEl.classList.remove('open');openSheetEl=null;$('scrim').style.display='none';}
var add={type:'expense',editId:null,cat:null};
function renderChips(){var list=add.type==='income'?[{name:'راتب',emoji:'💵'},{name:'دخل إضافي',emoji:'💰'},{name:'أخرى',emoji:'📦'}]:S.cats;
  $('chips').innerHTML=list.map(function(c){return '<button class="chip'+(add.editId&&add.cat===c.name?' sel':'')+'" data-cat="'+esc(c.name)+'"><span class="e">'+c.emoji+'</span>'+esc(c.name)+'</button>';}).join('');}
function setType(t){add.type=t;[].forEach.call($('typeSeg').children,function(b){b.classList.toggle('on',b.dataset.t===t);});renderChips();}
function openAdd(tx){add.editId=tx?tx.id:null;add.cat=tx?tx.cat:null;setType(tx?tx.type:'expense');
  $('amt').value=tx?tx.amount:'';$('note').value=tx?tx.note:'';$('date').value=tx?tx.date:iso(today());
  $('details').classList.toggle('show',!!(tx&&tx.note));$('editBtns').style.display=tx?'block':'none';
  var h=$('addHint');h.className='hint';h.textContent=tx?'عدّل وغيّر التصنيف أو اضغط حفظ':'اكتب المبلغ ثم اختر التصنيف';
  openSheet('addSheet');$('amt').focus();}
function commit(cat){var o={type:add.type,amount:$('amt').value,cat:cat,date:$('date').value||iso(today()),note:$('note').value.trim()};
  try{if(add.editId)updateTx(add.editId,o);else addTx(o);}catch(e){var h=$('addHint');h.className='hint err';h.textContent='اكتب المبلغ أول';$('amt').focus();return;}
  closeSheet();render();}

/* ===== History ===== */
function renderHistory(){var cmp=compare(),h=history();
  var diff=cmp.cur.spent-cmp.prevToDate,word=diff>0?'أكثر':'أقل';
  $('histCmp').innerHTML='<div class="hist-cmp"><b>هذي الدورة مقابل اللي قبلها</b>'+
    '<div class="row"><span>صرفت لين الحين (يوم <span class="n">'+cmp.dayN+'</span>)</span><b class="n">'+money(cmp.cur.spent)+' ر.س</b></div>'+
    '<div class="row"><span>الدورة الماضية لنفس اليوم</span><b class="n">'+money(cmp.prevToDate)+' ر.س</b></div>'+
    '<div class="row"><span>الدورة الماضية كاملة</span><b class="n">'+money(cmp.prev.spent)+' ر.س</b></div>'+
    (cmp.prevToDate||cmp.cur.spent?'<div class="daily '+(diff>0?'neg':'')+'" style="margin-top:8px">'+(diff===0?'نفس مصروف الدورة الماضية':'صرفت <b class="n">'+money(Math.abs(diff))+'</b> ر.س '+word+' من الدورة الماضية لنفس اليوم')+'</div>':'')+'</div>';
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

/* ===== Settings & backup ===== */
function daysSince(isoStr){return isoStr?Math.floor((Date.now()-Date.parse(isoStr))/864e5):Infinity;}
function openSettings(){$('sDay').value=S.startDay;$('sBudget').value=summary().budget||'';$('sSalary').value=S.salary||'';renderCatEdit();
  var ds=daysSince(S.lastBackup);
  $('backupRemind').innerHTML=(S.tx.length&&ds>=30)?'<div class="remind">💡 '+(S.lastBackup?'آخر نسخة احتياطية قبل <span class="n">'+ds+'</span> يوم.':'ما أخذت نسخة احتياطية للحين.')+' يفضّل تحفظ نسخة في ملفاتك.</div>':'';
  $('lastBackup').innerHTML=S.lastBackup?'آخر نسخة: <span class="n">'+S.lastBackup.slice(0,10)+'</span>':'';
  $('verTxt').textContent='الإصدار '+APP_VERSION+' · بيانات v'+S.schema;openSheet('setSheet');}
function renderCatEdit(){$('catEdit').innerHTML=S.cats.map(function(c,i){return '<span>'+c.emoji+' '+esc(c.name)+'<button data-i="'+i+'" aria-label="حذف">✕</button></span>';}).join('');}
function saveSettings(){var d=parseInt($('sDay').value,10);if(d>=1&&d<=28)S.startDay=d;var b=parseNum($('sBudget').value);if(b>=0)setCurrentBudget(b);
  var sl=parseNum($('sSalary').value);S.salary=sl>0?sl:0;save();closeSheet();render();}
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
  $('chips').onclick=function(e){var b=e.target.closest('.chip');if(!b)return;if(add.editId){add.cat=b.dataset.cat;renderChips();}else commit(b.dataset.cat);};
  $('detailsLink').onclick=function(){$('details').classList.toggle('show');};
  $('saveEdit').onclick=function(){commit(add.cat);};
  $('delBtn').onclick=function(){if(confirm('متأكد تبي تحذف هذي العملية؟')){deleteTx(add.editId);closeSheet();render();}};
  $('list').onclick=function(e){var b=e.target.closest('.tx');if(!b)return;var t=S.tx.find(function(x){return x.id===b.dataset.id;});if(t)openAdd(t);};
  $('budgetTap').onclick=function(){$('budgetIn').value=summary().budget||'';openSheet('budgetSheet');$('budgetIn').focus();};
  $('budgetSave').onclick=function(){var b=parseNum($('budgetIn').value);if(b>=0)setCurrentBudget(b);closeSheet();render();};
  $('gearBtn').onclick=openSettings;$('setSave').onclick=saveSettings;
  $('histBtn').onclick=function(){renderHistory();openSheet('histSheet');};
  $('catEdit').onclick=function(e){var b=e.target.closest('button');if(!b)return;var c=S.cats[+b.dataset.i];
    if(S.cats.length>1&&confirm('حذف تصنيف «'+c.name+'»؟ العمليات القديمة تبقى.')){S.cats.splice(+b.dataset.i,1);save();renderCatEdit();}};
  $('addCat').onclick=function(){var n=$('newCat').value.trim();if(!n||S.cats.some(function(c){return c.name===n;}))return;
    S.cats.push({name:n,emoji:$('newEmoji').value.trim()||'🏷️'});save();$('newCat').value='';$('newEmoji').value='';renderCatEdit();};
  $('exportBtn').onclick=exportBackup;
  $('importBtn').onclick=function(){$('importFile').click();};
  $('importFile').onchange=function(){var f=this.files[0];if(!f)return;var rd=new FileReader();
    rd.onload=function(){try{JSON.parse(rd.result);if(!confirm('بيتم استبدال بياناتك الحالية بالنسخة الاحتياطية. متابعة؟'))return;importBackup(rd.result);closeSheet();render();alert('تم الاسترجاع ✅');}
      catch(e){alert('الملف غير صالح');}};rd.readAsText(f);this.value='';};
  $('clearBtn').onclick=function(){if(confirm('بيتم مسح كل العمليات والإعدادات نهائياً. متأكد؟')&&confirm('آخر تأكيد: ما تقدر ترجعها إلا من نسخة احتياطية.')){
    try{localStorage.setItem(KEY+'.before-clear',JSON.stringify(S));}catch(e){}localStorage.removeItem(KEY);load();closeSheet();render();showOnb();}};
  $('onbDone').onclick=function(){var b=parseNum($('onbBudget').value);if(!(b>0)){$('onbErr').textContent='اكتب ميزانيتك الشهرية';return;}
    var sl=parseNum($('onbSalary').value);S.salary=sl>0?sl:0;S.onboarded=true;setCurrentBudget(b);$('onb').style.display='none';render();};
  window.addEventListener('storage',function(e){if(e.key===KEY){load();render();}});
}
function showOnb(){$('onbBudget').value='';$('onbSalary').value='';$('onb').style.display='flex';$('onbBudget').focus();}

load();bind();render();if(!S.onboarded)showOnb();
if(navigator.storage&&navigator.storage.persist){navigator.storage.persisted().then(function(p){if(!p)return navigator.storage.persist();}).catch(function(){});}
if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('sw.js').catch(function(){});}
window.App={S:function(){return S;},cycleFor:cycleFor,summary:summary,history:history,compare:compare,addTx:addTx,setCurrentBudget:setCurrentBudget,budgetFor:budgetFor,importBackup:importBackup,render:render,VERSION:APP_VERSION,SCHEMA:SCHEMA};
})();
