/* رحلتي المالية — متابعة الادخار والاستثمار (دراية)
   100% Local & Offline-First. Zero network requests. Optional AES-256-GCM Encryption. */
(function(){
'use strict';

var APP_VERSION = '2.0.0';
var KEY = 'rihlati.maliya.v1';
var ENC_KEY = 'rihlati.maliya.v1.enc';
var SCHEMA = 2;

var $ = function(id){ return document.getElementById(id); };
var nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
var nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function money(n){ return nf2.format(round2(n)); }
function moneyInt(n){ return nf0.format(Math.round(Number(n) || 0)); }
function signMoney(n){
  var r = round2(n);
  if(r > 0) return '+' + nf2.format(r);
  if(r < 0) return '-' + nf2.format(Math.abs(r));
  return '0.00';
}
function pctFmt(p, d){
  var v = (Number(p) || 0) * 100;
  return (d === 1 ? nf1.format(v) : nf2.format(v)) + '%';
}
function signPct(p){
  var v = (Number(p) || 0) * 100;
  if(v > 0.0005) return '+' + nf2.format(v) + '%';
  if(v < -0.0005) return '-' + nf2.format(Math.abs(v)) + '%';
  return '0.00%';
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function pad2(n){ return String(n).padStart(2, '0'); }
function todayISO(){
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function dmyShort(iso){
  var p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1]) : iso;
}
function dmyFull(iso){
  var p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : iso;
}
function parseNum(s){
  s = String(s == null ? '' : s)
    .replace(/[٠-٩]/g, function(c){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); })
    .replace(/[٫,]/g, function(c){ return c === '٫' ? '.' : ''; })
    .trim();
  if(s === '') return NaN;
  var n = Number(s);
  return isFinite(n) ? n : NaN;
}
function edateISO(baseISO, monthsToAdd){
  var p = String(baseISO || todayISO()).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, d = parseInt(p[2], 10);
  var targetM = m + monthsToAdd;
  var ty = y + Math.floor(targetM / 12);
  var tm = ((targetM % 12) + 12) % 12;
  var maxD = new Date(ty, tm + 1, 0).getDate();
  var td = Math.min(d, maxD);
  return ty + '-' + pad2(tm + 1) + '-' + pad2(td);
}
function diffDays(isoA, isoB){
  var a = Date.UTC(+isoA.slice(0,4), +isoA.slice(5,7)-1, +isoA.slice(8,10));
  var b = Date.UTC(+isoB.slice(0,4), +isoB.slice(5,7)-1, +isoB.slice(8,10));
  return Math.round((b - a) / 86400000);
}

/* Default empty state (or preloaded via window.__INITIAL_SEED__ in the private local HTML) */
function defaultPortfolios(){
  return {
    SCHOOL: {
      code: 'SCHOOL',
      nameAr: 'تعليم الأبناء',
      goalName: 'إدخار لتعليم الأبناء',
      targetAmount: 0,
      targetDate: '',
      monthlyPlan: 0,
      color: '#0e8a5f'
    },
    SMART: {
      code: 'SMART',
      nameAr: 'السيارات والطوارئ',
      goalName: 'إدخار للسيارات والطوارئ',
      targetAmount: 0,
      targetDate: '',
      monthlyPlan: 0,
      color: '#d4941c'
    }
  };
}

var S = null;
var sessionPassword = null;
var UI = {
  tab: 'home',
  chartFilter: 'ALL',     // 'ALL' | 'SCHOOL' | 'SMART'
  journeyFilter: 'ALL',   // 'ALL' | 'SCHOOL' | 'SMART'
  commitYear: 2026,
  txFilterPort: 'ALL',
  txFilterCat: 'ALL',
  txSearch: '',
  expectedAnnualReturn: 7 // % for compound simulator
};

function normalizeState(d){
  var seed = (typeof window !== 'undefined' && window.__INITIAL_SEED__) ? window.__INITIAL_SEED__ : null;
  if(!d || typeof d !== 'object'){
    d = seed ? JSON.parse(JSON.stringify(seed)) : {};
  }
  d.schema = SCHEMA;
  d.portfolios = (d.portfolios && d.portfolios.SCHOOL && d.portfolios.SMART) ? d.portfolios : defaultPortfolios();
  d.transactions = Array.isArray(d.transactions) ? d.transactions : [];
  d.snapshots = Array.isArray(d.snapshots) ? d.snapshots : [];
  d.milestoneStep = Number(d.milestoneStep) > 0 ? Number(d.milestoneStep) : 50000;
  d.startMeasureDate = d.startMeasureDate || '2026-09-01';
  d.theme = ['auto','light','dark'].indexOf(d.theme) >= 0 ? d.theme : 'auto';
  d.privacy = !!d.privacy;
  return d;
}

/* ===== AES-256-GCM Encryption via Web Crypto API ===== */
function bufToB64(buf){
  var bin = '', u8 = new Uint8Array(buf);
  for(var i=0; i<u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
function b64ToBuf(b64){
  var bin = atob(b64), u8 = new Uint8Array(bin.length);
  for(var i=0; i<bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function deriveAesKey(password, saltU8){
  var enc = new TextEncoder();
  var baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltU8, iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptPayload(obj, password){
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var key = await deriveAesKey(password, salt);
  var plain = new TextEncoder().encode(JSON.stringify(obj));
  var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plain);
  return JSON.stringify({
    v: 1,
    alg: 'AES-256-GCM',
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    ct: bufToB64(ct)
  });
}
async function decryptPayload(envStr, password){
  var env = JSON.parse(envStr);
  var salt = b64ToBuf(env.salt);
  var iv = b64ToBuf(env.iv);
  var ct = b64ToBuf(env.ct);
  var key = await deriveAesKey(password, salt);
  var plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

async function save(){
  S.savedAt = new Date().toISOString();
  if(sessionPassword){
    try {
      var encStr = await encryptPayload(S, sessionPassword);
      localStorage.setItem(ENC_KEY, encStr);
      localStorage.removeItem(KEY);
    } catch(e){}
  } else {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch(e){}
  }
}

/* ===== Financial Engine (100% Exact Excel Formulas + Advanced Analytics) ===== */
function computeEngine(){
  var txs = S.transactions.slice().map(function(t, idx){
    return Object.assign({}, t, { _order: idx });
  });
  var snaps = S.snapshots.slice().map(function(s, idx){
    return Object.assign({}, s, { _order: idx, seq: idx + 1 });
  });

  // Sort snapshots chronologically, preserving order within the same day
  snaps.sort(function(a, b){
    return a.date === b.date ? (a._order - b._order) : (a.date < b.date ? -1 : 1);
  });

  function flowsUpTo(dateISO, port){
    var dep = 0, wth = 0;
    for(var i=0; i<txs.length; i++){
      var t = txs[i];
      if(t.date <= dateISO && (!port || t.portfolio === port)){
        if(t.type === 'إيداع') dep = round2(dep + Number(t.amount));
        else if(t.type === 'سحب') wth = round2(wth + Number(t.amount));
      }
    }
    return { dep: dep, wth: wth, net: round2(dep - wth) };
  }

  // Enrich every raw snapshot
  var rawSnaps = snaps.map(function(s, idx){
    var fSch = flowsUpTo(s.date, 'SCHOOL');
    var fSmt = flowsUpTo(s.date, 'SMART');
    var totVal = round2(s.schoolVal + s.smartVal);
    var totDep = round2(fSch.dep + fSmt.dep);
    var totWth = round2(fSch.wth + fSmt.wth);
    var totNet = round2(fSch.net + fSmt.net);
    var totInv = round2(s.schoolInv + s.smartInv);

    var schProfit = round2(s.schoolVal - fSch.net);
    var smtProfit = round2(s.smartVal - fSmt.net);
    var totProfit = round2(totVal - totNet);

    var schAppProfit = round2(s.schoolVal - s.schoolInv);
    var smtAppProfit = round2(s.smartVal - s.smartInv);
    var totAppProfit = round2(schAppProfit + smtAppProfit);

    // Implied Derayah fee / cost-basis difference: Net Deposits - Displayed Invested = App Profit - Actual Profit
    var schFeeGap = round2(fSch.net - s.schoolInv);
    var smtFeeGap = round2(fSmt.net - s.smartInv);
    var totFeeGap = round2(schFeeGap + smtFeeGap);

    return {
      id: s.id,
      seq: idx + 1,
      date: s.date,
      note: s.note || '',
      schoolVal: round2(s.schoolVal),
      schoolInv: round2(s.schoolInv),
      smartVal: round2(s.smartVal),
      smartInv: round2(s.smartInv),
      schDep: fSch.dep, schWth: fSch.wth, schNet: fSch.net,
      smtDep: fSmt.dep, smtWth: fSmt.wth, smtNet: fSmt.net,
      totVal: totVal, totDep: totDep, totWth: totWth, totNet: totNet, totInv: totInv,
      schProfit: schProfit, smtProfit: smtProfit, totProfit: totProfit,
      schAppProfit: schAppProfit, smtAppProfit: smtAppProfit, totAppProfit: totAppProfit,
      schFeeGap: schFeeGap, smtFeeGap: smtFeeGap, totFeeGap: totFeeGap,
      schShare: totVal > 0 ? s.schoolVal / totVal : 0,
      smtShare: totVal > 0 ? s.smartVal / totVal : 0
    };
  });

  // Unique days: Excel LOOKUP(2, 1/(date=d), ...) takes the LAST snapshot of each unique date
  var byDate = {};
  rawSnaps.forEach(function(rs){ byDate[rs.date] = rs; });
  var uniqueDates = Object.keys(byDate).sort();

  var twrTot = 1.0, twrSch = 1.0, twrSmt = 1.0;
  var dailyJourney = uniqueDates.map(function(dt, i){
    var cur = Object.assign({}, byDate[dt], { dayRank: i + 1 });
    if(i === 0){
      cur.dVal = null; cur.dNet = null; cur.dProfit = null;
      cur.schDVal = null; cur.schDNet = null; cur.schDProfit = null;
      cur.smtDVal = null; cur.smtDNet = null; cur.smtDProfit = null;
      cur.dFeeGap = null; cur.schDFeeGap = null; cur.smtDFeeGap = null;
      cur.rTot = 0; cur.rSch = 0; cur.rSmt = 0;
    } else {
      var prev = byDate[uniqueDates[i - 1]];
      cur.dVal = round2(cur.totVal - prev.totVal);
      cur.dNet = round2(cur.totNet - prev.totNet);
      cur.dProfit = round2(cur.dVal - cur.dNet);

      cur.schDVal = round2(cur.schoolVal - prev.schoolVal);
      cur.schDNet = round2(cur.schNet - prev.schNet);
      cur.schDProfit = round2(cur.schDVal - cur.schDNet);

      cur.smtDVal = round2(cur.smartVal - prev.smartVal);
      cur.smtDNet = round2(cur.smtNet - prev.smtNet);
      cur.smtDProfit = round2(cur.smtDVal - cur.smtDNet);

      cur.dFeeGap = round2(cur.totFeeGap - prev.totFeeGap);
      cur.schDFeeGap = round2(cur.schFeeGap - prev.schFeeGap);
      cur.smtDFeeGap = round2(cur.smtFeeGap - prev.smartFeeGap || (cur.smtFeeGap - prev.smtFeeGap));

      // Period return isolating cashflow
      cur.rTot = prev.totVal > 0 ? (cur.dProfit / prev.totVal) : 0;
      cur.rSch = prev.schoolVal > 0 ? (cur.schDProfit / prev.schoolVal) : 0;
      cur.rSmt = prev.smartVal > 0 ? (cur.smtDProfit / prev.smartVal) : 0;

      twrTot *= (1 + cur.rTot);
      twrSch *= (1 + cur.rSch);
      twrSmt *= (1 + cur.rSmt);
    }
    cur.cumTwrTot = twrTot - 1;
    cur.cumTwrSch = twrSch - 1;
    cur.cumTwrSmt = twrSmt - 1;
    return cur;
  });

  // Also compute per-snapshot fee changes across ALL raw snapshots (including same-day snapshots)
  rawSnaps.forEach(function(rs, idx){
    if(idx === 0){
      rs.dFeeGap = rs.totFeeGap;
      rs.schDFeeGap = rs.schFeeGap;
      rs.smtDFeeGap = rs.smtFeeGap;
      rs.dProfitRaw = null;
    } else {
      var p = rawSnaps[idx - 1];
      rs.dFeeGap = round2(rs.totFeeGap - p.totFeeGap);
      rs.schDFeeGap = round2(rs.schFeeGap - p.schFeeGap);
      rs.smtDFeeGap = round2(rs.smtFeeGap - p.smtFeeGap);
      rs.dProfitRaw = round2((rs.totVal - p.totVal) - (rs.totNet - p.totNet));
    }
  });

  var latest = dailyJourney.length ? dailyJourney[dailyJourney.length - 1] : null;
  var prevDay = dailyJourney.length >= 2 ? dailyJourney[dailyJourney.length - 2] : null;

  // Reference month for "إيقاع هذا الشهر" (uses latest snapshot's month or today's month)
  var refDateISO = latest ? latest.date : todayISO();
  var refYear = parseInt(refDateISO.slice(0, 4), 10);
  var refMonth = parseInt(refDateISO.slice(5, 7), 10);

  function monthlyStatsFor(year, month){
    var mStart = year + '-' + pad2(month) + '-01';
    var nextY = month === 12 ? year + 1 : year;
    var nextM = month === 12 ? 1 : month + 1;
    var mEnd = nextY + '-' + pad2(nextM) + '-01';
    var planSch = Number(S.portfolios.SCHOOL.monthlyPlan) || 4000;
    var planSmt = Number(S.portfolios.SMART.monthlyPlan) || 2500;

    var schMonthly = 0, smtMonthly = 0, extraDep = 0, nonHistWth = 0;
    txs.forEach(function(t){
      if(t.date >= mStart && t.date < mEnd){
        if(t.type === 'إيداع' && t.category === 'شهري'){
          if(t.portfolio === 'SCHOOL') schMonthly = round2(schMonthly + Number(t.amount));
          else if(t.portfolio === 'SMART') smtMonthly = round2(smtMonthly + Number(t.amount));
        } else if(t.type === 'إيداع' && t.category === 'إضافي'){
          extraDep = round2(extraDep + Number(t.amount));
        } else if(t.type === 'سحب' && t.category !== 'تاريخي'){
          nonHistWth = round2(nonHistWth + Number(t.amount));
        }
      }
    });

    var totPlan = round2(planSch + planSmt);
    var totMonthly = round2(schMonthly + smtMonthly);
    var remSch = Math.max(0, round2(planSch - schMonthly));
    var remSmt = Math.max(0, round2(planSmt - smtMonthly));
    var remTot = round2(remSch + remSmt);

    var nowISO = todayISO();
    if(latest && latest.date > nowISO) nowISO = latest.date;
    var status = 'جارٍ';
    if(mStart < (S.startMeasureDate || '2026-09-01')){
      status = 'قبل السجل';
    } else if(mStart > nowISO){
      status = 'قادم';
    } else if(remTot === 0){
      status = 'مكتمل';
    } else if(mEnd > nowISO){
      status = 'جارٍ';
    } else {
      status = 'غير مكتمل';
    }

    return {
      year: year,
      month: month,
      monthName: MONTHS[month - 1],
      mStart: mStart,
      planSch: planSch,
      schMonthly: schMonthly,
      schPct: planSch > 0 ? schMonthly / planSch : 0,
      planSmt: planSmt,
      smtMonthly: smtMonthly,
      smtPct: planSmt > 0 ? smtMonthly / planSmt : 0,
      extraDep: extraDep,
      nonHistWth: nonHistWth,
      totPlan: totPlan,
      totMonthly: totMonthly,
      remSch: remSch,
      remSmt: remSmt,
      remTot: remTot,
      status: status
    };
  }

  var curMonthRhythm = monthlyStatsFor(refYear, refMonth);

  // Goals & Milestones calculation (Exact Excel match + Compound Return Simulator)
  function calcGoal(portKey, curVal){
    var p = S.portfolios[portKey];
    var target = Number(p.targetAmount) || 0;
    var plan = Number(p.monthlyPlan) || 0;
    var rem = Math.max(0, round2(target - curVal));
    var pct = target > 0 ? curVal / target : 0;
    var monthsSaveOnly = plan > 0 ? Math.ceil(rem / plan) : null;
    var baseISO = latest ? latest.date : todayISO();
    var arrivalSaveOnly = monthsSaveOnly !== null ? edateISO(baseISO, monthsSaveOnly) : null;

    var availMonths = null, reqMonthlySaveOnly = null, extraNeededSaveOnly = null;
    if(p.targetDate && p.targetDate > baseISO){
      var days = diffDays(baseISO, p.targetDate);
      availMonths = Math.max(1, Math.ceil(days / 30.4375));
      reqMonthlySaveOnly = availMonths > 0 ? (rem / availMonths) : 0;
      extraNeededSaveOnly = Math.max(0, reqMonthlySaveOnly - plan);
    }

    // With Expected Compound Return (monthly rate r = annual / 12)
    var rAnn = (Number(UI.expectedAnnualReturn) || 0) / 100;
    var rMo = rAnn / 12;
    var monthsWithReturn = monthsSaveOnly;
    var reqMonthlyWithReturn = reqMonthlySaveOnly;
    if(rMo > 0.00001 && rem > 0){
      // Iterate months until FV >= target: V_{m+1} = V_m * (1 + rMo) + plan
      var v = curVal, m = 0;
      while(v < target && m < 1200){
        v = v * (1 + rMo) + plan;
        m++;
      }
      monthsWithReturn = m;
      if(availMonths && availMonths > 0){
        var fvCurrent = curVal * Math.pow(1 + rMo, availMonths);
        var gapFV = Math.max(0, target - fvCurrent);
        var factor = (Math.pow(1 + rMo, availMonths) - 1) / rMo;
        reqMonthlyWithReturn = factor > 0 ? (gapFV / factor) : 0;
      }
    }
    var arrivalWithReturn = monthsWithReturn !== null ? edateISO(baseISO, monthsWithReturn) : null;

    return {
      code: portKey,
      nameAr: p.nameAr,
      goalName: p.goalName,
      targetAmount: target,
      targetDate: p.targetDate,
      monthlyPlan: plan,
      curVal: curVal,
      rem: rem,
      pct: pct,
      monthsSaveOnly: monthsSaveOnly,
      arrivalSaveOnly: arrivalSaveOnly,
      availMonths: availMonths,
      reqMonthlySaveOnly: reqMonthlySaveOnly,
      extraNeededSaveOnly: extraNeededSaveOnly,
      monthsWithReturn: monthsWithReturn,
      arrivalWithReturn: arrivalWithReturn,
      reqMonthlyWithReturn: reqMonthlyWithReturn
    };
  }

  var curTotVal = latest ? latest.totVal : 0;
  var step = Number(S.milestoneStep) > 0 ? Number(S.milestoneStep) : 50000;
  var passedMilestone = Math.floor(curTotVal / step) * step;
  var nextMilestone = passedMilestone + step;
  var remToMilestone = round2(nextMilestone - curTotVal);
  var milestoneProg = (curTotVal - passedMilestone) / step;

  var goalSCHOOL = calcGoal('SCHOOL', latest ? latest.schoolVal : 0);
  var goalSMART = calcGoal('SMART', latest ? latest.smartVal : 0);

  // ROI % (Return on Net Deposits)
  var roiTot = (latest && latest.totNet > 0) ? (latest.totProfit / latest.totNet) : 0;
  var roiSch = (latest && latest.schNet > 0) ? (latest.schProfit / latest.schNet) : 0;
  var roiSmt = (latest && latest.smtNet > 0) ? (latest.smtProfit / latest.smtNet) : 0;

  var appRoiTot = (latest && latest.totInv > 0) ? (latest.totAppProfit / latest.totInv) : 0;
  var appRoiSch = (latest && latest.schoolInv > 0) ? (latest.schAppProfit / latest.schoolInv) : 0;
  var appRoiSmt = (latest && latest.smartInv > 0) ? (latest.smtAppProfit / latest.smartInv) : 0;

  return {
    txs: txs,
    rawSnaps: rawSnaps,
    dailyJourney: dailyJourney,
    latest: latest,
    prevDay: prevDay,
    daysCount: dailyJourney.length,
    refYear: refYear,
    refMonth: refMonth,
    curMonthRhythm: curMonthRhythm,
    monthlyStatsFor: monthlyStatsFor,
    flowsUpTo: flowsUpTo,
    goalSCHOOL: goalSCHOOL,
    goalSMART: goalSMART,
    milestone: {
      step: step,
      passed: passedMilestone,
      next: nextMilestone,
      rem: remToMilestone,
      prog: milestoneProg
    },
    returns: {
      roiTot: roiTot, roiSch: roiSch, roiSmt: roiSmt,
      appRoiTot: appRoiTot, appRoiSch: appRoiSch, appRoiSmt: appRoiSmt,
      twrTot: twrTot - 1, twrSch: twrSch - 1, twrSmt: twrSmt - 1
    }
  };
}

/* ===== Interactive SVG Charts Suite ===== */

/* 1. Value vs Net Deposits Area Chart (shading the profit zone in emerald) */
function svgValueVsNetChart(daily, scope){
  if(!daily || !daily.length) return '<div style="text-align:center;padding:24px;color:var(--muted)">أضف لقطة لعرض المنحنى</div>';
  var W = 720, H = 265, padL = 56, padR = 24, padT = 24, padB = 38;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  var pts = daily.map(function(d){
    if(scope === 'SCHOOL') return { date: d.date, val: d.schoolVal, net: d.schNet, prof: d.schProfit };
    if(scope === 'SMART') return { date: d.date, val: d.smartVal, net: d.smtNet, prof: d.smtProfit };
    return { date: d.date, val: d.totVal, net: d.totNet, prof: d.totProfit };
  });

  var minV = Infinity, maxV = -Infinity;
  pts.forEach(function(p){
    minV = Math.min(minV, p.val, p.net);
    maxV = Math.max(maxV, p.val, p.net);
  });
  var span = Math.max(1000, maxV - minV);
  minV = Math.max(0, Math.floor((minV - span * 0.18) / 5000) * 5000);
  maxV = Math.ceil((maxV + span * 0.12) / 5000) * 5000;
  var range = Math.max(1, maxV - minV);

  function xAt(i){ return pts.length === 1 ? (padL + plotW / 2) : (padL + (i / (pts.length - 1)) * plotW); }
  function yAt(v){ return padT + plotH - ((v - minV) / range) * plotH; }

  var grid = '';
  for(var g=0; g<=4; g++){
    var gv = minV + (range * g / 4);
    var gy = yAt(gv);
    grid += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--line)" stroke-dasharray="3 3"/>';
    grid += '<text x="'+(padL-8)+'" y="'+(gy+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" direction="ltr">'+Math.round(gv/1000)+'k</text>';
  }

  var valCoords = pts.map(function(p, i){ return xAt(i).toFixed(1) + ',' + yAt(p.val).toFixed(1); });
  var netCoords = pts.map(function(p, i){ return xAt(i).toFixed(1) + ',' + yAt(p.net).toFixed(1); });
  var revNetCoords = pts.slice().reverse().map(function(p, revI){
    var origI = pts.length - 1 - revI;
    return xAt(origI).toFixed(1) + ',' + yAt(p.net).toFixed(1);
  });

  // Profit shaded polygon between Value curve and Net Deposits curve
  var profitPolygon = valCoords.concat(revNetCoords).join(' ');
  var valColor = scope === 'SMART' ? 'var(--gold)' : 'var(--acc)';
  var netColor = '#4a6fa5';

  var dots = '';
  pts.forEach(function(p, i){
    var cx = xAt(i), cyV = yAt(p.val), cyN = yAt(p.net);
    var tipV = esc(dmyFull(p.date) + ' | القيمة: ' + money(p.val) + ' ر.س | صافي الإيداعات: ' + money(p.net) + ' ر.س | الربح الصافي: ' + signMoney(p.prof) + ' ر.س');
    dots += '<circle class="chart-pt" cx="'+cx+'" cy="'+cyN+'" r="4.5" fill="var(--card)" stroke="'+netColor+'" stroke-width="2.2" data-tip="'+tipV+'"/>';
    dots += '<circle class="chart-pt" cx="'+cx+'" cy="'+cyV+'" r="5" fill="'+valColor+'" stroke="var(--card)" stroke-width="2" data-tip="'+tipV+'"/>';
    if(i === 0 || i === pts.length - 1 || pts.length <= 8){
      dots += '<text x="'+cx+'" y="'+(H-12)+'" text-anchor="middle" font-size="11" fill="var(--muted)" direction="ltr">'+dmyShort(p.date)+'</text>';
    }
    if(i === pts.length - 1 || i === 0){
      dots += '<text x="'+cx+'" y="'+(cyV-9)+'" text-anchor="middle" font-size="11" font-weight="700" fill="'+valColor+'" direction="ltr">'+Math.round(p.val/100)/10+'k</text>';
    }
  });

  var svg = '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="تطور القيمة السوقية مقابل صافي الإيداعات">' +
    '<defs><linearGradient id="profZoneGrad_'+scope+'" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="'+(scope==='SMART'?'#f5c542':'#0e8a5f')+'" stop-opacity="0.28"/>' +
    '<stop offset="100%" stop-color="'+(scope==='SMART'?'#f5c542':'#0e8a5f')+'" stop-opacity="0.05"/>' +
    '</linearGradient></defs>' +
    grid +
    '<polygon points="'+profitPolygon+'" fill="url(#profZoneGrad_'+scope+')"/>' +
    '<polyline fill="none" stroke="'+netColor+'" stroke-width="2.5" stroke-dasharray="6 4" points="'+netCoords.join(' ')+'"/>' +
    '<polyline fill="none" stroke="'+valColor+'" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" points="'+valCoords.join(' ')+'"/>' +
    dots +
    '</svg>';

  var legend = '<div class="chart-legend">' +
    '<span><i style="background:'+valColor+'"></i>القيمة السوقية ('+(scope==='ALL'?'الإجمالي':scope)+')</span>' +
    '<span><i style="background:'+netColor+'"></i>صافي الإيداعات (رأس المال الصافي)</span>' +
    '<span><i style="background:'+(scope==='SMART'?'rgba(245,197,66,0.35)':'rgba(14,138,95,0.3)')+'"></i>منطقة الربح الفعلي المظللة</span>' +
    '</div>';
  return svg + legend;
}

/* 2. Period Profit & Loss Bar Chart (تغير الربح الصافي لكل فترة بالأخضر والأحمر) */
function svgPeriodPnLBars(daily, scope){
  if(!daily || daily.length < 2) return '<div style="text-align:center;padding:20px;color:var(--muted)">يلزم وجود لقطتين على الأقل لعرض أرباح وخسائر الفترات</div>';
  var periods = daily.slice(1).map(function(d, idx){
    var prev = daily[idx];
    var dp = scope === 'SCHOOL' ? d.schDProfit : (scope === 'SMART' ? d.smtDProfit : d.dProfit);
    var dv = scope === 'SCHOOL' ? d.schDVal : (scope === 'SMART' ? d.smtDVal : d.dVal);
    var dc = scope === 'SCHOOL' ? d.schDNet : (scope === 'SMART' ? d.smtDNet : d.dNet);
    var rPct = scope === 'SCHOOL' ? d.rSch : (scope === 'SMART' ? d.rSmt : d.rTot);
    return {
      from: prev.date,
      to: d.date,
      dp: dp,
      dv: dv,
      dc: dc,
      rPct: rPct
    };
  });

  var W = 720, H = 250, padL = 52, padR = 20, padT = 30, padB = 42;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var maxAbs = 100;
  periods.forEach(function(p){ maxAbs = Math.max(maxAbs, Math.abs(p.dp)); });
  maxAbs = Math.ceil(maxAbs * 1.22 / 500) * 500;

  var zeroY = padT + plotH * 0.48; // balanced baseline
  var halfH = plotH * 0.44;

  var bars = '';
  bars += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+zeroY+'" y2="'+zeroY+'" stroke="var(--muted)" stroke-width="1.5"/>';

  var slot = plotW / periods.length;
  var bw = Math.min(56, slot * 0.56);

  periods.forEach(function(p, i){
    var cx = padL + (i + 0.5) * slot;
    var h = Math.max(4, (Math.abs(p.dp) / maxAbs) * halfH);
    var isPos = p.dp >= 0;
    var y = isPos ? (zeroY - h) : zeroY;
    var col = isPos ? 'var(--acc)' : 'var(--red)';
    var tip = esc('الفترة: ' + dmyShort(p.from) + ' ← ' + dmyShort(p.to) + ' | صافي تغير الربح: ' + signMoney(p.dp) + ' ر.س (' + signPct(p.rPct) + ') | تغير القيمة: ' + signMoney(p.dv) + ' | صافي الإيداع: ' + signMoney(p.dc));
    bars += '<rect class="chart-bar-item" x="'+(cx - bw/2)+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="6" fill="'+col+'" data-tip="'+tip+'"/>';
    var lblY = isPos ? (y - 7) : (y + h + 13);
    bars += '<text x="'+cx+'" y="'+lblY+'" text-anchor="middle" font-size="11" font-weight="700" fill="'+col+'" direction="ltr">'+signMoney(p.dp)+'</text>';
    bars += '<text x="'+cx+'" y="'+(H - 12)+'" text-anchor="middle" font-size="10.5" fill="var(--muted)" direction="ltr">'+dmyShort(p.from)+'→'+dmyShort(p.to)+'</text>';
  });

  var svg = '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="الأرباح والخسائر الصافية لكل فترة">' + bars + '</svg>';
  var legend = '<div class="chart-legend">' +
    '<span><i style="background:var(--acc)"></i>ربح سوقي صافي في الفترة (+)</span>' +
    '<span><i style="background:var(--red)"></i>تراجع سوقي أو رسم إيداع في الفترة (−)</span>' +
    '</div>';
  return svg + legend;
}

/* 3. Actual Calculated Profit vs Derayah Displayed Profit Curve (منحنى الربح الفعلي مقابل ربح دراية الظاهر) */
function svgProfitComparisonCurve(daily, scope){
  if(!daily || !daily.length) return '';
  var W = 720, H = 245, padL = 56, padR = 24, padT = 24, padB = 36;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  var pts = daily.map(function(d){
    if(scope === 'SCHOOL') return { date: d.date, act: d.schProfit, app: d.schAppProfit, gap: d.schFeeGap };
    if(scope === 'SMART') return { date: d.date, act: d.smtProfit, app: d.smtAppProfit, gap: d.smtFeeGap };
    return { date: d.date, act: d.totProfit, app: d.totAppProfit, gap: d.totFeeGap };
  });

  var minV = Infinity, maxV = -Infinity;
  pts.forEach(function(p){
    minV = Math.min(minV, p.act, p.app);
    maxV = Math.max(maxV, p.act, p.app);
  });
  var span = Math.max(500, maxV - minV);
  minV = Math.max(0, Math.floor((minV - span * 0.25) / 1000) * 1000);
  maxV = Math.ceil((maxV + span * 0.2) / 1000) * 1000;
  var range = Math.max(1, maxV - minV);

  function xAt(i){ return pts.length === 1 ? (padL + plotW / 2) : (padL + (i / (pts.length - 1)) * plotW); }
  function yAt(v){ return padT + plotH - ((v - minV) / range) * plotH; }

  var grid = '';
  for(var g=0; g<=4; g++){
    var gv = minV + (range * g / 4);
    var gy = yAt(gv);
    grid += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--line)" stroke-dasharray="3 3"/>';
    grid += '<text x="'+(padL-8)+'" y="'+(gy+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" direction="ltr">'+nf0.format(Math.round(gv))+'</text>';
  }

  var actCoords = pts.map(function(p, i){ return xAt(i).toFixed(1) + ',' + yAt(p.act).toFixed(1); });
  var appCoords = pts.map(function(p, i){ return xAt(i).toFixed(1) + ',' + yAt(p.app).toFixed(1); });
  var revActCoords = pts.slice().reverse().map(function(p, revI){
    var origI = pts.length - 1 - revI;
    return xAt(origI).toFixed(1) + ',' + yAt(p.act).toFixed(1);
  });
  var gapPoly = appCoords.concat(revActCoords).join(' ');

  var dots = '';
  pts.forEach(function(p, i){
    var cx = xAt(i), cyAct = yAt(p.act), cyApp = yAt(p.app);
    var tip = esc(dmyFull(p.date) + ' | ربح دراية الظاهر: ' + money(p.app) + ' ر.س | الربح الفعلي المحسوب: ' + money(p.act) + ' ر.س | الفرق (الرسوم/الفجوة): ' + money(p.gap) + ' ر.س');
    dots += '<circle class="chart-pt" cx="'+cx+'" cy="'+cyApp+'" r="4.5" fill="#d4941c" stroke="var(--card)" stroke-width="2" data-tip="'+tip+'"/>';
    dots += '<circle class="chart-pt" cx="'+cx+'" cy="'+cyAct+'" r="5" fill="var(--acc)" stroke="var(--card)" stroke-width="2" data-tip="'+tip+'"/>';
    dots += '<text x="'+cx+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="var(--muted)" direction="ltr">'+dmyShort(p.date)+'</text>';
  });

  var svg = '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="مقارنة الربح الفعلي المحسوب وربح دراية الظاهر">' +
    grid +
    '<polygon points="'+gapPoly+'" fill="rgba(212,148,28,0.16)"/>' +
    '<polyline fill="none" stroke="#d4941c" stroke-width="2.6" stroke-dasharray="5 3" points="'+appCoords.join(' ')+'"/>' +
    '<polyline fill="none" stroke="var(--acc)" stroke-width="3.2" points="'+actCoords.join(' ')+'"/>' +
    dots +
    '</svg>';

  var legend = '<div class="chart-legend">' +
    '<span><i style="background:var(--acc)"></i>الربح الفعلي المحسوب (بعد كل الرسوم)</span>' +
    '<span><i style="background:#d4941c"></i>ربح دراية الظاهر في التطبيق</span>' +
    '<span><i style="background:rgba(212,148,28,0.35)"></i>فجوة الرسوم وفروق التكلفة</span>' +
    '</div>';
  return svg + legend;
}

/* 4. Implied Fees & Cost-Basis Gap Evolution + Per-Snapshot Fee Events Chart */
function svgFeesBreakdownChart(rawSnaps, latest){
  if(!rawSnaps || !rawSnaps.length || !latest) return '';
  var W = 720, H = 240, padL = 54, padR = 24, padT = 28, padB = 40;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  var maxG = 3500;
  rawSnaps.forEach(function(s){ maxG = Math.max(maxG, s.totFeeGap * 1.15); });
  maxG = Math.ceil(maxG / 500) * 500;

  var slot = plotW / rawSnaps.length;
  var bw = Math.min(48, slot * 0.56);

  var grid = '';
  for(var g=0; g<=4; g++){
    var gv = (maxG * g / 4);
    var gy = padT + plotH - (gv / maxG) * plotH;
    grid += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--line)" stroke-dasharray="3 3"/>';
    grid += '<text x="'+(padL-8)+'" y="'+(gy+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" direction="ltr">'+nf0.format(Math.round(gv))+'</text>';
  }

  var bars = '';
  rawSnaps.forEach(function(s, i){
    var cx = padL + (i + 0.5) * slot;
    var hSch = (s.schFeeGap / maxG) * plotH;
    var hSmt = (s.smtFeeGap / maxG) * plotH;
    var ySmt = padT + plotH - hSmt;
    var ySch = ySmt - hSch;
    var deltaTxt = i === 0 ? 'رصيد الفجوة التأسيسي' : ('التغير في هذه اللقطة: ' + signMoney(s.dFeeGap) + ' ر.س');
    var tip = esc('لقطة #' + s.seq + ' (' + dmyFull(s.date) + ') | إجمالي الفجوة/الرسوم: ' + money(s.totFeeGap) + ' ر.س (SMART: ' + money(s.smtFeeGap) + ' + SCHOOL: ' + money(s.schFeeGap) + ') | ' + deltaTxt);

    bars += '<rect class="chart-bar-item" x="'+(cx - bw/2)+'" y="'+ySmt+'" width="'+bw+'" height="'+Math.max(2, hSmt)+'" fill="#d4941c" data-tip="'+tip+'"/>';
    bars += '<rect class="chart-bar-item" x="'+(cx - bw/2)+'" y="'+ySch+'" width="'+bw+'" height="'+Math.max(2, hSch)+'" rx="4" fill="#0e8a5f" data-tip="'+tip+'"/>';

    bars += '<text x="'+cx+'" y="'+(ySch - 6)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)" direction="ltr">'+money(s.totFeeGap)+'</text>';
    if(i > 0 && Math.abs(s.dFeeGap) > 0.01){
      bars += '<text x="'+cx+'" y="'+(ySch - 19)+'" text-anchor="middle" font-size="10" font-weight="800" fill="var(--red)" direction="ltr">('+signMoney(s.dFeeGap)+')</text>';
    }
    bars += '<text x="'+cx+'" y="'+(H - 12)+'" text-anchor="middle" font-size="10" fill="var(--muted)" direction="ltr">#'+s.seq+' '+dmyShort(s.date)+'</text>';
  });

  var svg = '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="تراكم رسوم وفوارق دراية لكل محفظة">' + grid + bars + '</svg>';
  var legend = '<div class="chart-legend">' +
    '<span><i style="background:#d4941c"></i>فجوة/رسوم SMART ('+money(latest.smtFeeGap)+' ر.س — '+pctFmt(latest.smtFeeGap/latest.totFeeGap,1)+')</span>' +
    '<span><i style="background:#0e8a5f"></i>فجوة/رسوم SCHOOL ('+money(latest.schFeeGap)+' ر.س — '+pctFmt(latest.schFeeGap/latest.totFeeGap,1)+')</span>' +
    '<span><i style="background:var(--red)"></i>أرقام القوسين بالأحمر = رسوم مستقطعة في تلك اللقطة</span>' +
    '</div>';
  return svg + legend;
}

/* 5. Allocation & Profit Contribution Donuts (SCHOOL vs SMART) */
function svgDualDonuts(latest){
  if(!latest) return '';
  function makeDonut(title, subLbl, vSch, vSmt){
    var tot = Math.max(0.01, vSch + vSmt);
    var pSch = vSch / tot, pSmt = vSmt / tot;
    var R = 50, C = 2 * Math.PI * R;
    var lenSch = pSch * C, lenSmt = pSmt * C;
    return '<div style="display:flex;align-items:center;gap:14px;background:var(--bg);padding:14px;border-radius:18px;border:1px solid var(--line)">' +
      '<svg width="124" height="124" viewBox="0 0 132 132" style="flex:none">' +
        '<circle r="'+R+'" cx="66" cy="66" fill="none" stroke="var(--line)" stroke-width="18"/>' +
        '<circle r="'+R+'" cx="66" cy="66" fill="none" stroke="#d4941c" stroke-width="18" stroke-dasharray="'+lenSmt+' '+C+'" stroke-dashoffset="0" transform="rotate(-90 66 66)"/>' +
        '<circle r="'+R+'" cx="66" cy="66" fill="none" stroke="#0e8a5f" stroke-width="18" stroke-dasharray="'+lenSch+' '+C+'" stroke-dashoffset="'+(-lenSmt)+'" transform="rotate(-90 66 66)"/>' +
        '<text x="66" y="61" text-anchor="middle" font-size="11" fill="var(--muted)">'+esc(subLbl)+'</text>' +
        '<text x="66" y="79" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)" direction="ltr">'+Math.round(tot/1000)+'k</text>' +
      '</svg>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:800;font-size:14.5px;margin-bottom:8px">'+esc(title)+'</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">' +
          '<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#0e8a5f;margin-left:5px"></i>SCHOOL</span>' +
          '<b class="n priv-num">'+pctFmt(pSch, 1)+' ('+money(vSch)+')</b>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px">' +
          '<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#d4941c;margin-left:5px"></i>SMART</span>' +
          '<b class="n priv-num">'+pctFmt(pSmt, 1)+' ('+money(vSmt)+')</b>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  return '<div class="grid-3">' +
    makeDonut('توزيع القيمة الحالية', 'القيمة', latest.schoolVal, latest.smartVal) +
    makeDonut('توزيع صافي الإيداعات', 'الإيداعات', latest.schNet, latest.smtNet) +
    makeDonut('مساهمة الربح الفعلي', 'الأرباح', Math.max(0, latest.schProfit), Math.max(0, latest.smtProfit)) +
  '</div>';
}

/* 6. Goal Trajectory Projection Chart (مسار الوصول للأهداف بالادخار فقط مقابل العائد المتوقع) */
function svgGoalProjectionChart(gSch, gSmt, annRetPct){
  var W = 720, H = 240, padL = 56, padR = 24, padT = 24, padB = 36;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var maxMonths = 140; // ~11.6 years horizon
  var rMo = (Number(annRetPct) || 0) / 100 / 12;

  var ptsSave = [], ptsComp = [];
  var vSave = gSch.curVal + gSmt.curVal;
  var vComp = vSave;
  var totPlan = gSch.monthlyPlan + gSmt.monthlyPlan;
  var combinedTarget = (gSch.targetAmount || 0) + (gSmt.targetAmount || 0);

  for(var m=0; m<=maxMonths; m+=5){
    ptsSave.push({ m: m, v: vSave + totPlan * m });
    var vc = (gSch.curVal + gSmt.curVal);
    for(var k=0; k<m; k++) vc = vc * (1 + rMo) + totPlan;
    ptsComp.push({ m: m, v: vc });
  }

  var maxV = Math.max(combinedTarget * 1.05, ptsComp[ptsComp.length - 1].v);
  function xAt(m){ return padL + (m / maxMonths) * plotW; }
  function yAt(v){ return padT + plotH - (v / maxV) * plotH; }

  var grid = '';
  for(var g=0; g<=4; g++){
    var gv = maxV * g / 4;
    var gy = yAt(gv);
    grid += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--line)" stroke-dasharray="3 3"/>';
    grid += '<text x="'+(padL-8)+'" y="'+(gy+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" direction="ltr">'+Math.round(gv/1000)+'k</text>';
  }

  var yTarget = yAt(combinedTarget);
  var targetLine = '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+yTarget+'" y2="'+yTarget+'" stroke="#d4941c" stroke-width="2" stroke-dasharray="6 4"/>' +
    '<text x="'+(padL+8)+'" y="'+(yTarget-6)+'" font-size="11" font-weight="700" fill="#d4941c">مجموع الهدفين (' + moneyInt(combinedTarget) + ' ر.س)</text>';

  var saveCoords = ptsSave.map(function(p){ return xAt(p.m).toFixed(1)+','+yAt(p.v).toFixed(1); }).join(' ');
  var compCoords = ptsComp.map(function(p){ return xAt(p.m).toFixed(1)+','+yAt(p.v).toFixed(1); }).join(' ');

  var xLabels = '';
  for(var yr=0; yr<=10; yr+=2){
    var mYr = yr * 12;
    if(mYr <= maxMonths){
      xLabels += '<text x="'+xAt(mYr)+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="var(--muted)">بعد '+yr+' سنة</text>';
    }
  }

  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="محاكاة مسار الوصول للأهداف">' +
    grid + targetLine +
    '<polyline fill="none" stroke="#4a6fa5" stroke-width="2.5" stroke-dasharray="5 4" points="'+saveCoords+'"/>' +
    '<polyline fill="none" stroke="var(--acc)" stroke-width="3.2" points="'+compCoords+'"/>' +
    xLabels +
  '</svg>' +
  '<div class="chart-legend">' +
    '<span><i style="background:var(--acc)"></i>المسار مع عائد سنوي متوقع ('+annRetPct+'% سنوياً)</span>' +
    '<span><i style="background:#4a6fa5"></i>المسار بالادخار فقط (0% عائد — مطابق للإكسل)</span>' +
    '<span><i style="background:#d4941c"></i>خط الهدف الكلي للمحفظتين (' + moneyInt(combinedTarget) + ' ر.س)</span>' +
  '</div>';
}

/* ===== View Renderers ===== */

function renderAll(){
  var E = computeEngine();
  document.body.classList.toggle('privacy-on', !!S.privacy);
  $('privBtn').classList.toggle('active', !!S.privacy);
  $('secShieldBtn').classList.toggle('active', !!sessionPassword);

  var L = E.latest;
  $('metaStrip').innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span class="badge-live"><i class="dot"></i>' + (L ? ('آخر لقطة: <span class="n">' + L.date + '</span>') : 'لا توجد لقطات بعد') + '</span>' +
      '<span>القيم بالريال السعودي</span>' +
      '<span>•</span>' +
      '<span><b class="n">' + E.daysCount + '</b> يوم مسجل (<b class="n">' + E.rawSnaps.length + '</b> لقطة و <b class="n">' + E.txs.length + '</b> حركة)</span>' +
    '</div>' +
    '<button class="badge-sec" id="metaSecBadge" title="اضغط لإدارة التشفير والأمان">' +
      (sessionPassword ? '🔒 مشفر محلياً (AES-256)' : '🛡️ محلي 100% على جهازك — لا يرسل أي حرف للإنترنت') +
    '</button>';

  var sb = $('metaSecBadge');
  if(sb) sb.onclick = function(){ switchTab('guide'); };

  renderHomeView(E);
  renderChartsView(E);
  renderJourneyView(E);
  renderCommitView(E);
  renderGoalsView(E);
  renderGuideView(E);
}

/* TAB 1: HOME (رحلتي) */
function renderHomeView(E){
  var el = $('view-home');
  var L = E.latest;
  if(!L){
    el.innerHTML =
      '<section class="hero-card" style="text-align:center;padding:30px 22px">' +
        '<div style="font-size:46px;margin-bottom:8px">🛡️📈</div>' +
        '<h2 style="margin:0 0 8px;font-size:23px;font-weight:800">مرحباً بك في «رحلتي المالية»</h2>' +
        '<p style="color:rgba(255,255,255,0.88);max-width:560px;margin:0 auto 20px;font-size:14.5px;line-height:1.7">تطبيقك الشخصي الآمن لمتابعة الاستثمارات والادخارات. <b>النسخة العامة فارغة تماماً لحماية خصوصيتك</b>؛ اضغط الزر أدناه لاختيار ملفك أو الصق كود بياناتك لتُحفظ محلياً 100% داخل جهازك فقط بدون أي اتصال بالإنترنت.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;max-width:640px;margin:0 auto">' +
          '<button class="btn gold" id="emptyImpUnified" style="margin:0;padding:16px;font-size:15.5px;box-shadow:0 6px 18px rgba(0,0,0,0.2)">📂 استيراد ملف الإكسل (.xlsx) أو النسخة الاحتياطية (.json)</button>' +
          '<button class="btn" id="emptyPasteCode" style="margin:0;padding:16px;font-size:15.5px;background:rgba(255,255,255,0.16);border:1.5px solid rgba(255,255,255,0.35)">📋 لصق كود البيانات السريع</button>' +
        '</div>' +
        '<div style="margin-top:14px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn ghost btn-sm" id="emptyAddFirstTx" style="background:rgba(0,0,0,0.2);color:#fff;border-color:rgba(255,255,255,0.2)">➕ أو ابدأ بإضافة حركة ولقطة يدوياً</button>' +
        '</div>' +
      '</section>';
    $('emptyImpUnified').onclick = function(){ $('anyDataFileInput').click(); };
    $('emptyPasteCode').onclick = function(){ openPasteModal(); };
    $('emptyAddFirstTx').onclick = function(){ openTxModal(null); };
    return;
  }

  var periodBanner = '';
  if(E.prevDay){
    var pCol = L.dProfit >= 0 ? '#7fe8b8' : '#ff9b9b';
    periodBanner =
      '<div class="hero-period-bar">' +
        '<span class="p-item">📅 من <b class="n">' + dmyShort(E.prevDay.date) + '</b> إلى <b class="n">' + dmyShort(L.date) + '</b></span>' +
        '<span class="p-item">تغير القيمة: <b class="n priv-num">' + signMoney(L.dVal) + '</b> ريال</span>' +
        '<span class="p-item">صافي الحركات: <b class="n priv-num">' + signMoney(L.dNet) + '</b> ريال</span>' +
        '<span class="p-item">تغير الربح الصافي: <b class="n priv-num" style="color:'+pCol+'">' + signMoney(L.dProfit) + '</b> ريال</span>' +
      '</div>';
  }

  var R = E.curMonthRhythm;
  var html =
    '<section class="hero-card">' +
      '<div class="hero-top">' +
        '<div>' +
          '<div class="hero-lbl">القيمة السوقية الحالية (SCHOOL + SMART)</div>' +
          '<div class="hero-val"><span class="n priv-num">' + money(L.totVal) + '</span><span class="cur">ر.س</span></div>' +
        '</div>' +
        '<div class="hero-alloc-pill">' +
          '<div>توزيع المحفظتين الحالي</div>' +
          '<b class="n">SCHOOL ' + pctFmt(L.schShare, 1) + '  /  SMART ' + pctFmt(L.smtShare, 1) + '</b>' +
        '</div>' +
      '</div>' +
      '<div class="hero-kpi-grid">' +
        '<div class="hero-kpi">' +
          '<div class="k-lbl"><span>صافي الإيداعات بعد السحب</span><span>💰</span></div>' +
          '<div class="k-val n priv-num">' + money(L.totNet) + ' ر.س</div>' +
          '<div class="k-sub priv-num">إيداعات: <span class="n">' + money(L.totDep) + '</span> | سحوبات: <span class="n">' + money(L.totWth) + '</span></div>' +
        '</div>' +
        '<div class="hero-kpi">' +
          '<div class="k-lbl"><span>صافي الربح الفعلي المحسوب</span><span class="n" style="background:rgba(255,255,255,0.18);padding:1px 7px;border-radius:99px">' + signPct(E.returns.roiTot) + '</span></div>' +
          '<div class="k-val n priv-num" style="color:#86f7c6">+' + money(L.totProfit) + ' ر.س</div>' +
          '<div class="k-sub priv-num">القيمة الحالية − صافي الإيداعات</div>' +
        '</div>' +
        '<div class="hero-kpi">' +
          '<div class="k-lbl"><span>ربح دراية الظاهر في التطبيق</span><span class="n">' + signPct(E.returns.appRoiTot) + '</span></div>' +
          '<div class="k-val n priv-num" style="color:#f5c542">+' + money(L.totAppProfit) + ' ر.س</div>' +
          '<div class="k-sub priv-num">المستثمر الظاهر: <span class="n">' + money(L.totInv) + '</span> ر.س | الفرق/الرسوم: <span class="n">' + money(L.totFeeGap) + '</span> ر.س</div>' +
        '</div>' +
      '</div>' +
      periodBanner +
    '</section>' +

    /* Quick Action Buttons */
    '<div class="quick-bar">' +
      '<button class="qbtn q-primary" id="qSnapBtn">' +
        '<span class="q-ico">📸</span>' +
        '<span class="q-txt"><b>تحديث لقطة دراية</b><small>أدخل القيمة والمستثمر الظاهر للمحفظتين</small></span>' +
      '</button>' +
      '<button class="qbtn q-gold" id="qSalaryBtn">' +
        '<span class="q-ico">⚡</span>' +
        '<span class="q-txt"><b>إيداع الراتب الشهري بضغطة</b><small>' + moneyInt(R.planSch) + ' SCHOOL + ' + moneyInt(R.planSmt) + ' SMART معاً</small></span>' +
      '</button>' +
      '<button class="qbtn q-blue" id="qTxBtn">' +
        '<span class="q-ico">➕</span>' +
        '<span class="q-txt"><b>إضافة حركة مالية</b><small>إيداع شهري أو إضافي أو سحب</small></span>' +
      '</button>' +
      '<button class="qbtn q-purple" id="qChartsBtn">' +
        '<span class="q-ico">📊</span>' +
        '<span class="q-txt"><b>الرسوم البيانية المتقدمة</b><small>تشارتات الأرباح والخسائر والرسوم</small></span>' +
      '</button>' +
    '</div>' +

    /* Portfolios Side by Side */
    '<div class="sec-head">' +
      '<h2>💼 المحافظ في لقطة واحدة</h2>' +
      '<small>تفصيل SCHOOL و SMART حتى آخر لقطة (<span class="n">' + L.date + '</span>)</small>' +
    '</div>' +
    '<div class="grid-2">' +
      renderPortfolioCard('SCHOOL', S.portfolios.SCHOOL, {
        val: L.schoolVal, inv: L.schoolInv, dep: L.schDep, wth: L.schWth, net: L.schNet,
        profit: L.schProfit, appProfit: L.schAppProfit, feeGap: L.schFeeGap, share: L.schShare,
        roi: E.returns.roiSch, twr: E.returns.twrSch, monthDep: R.schMonthly, goal: E.goalSCHOOL
      }) +
      renderPortfolioCard('SMART', S.portfolios.SMART, {
        val: L.smartVal, inv: L.smartInv, dep: L.smtDep, wth: L.smtWth, net: L.smtNet,
        profit: L.smtProfit, appProfit: L.smtAppProfit, feeGap: L.smtFeeGap, share: L.smtShare,
        roi: E.returns.roiSmt, twr: E.returns.twrSmt, monthDep: R.smtMonthly, goal: E.goalSMART
      }) +
    '</div>' +

    /* Interactive Charts Preview on Home */
    '<div class="sec-head">' +
      '<h2>📈 تطور القيمة وصافي الإيداعات وأرباح الفترات</h2>' +
      '<button class="btn ghost btn-sm" id="homeMoreCharts">فتح جميع الرسوم البيانية (6 تشارتات) ←</button>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="card">' +
        '<div class="card-title"><h3>القيمة السوقية وصافي الإيداعات</h3><small>المساحة المظللة = الربح المحسوب</small></div>' +
        svgValueVsNetChart(E.dailyJourney, 'ALL') +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><h3>الأرباح والخسائر الصافية لكل فترة</h3><small>بعد استبعاد أثر الإيداعات</small></div>' +
        svgPeriodPnLBars(E.dailyJourney, 'ALL') +
      '</div>' +
    '</div>' +

    /* Monthly Rhythm & Next Milestone Row */
    '<div class="grid-2">' +
      '<div class="card">' +
        '<div class="card-title">' +
          '<h3>🗓️ إيقاع هذا الشهر (<span class="n">' + R.year + '-' + pad2(R.month) + '</span> — ' + R.monthName + ')</h3>' +
          '<span class="pill ' + (R.status==='مكتمل'?'ok':'warn') + '">' + R.status + (R.status==='مكتمل'?' ✓':'') + '</span>' +
        '</div>' +
        '<div class="grid-3" style="margin-bottom:10px">' +
          '<div style="background:var(--bg);padding:10px 12px;border-radius:14px">' +
            '<small style="color:var(--muted);display:block">الخطة الشهرية</small>' +
            '<b class="n priv-num" style="font-size:17px">' + moneyInt(R.totPlan) + ' ر.س</b>' +
          '</div>' +
          '<div style="background:var(--bg);padding:10px 12px;border-radius:14px">' +
            '<small style="color:var(--muted);display:block">المودع ضمن الخطة</small>' +
            '<b class="n pos priv-num" style="font-size:17px">' + moneyInt(R.totMonthly) + ' ر.س</b>' +
          '</div>' +
          '<div style="background:var(--bg);padding:10px 12px;border-radius:14px">' +
            '<small style="color:var(--muted);display:block">المتبقي للالتزام</small>' +
            '<b class="n priv-num" style="font-size:17px">' + moneyInt(R.remTot) + ' ر.س</b>' +
          '</div>' +
        '</div>' +
        '<div class="stat-rows">' +
          '<div class="stat-row"><span>SCHOOL (الخطة: <b class="n">' + moneyInt(R.planSch) + '</b>)</span><b class="pos"><span class="n priv-num">' + moneyInt(R.schMonthly) + '</span> من <span class="n">' + moneyInt(R.planSch) + '</span> ' + (R.schMonthly>=R.planSch?'✓':'') + '</b></div>' +
          '<div class="stat-row"><span>SMART (الخطة: <b class="n">' + moneyInt(R.planSmt) + '</b>)</span><b class="pos"><span class="n priv-num">' + moneyInt(R.smtMonthly) + '</span> من <span class="n">' + moneyInt(R.planSmt) + '</span> ' + (R.smtMonthly>=R.planSmt?'✓':'') + '</b></div>' +
        '</div>' +
        '<div class="callout muted" style="margin-top:10px;padding:8px 12px;font-size:12px">الإضافات المستقلة عن الخطة لا تغيّر التزامك الشهري.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">' +
          '<h3>🏁 المحطة القادمة في الرحلة</h3>' +
          '<span class="pill warn">خطوة كل <span class="n">' + moneyInt(E.milestone.step) + '</span> ر.س</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
          '<div><small style="color:var(--muted)">آخر محطة تجاوزتها:</small> <b class="n priv-num">' + moneyInt(E.milestone.passed) + ' ر.س ✓</b></div>' +
          '<div><small style="color:var(--muted)">المحطة القادمة:</small> <b class="n gold-txt priv-num" style="font-size:18px">' + moneyInt(E.milestone.next) + ' ر.س</b></div>' +
        '</div>' +
        '<div class="prog-track" style="height:14px"><div class="prog-fill gold" style="width:' + Math.min(100, Math.max(0, E.milestone.prog * 100)).toFixed(2) + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13.5px;margin-top:8px">' +
          '<span>التقدم بين المحطتين: <b class="n">' + pctFmt(E.milestone.prog, 2) + '</b></span>' +
          '<span>باقي للمحطة القادمة: <b class="n priv-num">' + money(E.milestone.rem) + ' ريال</b></span>' +
        '</div>' +
        '<div class="callout gold" style="margin-top:12px;padding:9px 12px;font-size:12.5px">' +
          'بالادخار الشهري وحده (<span class="n">' + moneyInt(R.totPlan) + '</span> ر.س/شهر)، تصل إلى محطة <b class="n">' + moneyInt(E.milestone.next) + '</b> ر.س خلال <b>' + (R.totPlan > 0 ? Math.ceil(E.milestone.rem / R.totPlan) : '—') + ' أشهر</b> تقريباً (أقرب مع عائد السوق).' +
        '</div>' +
      '</div>' +
    '</div>';

  el.innerHTML = html;
  $('qSnapBtn').onclick = function(){ openSnapModal(null); };
  $('qSalaryBtn').onclick = function(){ quickRecordMonthlySalary(); };
  $('qTxBtn').onclick = function(){ openTxModal(null); };
  $('qChartsBtn').onclick = function(){ switchTab('charts'); };
  $('homeMoreCharts').onclick = function(){ switchTab('charts'); };
}

function renderPortfolioCard(code, meta, st){
  var cls = code === 'SCHOOL' ? 'school' : 'smart';
  var barCls = code === 'SCHOOL' ? '' : 'gold';
  return '<div class="port-card ' + cls + '">' +
    '<div class="port-hd">' +
      '<div>' +
        '<span class="port-badge">' + (code==='SCHOOL'?'🎓 SCHOOL':'🚗 SMART') + '</span>' +
        '<div style="font-size:12.5px;color:var(--muted);margin-top:4px">' + esc(meta.goalName) + '</div>' +
      '</div>' +
      '<span class="port-share">حصة القيمة: <span class="n">' + pctFmt(st.share, 2) + '</span></span>' +
    '</div>' +
    '<div class="port-big"><span class="n priv-num">' + money(st.val) + '</span> <small>ريال سعودي</small></div>' +
    '<div class="stat-rows">' +
      '<div class="stat-row"><span>صافي الإيداعات بعد السحب</span><b class="n priv-num">' + money(st.net) + ' ر.س</b></div>' +
      '<div class="stat-row"><span>إجمالي الإيداعات / السحوبات</span><b class="n priv-num" style="font-size:12.5px">' + money(st.dep) + ' / ' + money(st.wth) + '</b></div>' +
      '<div class="stat-row"><span>الربح الفعلي المحسوب (نسبة العائد ROI)</span><b class="n pos priv-num">+' + money(st.profit) + ' ر.س (' + signPct(st.roi) + ')</b></div>' +
      '<div class="stat-row"><span>المبلغ المستثمر الظاهر في دراية</span><b class="n priv-num">' + money(st.inv) + ' ر.س</b></div>' +
      '<div class="stat-row"><span>ربح دراية الظاهر في التطبيق</span><b class="n gold-txt priv-num">+' + money(st.appProfit) + ' ر.س</b></div>' +
      '<div class="stat-row"><span>الفرق عن ربح دراية (رسوم/فجوة مستنتجة)</span><b class="n neg priv-num">' + money(st.feeGap) + ' ر.س</b></div>' +
      '<div class="stat-row"><span>خطة الإيداع الشهري (التزام هذا الشهر)</span><b class="n priv-num">' + moneyInt(meta.monthlyPlan) + ' ر.س (' + (st.monthDep >= meta.monthlyPlan ? 'مكتمل ✓' : 'أودع ' + moneyInt(st.monthDep)) + ')</b></div>' +
    '</div>' +
    '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)">' +
      '<div style="display:flex;justify-content:space-between;font-size:12.5px">' +
        '<span>التقدم نحو الهدف (<span class="n priv-num">' + moneyInt(meta.targetAmount) + '</span> ر.س)</span>' +
        '<b class="n">' + pctFmt(st.goal.pct, 2) + '</b>' +
      '</div>' +
      '<div class="prog-track"><div class="prog-fill ' + barCls + '" style="width:' + Math.min(100, st.goal.pct * 100).toFixed(2) + '%"></div></div>' +
    '</div>' +
  '</div>';
}

/* TAB 2: CHARTS & VISUAL ANALYTICS SUITE (الرسوم والتحليلات البيانية) */
function renderChartsView(E){
  var el = $('view-charts');
  var L = E.latest;
  if(!L){
    el.innerHTML = '<div class="card" style="text-align:center;padding:30px">أضف بيانات لعرض الرسوم البيانية</div>';
    return;
  }
  var sc = UI.chartFilter; // 'ALL' | 'SCHOOL' | 'SMART'
  var scTitle = sc === 'ALL' ? 'إجمالي المحفظتين (SCHOOL + SMART)' : ('محفظة ' + sc);

  // Gross gain split (Actual Net Profit vs Implied Fees/Gap)
  var grossGainSch = round2(L.schProfit + L.schFeeGap);
  var grossGainSmt = round2(L.smtProfit + L.smtFeeGap);
  var grossGainTot = round2(L.totProfit + L.totFeeGap);
  var netShareTot = grossGainTot > 0 ? (L.totProfit / grossGainTot) * 100 : 0;
  var feeShareTot = grossGainTot > 0 ? (L.totFeeGap / grossGainTot) * 100 : 0;

  var html =
    '<div class="sec-head">' +
      '<div>' +
        '<h2>📊 مركز الرسوم والتحليلات البيانية المتقدمة</h2>' +
        '<small>مرر أو اضغط على أي نقطة أو عمود لعرض التفاصيل الدقيقة بالريال والنسبة</small>' +
      '</div>' +
      '<div class="seg-bar" id="chartScopeSeg">' +
        '<button data-s="ALL" class="'+(sc==='ALL'?'on':'')+'">الإجمالي</button>' +
        '<button data-s="SCHOOL" class="'+(sc==='SCHOOL'?'on':'')+'">SCHOOL 🎓</button>' +
        '<button data-s="SMART" class="'+(sc==='SMART'?'on':'')+'">SMART 🚗</button>' +
      '</div>' +
    '</div>' +

    /* 1. Value vs Net Deposits Area Chart */
    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>1️⃣ تطور القيمة السوقية مقابل صافي الإيداعات — ' + scTitle + '</h3>' +
        '<span class="pill ok">الفارق المظلل = الربح الصافي المحسوب</span>' +
      '</div>' +
      svgValueVsNetChart(E.dailyJourney, sc) +
    '</div>' +

    /* 2. Period P&L Waterfall / Bars */
    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>2️⃣ الأرباح والخسائر الصافية لكل فترة (تغير الربح الصافي) — ' + scTitle + '</h3>' +
        '<span class="pill blue">يفصل أداء السوق عن الإيداعات الجديدة</span>' +
      '</div>' +
      svgPeriodPnLBars(E.dailyJourney, sc) +
      '<div class="callout muted" style="font-size:12.5px">' +
        '💡 <b>كيف تقرأ هذا الرسم؟</b> العمود الأخضر يمثل ربحاً سوقياً خالصاً بعد استبعاد أي إيداع جديد، والعمود الأحمر يمثل تراجعاً سوقياً أو رسم تنفيذ الإيداع في نفس اليوم (تغير الربح = تغير القيمة − صافي الحركات).' +
      '</div>' +
    '</div>' +

    /* 3. Dual Line: Actual Profit vs Derayah App Profit */
    '<div class="grid-2">' +
      '<div class="card">' +
        '<div class="card-title">' +
          '<h3>3️⃣ الربح الفعلي المحسوب مقابل ربح دراية الظاهر</h3>' +
          '<small>' + scTitle + '</small>' +
        '</div>' +
        svgProfitComparisonCurve(E.dailyJourney, sc) +
      '</div>' +

      /* 4. Implied Fees & Cost-Basis Gap Bar Chart */
      '<div class="card">' +
        '<div class="card-title">' +
          '<h3>4️⃣ تطور رسوم وفوارق دراية المستنتجة عبر اللقطات</h3>' +
          '<span class="pill bad">الإجمالي الحالي: <span class="n">' + money(L.totFeeGap) + '</span> ر.س</span>' +
        '</div>' +
        svgFeesBreakdownChart(E.rawSnaps, L) +
      '</div>' +
    '</div>' +

    /* Detailed Fee & Gross Gain Split Visual Card */
    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>🔍 تشريح إجمالي الربح الظاهر وتوزيع الفوارق/الرسوم بين المحفظتين</h3>' +
        '<small>مقارنة دقيقة بين ربح التطبيق والربح الصافي الفعلي في جيبك</small>' +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">' +
          '<span>من كل <b>100 ر.س</b> ربح ظاهر في تطبيق دراية (<span class="n priv-num">' + money(grossGainTot) + '</span> ر.س):</span>' +
          '<span>صافي فعلي لك: <b class="n pos">' + nf2.format(netShareTot) + '%</b> | رسوم/فوارق تكلفة: <b class="n neg">' + nf2.format(feeShareTot) + '%</b></span>' +
        '</div>' +
        '<div style="height:18px;border-radius:99px;overflow:hidden;display:flex;background:var(--bg);border:1px solid var(--line)">' +
          '<div style="width:' + netShareTot.toFixed(2) + '%;background:var(--acc)" title="الربح الصافي الفعلي"></div>' +
          '<div style="width:' + feeShareTot.toFixed(2) + '%;background:var(--red)" title="الرسوم وفوارق التكلفة"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl">' +
          '<thead><tr><th>المحفظة</th><th>صافي الإيداعات</th><th>المستثمر الظاهر بدراية</th><th>الرسوم/الفجوة المستنتجة</th><th>ربح دراية الظاهر</th><th>الربح الفعلي المحسوب</th><th>نسبة الرسوم إلى صافي الإيداع</th></tr></thead>' +
          '<tbody>' +
            '<tr><td><b>🎓 SCHOOL</b></td><td class="n priv-num">' + money(L.schNet) + '</td><td class="n priv-num">' + money(L.schoolInv) + '</td><td class="n neg priv-num">' + money(L.schFeeGap) + '</td><td class="n gold-txt priv-num">' + money(L.schAppProfit) + '</td><td class="n pos priv-num"><b>' + money(L.schProfit) + '</b></td><td class="n">' + pctFmt(L.schFeeGap / L.schNet, 2) + '</td></tr>' +
            '<tr><td><b>🚗 SMART</b></td><td class="n priv-num">' + money(L.smtNet) + '</td><td class="n priv-num">' + money(L.smartInv) + '</td><td class="n neg priv-num">' + money(L.smtFeeGap) + '</td><td class="n gold-txt priv-num">' + money(L.smtAppProfit) + '</td><td class="n pos priv-num"><b>' + money(L.smtProfit) + '</b></td><td class="n">' + pctFmt(L.smtFeeGap / L.smtNet, 2) + '</td></tr>' +
            '<tr class="tot-row"><td>الإجمالي</td><td class="n priv-num">' + money(L.totNet) + '</td><td class="n priv-num">' + money(L.totInv) + '</td><td class="n neg priv-num">' + money(L.totFeeGap) + '</td><td class="n gold-txt priv-num">' + money(L.totAppProfit) + '</td><td class="n pos priv-num">' + money(L.totProfit) + '</td><td class="n">' + pctFmt(L.totFeeGap / L.totNet, 2) + '</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +

    /* 5. Allocation & Profit Donuts + ROI vs TWR Comparison */
    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>5️⃣ مقارنة المحفظتين: التوزيع، مساهمة الأرباح، والعائد الحقيقي (ROI% مقابل TWR%)</h3>' +
        '<small>يوضح لماذا لا يكفي الربح بالريال وحده للحكم على أداء المحفظة</small>' +
      '</div>' +
      svgDualDonuts(L) +
      '<div class="grid-2" style="margin-bottom:0">' +
        '<div style="background:var(--bg);padding:14px;border-radius:16px;border:1px solid var(--line)">' +
          '<div style="font-weight:800;font-size:14px;margin-bottom:8px">نسبة العائد الكلي على صافي الإيداعات (ROI %)</div>' +
          '<div style="margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;font-size:13px"><span>🎓 SCHOOL (<span class="n priv-num">+' + money(L.schProfit) + ' / ' + moneyInt(L.schNet) + '</span>)</span><b class="n pos">' + signPct(E.returns.roiSch) + '</b></div>' +
            '<div class="prog-track"><div class="prog-fill" style="width:' + Math.min(100, Math.max(0, E.returns.roiSch * 250)).toFixed(1) + '%"></div></div>' +
          '</div>' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;font-size:13px"><span>🚗 SMART (<span class="n priv-num">+' + money(L.smtProfit) + ' / ' + moneyInt(L.smtNet) + '</span>)</span><b class="n gold-txt">' + signPct(E.returns.roiSmt) + '</b></div>' +
            '<div class="prog-track"><div class="prog-fill gold" style="width:' + Math.min(100, Math.max(0, E.returns.roiSmt * 250)).toFixed(1) + '%"></div></div>' +
          '</div>' +
        '</div>' +
        '<div style="background:var(--bg);padding:14px;border-radius:16px;border:1px solid var(--line)">' +
          '<div style="font-weight:800;font-size:14px;margin-bottom:8px">العائد الموزون زمنياً منذ بداية السجل 3 سبتمبر (TWR %)</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)"><span>🎓 أداء سوق محفظة SCHOOL منذ 2026-09-03</span><b class="n '+(E.returns.twrSch>=0?'pos':'neg')+'">' + signPct(E.returns.twrSch) + '</b></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)"><span>🚗 أداء سوق محفظة SMART منذ 2026-09-03</span><b class="n '+(E.returns.twrSmt>=0?'pos':'neg')+'">' + signPct(E.returns.twrSmt) + '</b></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0"><span>📊 إجمالي المحفظتين الموزون زمنياً (TWR)</span><b class="n '+(E.returns.twrTot>=0?'pos':'neg')+'">' + signPct(E.returns.twrTot) + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    /* 6. Goal Projection Chart */
    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>6️⃣ مسار النمو المستقبلي نحو الأهداف (<span class="n priv-num">' + moneyInt((E.goalSCHOOL.targetAmount||0) + (E.goalSMART.targetAmount||0)) + '</span> ر.س مجموع الهدفين)</h3>' +
        '<span class="pill ok">قارن الادخار الصرف مع أثر العائد التراكمي</span>' +
      '</div>' +
      svgGoalProjectionChart(E.goalSCHOOL, E.goalSMART, UI.expectedAnnualReturn) +
    '</div>';

  el.innerHTML = html;
  $('chartScopeSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    UI.chartFilter = b.dataset.s;
    renderChartsView(E);
  };
}

/* TAB 3: JOURNEY LOG & RAW SNAPSHOTS (سجل الرحلة واللقطات) */
function renderJourneyView(E){
  var el = $('view-journey');
  var jf = UI.journeyFilter;

  var rowsHtml = E.dailyJourney.map(function(d){
    if(jf === 'SCHOOL'){
      return '<tr>' +
        '<td class="n"><b>' + d.dayRank + '</b></td>' +
        '<td class="n">' + d.date + ' <small style="color:var(--muted)">(' + dmyFull(d.date) + ')</small></td>' +
        '<td class="n priv-num"><b>' + money(d.schoolVal) + '</b></td>' +
        '<td class="n priv-num">' + money(d.schNet) + '</td>' +
        '<td class="n pos priv-num"><b>' + money(d.schProfit) + '</b></td>' +
        '<td class="n priv-num">' + (d.schDVal === null ? '—' : signMoney(d.schDVal)) + '</td>' +
        '<td class="n priv-num">' + (d.schDNet === null ? '—' : signMoney(d.schDNet)) + '</td>' +
        '<td class="n priv-num ' + (d.schDProfit===null?'':(d.schDProfit>=0?'pos':'neg')) + '"><b>' + (d.schDProfit === null ? '—' : signMoney(d.schDProfit)) + '</b></td>' +
        '<td class="n ' + (d.rSch>=0?'pos':'neg') + '">' + (d.schDProfit === null ? '—' : signPct(d.rSch)) + '</td>' +
        '<td class="n neg priv-num">' + money(d.schFeeGap) + '</td>' +
      '</tr>';
    }
    if(jf === 'SMART'){
      return '<tr>' +
        '<td class="n"><b>' + d.dayRank + '</b></td>' +
        '<td class="n">' + d.date + ' <small style="color:var(--muted)">(' + dmyFull(d.date) + ')</small></td>' +
        '<td class="n priv-num"><b>' + money(d.smartVal) + '</b></td>' +
        '<td class="n priv-num">' + money(d.smtNet) + '</td>' +
        '<td class="n pos priv-num"><b>' + money(d.smtProfit) + '</b></td>' +
        '<td class="n priv-num">' + (d.smtDVal === null ? '—' : signMoney(d.smtDVal)) + '</td>' +
        '<td class="n priv-num">' + (d.smtDNet === null ? '—' : signMoney(d.smtDNet)) + '</td>' +
        '<td class="n priv-num ' + (d.smtDProfit===null?'':(d.smtDProfit>=0?'pos':'neg')) + '"><b>' + (d.smtDProfit === null ? '—' : signMoney(d.smtDProfit)) + '</b></td>' +
        '<td class="n ' + (d.rSmt>=0?'pos':'neg') + '">' + (d.smtDProfit === null ? '—' : signPct(d.rSmt)) + '</td>' +
        '<td class="n neg priv-num">' + money(d.smtFeeGap) + '</td>' +
      '</tr>';
    }
    return '<tr>' +
      '<td class="n"><b>' + d.dayRank + '</b></td>' +
      '<td class="n">' + d.date + '</td>' +
      '<td class="n priv-num">' + money(d.schoolVal) + '</td>' +
      '<td class="n priv-num">' + money(d.smartVal) + '</td>' +
      '<td class="n priv-num"><b>' + money(d.totVal) + '</b></td>' +
      '<td class="n priv-num">' + money(d.totNet) + '</td>' +
      '<td class="n pos priv-num"><b>' + money(d.totProfit) + '</b></td>' +
      '<td class="n priv-num">' + (d.dVal === null ? '—' : signMoney(d.dVal)) + '</td>' +
      '<td class="n priv-num">' + (d.dNet === null ? '—' : signMoney(d.dNet)) + '</td>' +
      '<td class="n priv-num ' + (d.dProfit===null?'':(d.dProfit>=0?'pos':'neg')) + '"><b>' + (d.dProfit === null ? '—' : signMoney(d.dProfit)) + '</b></td>' +
      '<td class="n">' + pctFmt(d.schShare, 2) + '</td>' +
      '<td class="n">' + pctFmt(d.smtShare, 2) + '</td>' +
    '</tr>';
  }).join('');

  var thHtml = jf === 'ALL'
    ? '<tr><th>ترتيب</th><th>التاريخ</th><th>SCHOOL</th><th>SMART</th><th>إجمالي القيمة</th><th>صافي الإيداعات</th><th>الربح المحسوب</th><th>تغير القيمة</th><th>صافي الحركات</th><th>تغير الربح الصافي</th><th>حصة SCHOOL</th><th>حصة SMART</th></tr>'
    : '<tr><th>ترتيب</th><th>التاريخ</th><th>قيمة ' + jf + '</th><th>صافي إيداعات ' + jf + '</th><th>ربح ' + jf + ' المحسوب</th><th>تغير القيمة</th><th>صافي الحركات</th><th>تغير الربح الصافي</th><th>عائد الفترة %</th><th>الرسوم/الفجوة</th></tr>';

  var rawSnapsRows = E.rawSnaps.map(function(s){
    var feeChangeBadge = s.seq === 1
      ? '<span class="pill muted">نقطة الأساس</span>'
      : (Math.abs(s.dFeeGap) > 0.005
          ? '<span class="pill bad n">' + signMoney(s.dFeeGap) + ' ر.س</span>'
          : '<span class="pill ok">0.00</span>');
    return '<tr>' +
      '<td class="n"><b>#' + s.seq + '</b></td>' +
      '<td class="n">' + s.date + '</td>' +
      '<td class="n priv-num">' + money(s.schoolVal) + '</td>' +
      '<td class="n priv-num">' + money(s.schoolInv) + '</td>' +
      '<td class="n priv-num">' + money(s.smartVal) + '</td>' +
      '<td class="n priv-num">' + money(s.smartInv) + '</td>' +
      '<td class="n priv-num"><b>' + money(s.totVal) + '</b></td>' +
      '<td class="n pos priv-num">+' + money(s.totProfit) + '</td>' +
      '<td class="n neg priv-num">' + money(s.totFeeGap) + '</td>' +
      '<td>' + feeChangeBadge + '</td>' +
      '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">' + esc(s.note || '—') + '</td>' +
      '<td><button class="btn ghost btn-sm snap-edit-btn" data-id="' + esc(s.id) + '">تعديل</button></td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<div class="sec-head">' +
      '<div>' +
        '<h2>📈 سجل الرحلة اليومي (مطابق لورقة «سجل الرحلة» + تفصيل كل محفظة)</h2>' +
        '<small>يعتمد آخر لقطة لكل يوم • تغير الربح = تغير القيمة − صافي الحركات</small>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<div class="seg-bar" id="journeyScopeSeg">' +
          '<button data-jf="ALL" class="'+(jf==='ALL'?'on':'')+'">الإجمالي (المطابق للإكسل)</button>' +
          '<button data-jf="SCHOOL" class="'+(jf==='SCHOOL'?'on':'')+'">تفصيل SCHOOL 🎓</button>' +
          '<button data-jf="SMART" class="'+(jf==='SMART'?'on':'')+'">تفصيل SMART 🚗</button>' +
        '</div>' +
        '<button class="btn btn-sm" id="jAddSnapBtn">📸 + لقطة جديدة</button>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl"><thead>' + thHtml + '</thead><tbody>' +
          (rowsHtml || '<tr><td colspan="12" style="text-align:center;padding:20px">لا توجد لقطات مسجلة</td></tr>') +
        '</tbody></table>' +
      '</div>' +
      '<div class="callout muted">' +
        'تغير الربح = تغير القيمة − صافي الحركات بين اليومين. الأيام المتكررة (مثل <span class="n">2026-09-03</span>) تُجمع في سجل الرحلة باعتماد آخر لقطة لذلك اليوم، بينما يحتفظ جدول اللقطات الخام أدناه بجميع اللقطات.' +
      '</div>' +
    '</div>' +

    '<div class="sec-head">' +
      '<div>' +
        '<h2>📸 سجل اللقطات الخام (ورقة «3 لقطة الشهر» + تتبع تغير المستثمر الظاهر والرسوم)</h2>' +
        '<small>جميع اللقطات المسجلة (' + E.rawSnaps.length + ' لقطات) بما فيها اللقطات المتعددة في نفس اليوم</small>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl">' +
          '<thead><tr><th>#</th><th>تاريخ اللقطة</th><th>قيمة SCHOOL</th><th>المستثمر الظاهر SCHOOL</th><th>قيمة SMART</th><th>المستثمر الظاهر SMART</th><th>إجمالي القيمة</th><th>الربح الفعلي</th><th>إجمالي الفجوة/الرسوم</th><th>تغير الرسوم باللقطة</th><th>ملاحظات</th><th>إجراء</th></tr></thead>' +
          '<tbody>' + rawSnapsRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="callout gold" style="font-size:12.5px">' +
        '🔎 <b>تتبع الرسوم وفوارق التكلفة آلياً:</b> يقارن العمود العاشر أعلاه بين صافي إيداعاتك الفعلية و«المستثمر الظاهر» في دراية عند كل لقطة ليكشف لك تلقائياً أي رسوم إيداع أو رسوم إدارة استُقطعت في تلك الفترة بالهللة.' +
      '</div>' +
    '</div>';

  $('journeyScopeSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    UI.journeyFilter = b.dataset.jf;
    renderJourneyView(E);
  };
  $('jAddSnapBtn').onclick = function(){ openSnapModal(null); };
  [].forEach.call(el.querySelectorAll('.snap-edit-btn'), function(btn){
    btn.onclick = function(){
      var s = S.snapshots.find(function(x){ return x.id === btn.dataset.id; });
      if(s) openSnapModal(s);
    };
  });
}

/* TAB 4: MONTHLY COMMITMENT & TRANSACTIONS (الالتزام الشهري والإيداعات والسحوبات) */
function renderCommitView(E){
  var el = $('view-commit');
  var yr = UI.commitYear || 2026;

  var monthsData = [];
  for(var m=1; m<=12; m++){
    monthsData.push(E.monthlyStatsFor(yr, m));
  }

  var mRows = monthsData.map(function(ms){
    var isBefore = ms.status === 'قبل السجل';
    var isFuture = ms.status === 'قادم';
    var hideVals = isBefore || isFuture;
    var badgeCls = ms.status === 'مكتمل' ? 'ok' : (ms.status === 'جارٍ' ? 'warn' : (ms.status === 'غير مكتمل' ? 'bad' : 'muted'));
    return '<tr>' +
      '<td><b>' + ms.monthName + '</b> <small class="n" style="color:var(--muted)">(' + ms.year + '-' + pad2(ms.month) + ')</small></td>' +
      '<td class="n priv-num">' + (isBefore ? '—' : moneyInt(ms.planSch)) + '</td>' +
      '<td class="n priv-num">' + (hideVals ? '—' : moneyInt(ms.schMonthly)) + '</td>' +
      '<td class="n">' + (hideVals ? '—' : pctFmt(ms.schPct, 0)) + '</td>' +
      '<td class="n priv-num">' + (isBefore ? '—' : moneyInt(ms.planSmt)) + '</td>' +
      '<td class="n priv-num">' + (hideVals ? '—' : moneyInt(ms.smtMonthly)) + '</td>' +
      '<td class="n">' + (hideVals ? '—' : pctFmt(ms.smtPct, 0)) + '</td>' +
      '<td class="n gold-txt priv-num">' + (hideVals ? '—' : (ms.extraDep > 0 ? '+' + moneyInt(ms.extraDep) : '0')) + '</td>' +
      '<td class="n neg priv-num">' + (hideVals ? '—' : (ms.nonHistWth > 0 ? '-' + moneyInt(ms.nonHistWth) : '0')) + '</td>' +
      '<td class="n pos priv-num"><b>' + (hideVals ? '—' : moneyInt(ms.totMonthly)) + '</b></td>' +
      '<td class="n priv-num">' + (hideVals ? '—' : moneyInt(ms.remTot)) + '</td>' +
      '<td><span class="pill ' + badgeCls + '">' + ms.status + (ms.status==='مكتمل'?' ✓':'') + '</span></td>' +
    '</tr>';
  }).join('');

  // Filter transactions
  var filteredTxs = E.txs.filter(function(t){
    if(UI.txFilterPort !== 'ALL' && t.portfolio !== UI.txFilterPort) return false;
    if(UI.txFilterCat !== 'ALL' && t.category !== UI.txFilterCat) return false;
    if(UI.txSearch.trim()){
      var q = UI.txSearch.trim().toLowerCase();
      var hay = (t.date + ' ' + t.portfolio + ' ' + t.type + ' ' + t.category + ' ' + (t.note || '') + ' ' + t.amount).toLowerCase();
      if(hay.indexOf(q) < 0) return false;
    }
    return true;
  });

  var txRows = filteredTxs.map(function(t, idx){
    var isHist = t.category === 'تاريخي';
    var catPill = t.category === 'شهري' ? 'ok' : (t.category === 'إضافي' ? 'warn' : 'blue');
    var typePill = t.type === 'إيداع' ? 'ok' : 'bad';
    return '<tr style="' + (isHist ? 'background:rgba(14,138,95,0.04)' : '') + '">' +
      '<td class="n">' + (idx + 1) + '</td>' +
      '<td class="n">' + t.date + '</td>' +
      '<td><b>' + (t.portfolio==='SCHOOL'?'🎓 SCHOOL':'🚗 SMART') + '</b></td>' +
      '<td><span class="pill ' + typePill + '">' + t.type + '</span></td>' +
      '<td class="n priv-num ' + (t.type==='إيداع'?'pos':'neg') + '"><b>' + (t.type==='إيداع'?'+':'-') + money(t.amount) + '</b></td>' +
      '<td><span class="pill ' + catPill + '">' + esc(t.category) + '</span></td>' +
      '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis">' + esc(t.note || '—') + '</td>' +
      '<td><button class="btn ghost btn-sm tx-edit-btn" data-id="' + esc(t.id) + '">تعديل</button></td>' +
    '</tr>';
  }).join('');

  var totPlanMonth = (Number(S.portfolios.SCHOOL.monthlyPlan)||4000) + (Number(S.portfolios.SMART.monthlyPlan)||2500);

  el.innerHTML =
    '<div class="sec-head">' +
      '<div>' +
        '<h2>🗓️ إيقاع الادخار والالتزام الشهري (ورقة «الالتزام الشهري»)</h2>' +
        '<small>الخطة الحالية: <b class="n">' + moneyInt(totPlanMonth) + '</b> ريال شهرياً (SCHOOL: <span class="n">' + moneyInt(S.portfolios.SCHOOL.monthlyPlan) + '</span> + SMART: <span class="n">' + moneyInt(S.portfolios.SMART.monthlyPlan) + '</span>)</small>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<div class="seg-bar" id="commitYearSeg">' +
          [2026, 2027, 2028].map(function(y){
            return '<button data-y="'+y+'" class="'+(yr===y?'on':'')+'"><span class="n">'+y+'</span></button>';
          }).join('') +
        '</div>' +
        '<button class="btn gold btn-sm" id="cSalaryBtn">⚡ تسجيل إيداع الراتب الشهري (' + moneyInt(S.portfolios.SCHOOL.monthlyPlan) + ' + ' + moneyInt(S.portfolios.SMART.monthlyPlan) + ')</button>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl">' +
          '<thead><tr><th>الشهر</th><th>خطة SCHOOL</th><th>شهري SCHOOL</th><th>الإنجاز</th><th>خطة SMART</th><th>شهري SMART</th><th>الإنجاز</th><th>إضافي</th><th>السحوبات</th><th>الإيداع الشهري</th><th>المتبقي</th><th>الحالة</th></tr></thead>' +
          '<tbody>' + mRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="callout muted" style="font-size:12.5px">' +
        'يبدأ القياس في سبتمبر 2026. الإجماليات التاريخية مستبعدة من الالتزام الشهري، وأي إيداع مصنّف «إضافي» يظهر في عمود الإضافي المستقل دون الإخلال بحساب التزامك الشهري.' +
      '</div>' +
    '</div>' +

    /* Transactions Log (2 الإيداعات والسحوبات) */
    '<div class="sec-head">' +
      '<div>' +
        '<h2>💸 دفتر الإيداعات والسحوبات (ورقة «2 الإيداعات والسحوبات»)</h2>' +
        '<small>إجمالي الحركات المسجلة: <b class="n">' + E.txs.length + '</b> حركات</small>' +
      '</div>' +
      '<button class="btn btn-sm" id="cAddTxBtn">➕ إضافة حركة جديدة</button>' +
    '</div>' +

    '<div class="card">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center;justify-content:space-between">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<div class="seg-bar" id="txPortSeg">' +
            '<button data-p="ALL" class="'+(UI.txFilterPort==='ALL'?'on':'')+'">كل المحافظ</button>' +
            '<button data-p="SCHOOL" class="'+(UI.txFilterPort==='SCHOOL'?'on':'')+'">SCHOOL</button>' +
            '<button data-p="SMART" class="'+(UI.txFilterPort==='SMART'?'on':'')+'">SMART</button>' +
          '</div>' +
          '<div class="seg-bar" id="txCatSeg">' +
            '<button data-c="ALL" class="'+(UI.txFilterCat==='ALL'?'on':'')+'">كل التصنيفات</button>' +
            '<button data-c="شهري" class="'+(UI.txFilterCat==='شهري'?'on':'')+'">شهري</button>' +
            '<button data-c="إضافي" class="'+(UI.txFilterCat==='إضافي'?'on':'')+'">إضافي</button>' +
            '<button data-c="تاريخي" class="'+(UI.txFilterCat==='تاريخي'?'on':'')+'">تاريخي</button>' +
          '</div>' +
        '</div>' +
        '<input type="search" id="txSearchIn" value="'+esc(UI.txSearch)+'" placeholder="🔎 بحث في الملاحظات أو المبالغ..." style="background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:7px 12px;font-size:13.5px;min-width:220px;outline:none">' +
      '</div>' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl">' +
          '<thead><tr><th>#</th><th>التاريخ</th><th>المحفظة</th><th>نوع الحركة</th><th>المبلغ (ر.س)</th><th>تصنيف الإيداع</th><th>ملاحظات</th><th>إجراء</th></tr></thead>' +
          '<tbody>' + (txRows || '<tr><td colspan="8" style="text-align:center;padding:20px">لا توجد حركات مطابقة</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

  $('commitYearSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    UI.commitYear = parseInt(b.dataset.y, 10);
    renderCommitView(E);
  };
  $('cSalaryBtn').onclick = function(){ quickRecordMonthlySalary(); };
  $('cAddTxBtn').onclick = function(){ openTxModal(null); };
  $('txPortSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    UI.txFilterPort = b.dataset.p;
    renderCommitView(E);
  };
  $('txCatSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    UI.txFilterCat = b.dataset.c;
    renderCommitView(E);
  };
  $('txSearchIn').oninput = function(){
    UI.txSearch = this.value;
    renderCommitView(E);
  };
  [].forEach.call(el.querySelectorAll('.tx-edit-btn'), function(btn){
    btn.onclick = function(){
      var t = S.transactions.find(function(x){ return x.id === btn.dataset.id; });
      if(t) openTxModal(t);
    };
  });
}

/* TAB 5: GOALS & MILESTONES (أهدافي ومحطات الرحلة) */
function renderGoalsView(E){
  var el = $('view-goals');
  var gS = E.goalSCHOOL, gM = E.goalSMART;

  function renderGoalColumn(g, badgeIco){
    var barCls = g.code === 'SMART' ? 'gold' : '';
    return '<div class="card" style="margin-bottom:0;border-top:4px solid ' + (g.code==='SCHOOL'?'var(--acc)':'var(--gold)') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<h3 style="margin:0;font-size:17px">' + badgeIco + ' محفظة ' + g.code + '</h3>' +
        '<span class="pill ' + (g.code==='SCHOOL'?'ok':'warn') + '">الإنجاز: <span class="n">' + pctFmt(g.pct, 2) + '</span></span>' +
      '</div>' +
      '<div class="prog-track" style="height:12px"><div class="prog-fill ' + barCls + '" style="width:' + Math.min(100, g.pct * 100).toFixed(2) + '%"></div></div>' +

      '<div class="stat-rows" style="margin-top:12px">' +
        '<div class="stat-row"><span>اسم الهدف (خلية ذهبية)</span><input class="golden-input goal-in" data-port="'+g.code+'" data-field="goalName" value="'+esc(g.goalName)+'" style="text-align:right"></div>' +
        '<div class="stat-row"><span>المبلغ المستهدف (ريال)</span><input class="golden-input goal-in n" data-port="'+g.code+'" data-field="targetAmount" value="'+g.targetAmount+'" dir="ltr"></div>' +
        '<div class="stat-row"><span>تاريخ الهدف المستهدف</span><input type="date" class="golden-input goal-in n" data-port="'+g.code+'" data-field="targetDate" value="'+esc(g.targetDate)+'" dir="ltr"></div>' +
        '<div class="stat-row"><span>الخطة الشهرية المعتمدة (ريال)</span><input class="golden-input goal-in n" data-port="'+g.code+'" data-field="monthlyPlan" value="'+g.monthlyPlan+'" dir="ltr"></div>' +
        '<div class="stat-row" style="padding-top:6px;border-top:1px solid var(--line)"><span>القيمة الحالية</span><b class="n priv-num">' + money(g.curVal) + ' ر.س</b></div>' +
        '<div class="stat-row"><span>المتبقي للوصول للهدف</span><b class="n priv-num">' + money(g.rem) + ' ر.س</b></div>' +
        '<div class="stat-row"><span>نسبة الإنجاز الحالية</span><b class="n pos">' + pctFmt(g.pct, 2) + '</b></div>' +
      '</div>' +

      '<div style="background:var(--bg);border-radius:14px;padding:12px;margin-top:12px;border:1px solid var(--line)">' +
        '<div style="font-weight:800;font-size:13px;color:var(--muted);margin-bottom:6px">① تقدير الإكسل (بالادخار الشهري فقط — بدون افتراض عائد 0%)</div>' +
        '<div class="stat-rows" style="border:none;padding:0">' +
          '<div class="stat-row"><span>أشهر تقريبية بالادخار فقط</span><b class="n">' + (g.monthsSaveOnly !== null ? g.monthsSaveOnly + ' شهر' : '—') + '</b></div>' +
          '<div class="stat-row"><span>تاريخ الوصول بالادخار فقط</span><b class="n">' + (g.arrivalSaveOnly || '—') + '</b></div>' +
          '<div class="stat-row"><span>الأشهر المتاحة حتى موعدك</span><b class="n">' + (g.availMonths !== null ? g.availMonths + ' شهر' : '—') + '</b></div>' +
          '<div class="stat-row"><span>المطلوب شهرياً حتى موعدك</span><b class="n priv-num">' + (g.reqMonthlySaveOnly !== null ? money(g.reqMonthlySaveOnly) + ' ر.س' : '—') + '</b></div>' +
          '<div class="stat-row"><span>الزيادة عن خطتك الشهرية</span><b class="n neg priv-num">' + (g.extraNeededSaveOnly !== null ? '+' + money(g.extraNeededSaveOnly) + ' ر.س' : '—') + '</b></div>' +
        '</div>' +
      '</div>' +

      '<div style="background:var(--acc-soft);border-radius:14px;padding:12px;margin-top:10px;border:1px solid rgba(14,138,95,0.25)">' +
        '<div style="font-weight:800;font-size:13px;color:var(--acc);margin-bottom:6px">② مع عائد سنوي مركب متوقع (<span class="n">' + UI.expectedAnnualReturn + '%</span> سنوياً)</div>' +
        '<div class="stat-rows" style="border:none;padding:0">' +
          '<div class="stat-row"><span>الأشهر المتوقعة للوصول</span><b class="n pos">' + (g.monthsWithReturn !== null ? g.monthsWithReturn + ' شهر (يختصر ' + Math.max(0, (g.monthsSaveOnly||0) - g.monthsWithReturn) + ' شهر)' : '—') + '</b></div>' +
          '<div class="stat-row"><span>تاريخ الوصول المتوقع مع العائد</span><b class="n pos">' + (g.arrivalWithReturn || '—') + '</b></div>' +
          '<div class="stat-row"><span>المطلوب شهرياً للوصول في موعدك</span><b class="n priv-num">' + (g.reqMonthlyWithReturn !== null ? money(g.reqMonthlyWithReturn) + ' ر.س' : '—') + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Build Milestone Ladder steps
  var step = E.milestone.step;
  var maxLadder = Math.max(E.milestone.next + step * 3, step * 10);
  var ladderHtml = '';
  for(var mVal = step; mVal <= maxLadder; mVal += step){
    var isDone = mVal <= E.milestone.passed;
    var isNext = mVal === E.milestone.next;
    ladderHtml += '<div class="ms-step ' + (isDone ? 'done' : (isNext ? 'next' : '')) + '">' +
      '<div class="n priv-num" style="font-size:14.5px">' + moneyInt(mVal) + '</div>' +
      '<small style="display:block;margin-top:2px">' + (isDone ? 'تم التجاوز ✓' : (isNext ? 'المحطة القادمة 🎯' : 'محطة قادمة')) + '</small>' +
    '</div>';
  }

  el.innerHTML =
    '<div class="sec-head">' +
      '<div>' +
        '<h2>🎯 أهدافي ومحطات الرحلة (ورقة «أهدافي» + محاكي العائد المركب)</h2>' +
        '<small>عدّل أي خلية ذهبية مباشرة وسيُحفظ التعديل وتُحدّث الحسابات فوراً</small>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;background:var(--card);padding:6px 14px;border-radius:14px;border:1px solid var(--line)">' +
        '<label style="font-size:12.5px;font-weight:700">محاكي العائد السنوي:</label>' +
        '<input type="range" id="retSlider" min="0" max="15" step="0.5" value="' + UI.expectedAnnualReturn + '" style="width:110px">' +
        '<b class="n pos" style="min-width:44px">' + UI.expectedAnnualReturn + '%</b>' +
      '</div>' +
    '</div>' +

    '<div class="grid-2">' +
      renderGoalColumn(gS, '🎓') +
      renderGoalColumn(gM, '🚗') +
    '</div>' +

    '<div class="card">' +
      '<div class="card-title">' +
        '<h3>🏁 سُلّم محطات الرحلة المالية</h3>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:13px;color:var(--muted)">المسافة بين المحطات (ريال):</span>' +
          '<input class="golden-input n" id="msStepIn" value="' + E.milestone.step + '" dir="ltr" style="width:110px">' +
        '</div>' +
      '</div>' +
      '<div class="grid-3" style="margin-bottom:10px">' +
        '<div style="background:var(--bg);padding:12px;border-radius:14px"><small style="color:var(--muted);display:block">آخر محطة تجاوزتها</small><b class="n pos priv-num" style="font-size:19px">' + moneyInt(E.milestone.passed) + ' ر.س ✓</b></div>' +
        '<div style="background:var(--gold-soft);padding:12px;border-radius:14px;border:1px solid var(--gold-border)"><small style="color:var(--muted);display:block">المحطة القادمة</small><b class="n gold-txt priv-num" style="font-size:19px">' + moneyInt(E.milestone.next) + ' ر.س 🎯</b></div>' +
        '<div style="background:var(--bg);padding:12px;border-radius:14px"><small style="color:var(--muted);display:block">المتبقي للمحطة القادمة (<span class="n">' + pctFmt(E.milestone.prog, 2) + '</span> منجز)</small><b class="n priv-num" style="font-size:19px">' + money(E.milestone.rem) + ' ر.س</b></div>' +
      '</div>' +
      '<div class="prog-track" style="height:14px"><div class="prog-fill gold" style="width:' + Math.min(100, Math.max(0, E.milestone.prog * 100)).toFixed(2) + '%"></div></div>' +
      '<div class="ms-grid">' + ladderHtml + '</div>' +
    '</div>';

  $('retSlider').oninput = function(){
    UI.expectedAnnualReturn = parseFloat(this.value) || 0;
    renderGoalsView(computeEngine());
  };
  $('msStepIn').onchange = function(){
    var v = parseNum(this.value);
    if(v >= 1000){
      S.milestoneStep = Math.round(v);
      save();
      renderAll();
      toast('تم تحديث مسافة المحطات ✓');
    }
  };
  [].forEach.call(el.querySelectorAll('.goal-in'), function(inp){
    inp.onchange = function(){
      var port = inp.dataset.port, field = inp.dataset.field;
      if(!S.portfolios[port]) return;
      if(field === 'targetAmount' || field === 'monthlyPlan'){
        var num = parseNum(inp.value);
        if(num > 0) S.portfolios[port][field] = round2(num);
      } else {
        S.portfolios[port][field] = inp.value.trim();
      }
      save();
      renderAll();
      toast('تم تحديث إعدادات هدف ' + port + ' ✓');
    };
  });
}

/* TAB 6: GUIDE, ORIGINAL ENGINE VIEW & SECURITY (الدليل والمحرك والأمان) */
function renderGuideView(E){
  var el = $('view-guide');
  var L = E.latest;

  el.innerHTML =
    /* Security & Privacy Guarantee Card */
    '<div class="card" style="border:2px solid var(--acc);background:linear-gradient(180deg, var(--acc-soft) 0%, var(--card) 55%)">' +
      '<div class="card-title">' +
        '<h3 style="font-size:17px">🛡️ ضمان الأمان والخصوصية القصوى (100% محلي ومعزول عن الإنترنت)</h3>' +
        '<span class="pill ok">CSP: connect-src \'none\' مُفعّل</span>' +
      '</div>' +
      '<div style="font-size:13.5px;line-height:1.8">' +
        '• <b>لا يرسل أي حرف للإنترنت:</b> هذا التطبيق محمي بسياسة أمان متصفح صارمة (<code>connect-src \'none\'</code>) تمنع تقنياً أي اتصال بأي خادم خارجي.<br>' +
        '• <b>أين تُحفظ بياناتك؟</b> تُحفظ حصرياً داخل ذاكرة جهازك المحلية (<code>localStorage</code>) وفي ملفك الشخصي.<br>' +
        '• <b>التشفير العسكري الاختياري (AES-256-GCM):</b> يمكنك تفعيل كلمة مرور / رمز قفل من الزر أدناه لتشفير جميع أرقامك بمفتاح مشتق عبر <code>PBKDF2-SHA256</code> (120,000 دورة) بحيث يستحيل قراءتها حتى لو فُتح المتصفح بدون رمزك.' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
        '<button class="btn btn-sm" id="gOpenSecBtn">' + (sessionPassword ? '🔒 إدارة/تغيير كلمة المرور المشفرة' : '🔐 تفعيل قفل التشفير بكلمة مرور (AES-256)') + '</button>' +
        '<button class="btn ghost btn-sm" id="gExportXlsxBtn">📊 تصدير ملف إكسل محدث (.xlsx)</button>' +
        '<button class="btn ghost btn-sm" id="gImportXlsxBtn">📂 استيراد من ملف إكسل (.xlsx)</button>' +
        '<button class="btn ghost btn-sm" id="gExportJsonBtn">⬇️ حفظ نسخة احتياطية (.json)</button>' +
        '<button class="btn ghost btn-sm" id="gImportJsonBtn">⬆️ استرجاع نسخة (.json)</button>' +
   '<button class="btn gold btn-sm" id="gCopyCodeBtn">📋 نسخ كود البيانات (للنقل السريع)</button>' +
   '<button class="btn ghost btn-sm" id="gPasteCodeBtn">📋 لصق كود البيانات</button>' +
      '</div>' +
    '</div>' +

    /* Sheet 6: 1 الرئيسية (Original Engine Reconciliation Table) */
    (L ? (
    '<div class="sec-head">' +
      '<h2>⚙️ محرك المطابقة المحاسبي الكامل (ورقة «1 الرئيسية»)</h2>' +
      '<small>مطابقة 100% لجميع متغيرات ومعادلات ملف الإكسل حتى الهللة</small>' +
    '</div>' +
    '<div class="card">' +
      '<div class="tbl-wrap">' +
        '<table class="data-tbl">' +
          '<thead><tr><th>المحفظة</th><th>الخطة الشهرية</th><th>الإيداع الدوري هذا الشهر</th><th>إيداعات حتى اللقطة</th><th>سحوبات حتى اللقطة</th><th>صافي الإيداعات</th><th>المستثمر الظاهر بدراية</th><th>القيمة الحالية</th><th>صافي الربح المحسوب</th><th>ربح دراية الظاهر</th><th>الفرق عن دراية (الرسوم)</th></tr></thead>' +
          '<tbody>' +
            '<tr><td><b>SCHOOL</b></td><td class="n priv-num">' + moneyInt(S.portfolios.SCHOOL.monthlyPlan) + '</td><td class="n priv-num">' + moneyInt(E.curMonthRhythm.schMonthly) + '</td><td class="n priv-num">' + money(L.schDep) + '</td><td class="n priv-num">' + money(L.schWth) + '</td><td class="n priv-num"><b>' + money(L.schNet) + '</b></td><td class="n priv-num">' + money(L.schoolInv) + '</td><td class="n priv-num"><b>' + money(L.schoolVal) + '</b></td><td class="n pos priv-num"><b>' + money(L.schProfit) + '</b></td><td class="n gold-txt priv-num">' + money(L.schAppProfit) + '</td><td class="n neg priv-num">' + money(L.schFeeGap) + '</td></tr>' +
            '<tr><td><b>SMART</b></td><td class="n priv-num">' + moneyInt(S.portfolios.SMART.monthlyPlan) + '</td><td class="n priv-num">' + moneyInt(E.curMonthRhythm.smtMonthly) + '</td><td class="n priv-num">' + money(L.smtDep) + '</td><td class="n priv-num">' + money(L.smtWth) + '</td><td class="n priv-num"><b>' + money(L.smtNet) + '</b></td><td class="n priv-num">' + money(L.smartInv) + '</td><td class="n priv-num"><b>' + money(L.smartVal) + '</b></td><td class="n pos priv-num"><b>' + money(L.smtProfit) + '</b></td><td class="n gold-txt priv-num">' + money(L.smtAppProfit) + '</td><td class="n neg priv-num">' + money(L.smtFeeGap) + '</td></tr>' +
            '<tr class="tot-row"><td>إجمالي المحفظتين</td><td class="n priv-num">' + moneyInt(E.curMonthRhythm.totPlan) + '</td><td class="n priv-num">' + moneyInt(E.curMonthRhythm.totMonthly) + '</td><td class="n priv-num">' + money(L.totDep) + '</td><td class="n priv-num">' + money(L.totWth) + '</td><td class="n priv-num">' + money(L.totNet) + '</td><td class="n priv-num">' + money(L.totInv) + '</td><td class="n priv-num">' + money(L.totVal) + '</td><td class="n pos priv-num">' + money(L.totProfit) + '</td><td class="n gold-txt priv-num">' + money(L.totAppProfit) + '</td><td class="n neg priv-num">' + money(L.totFeeGap) + '</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="callout muted" style="font-size:12.5px">' +
        '<b>طريقة الحساب المعتمدة:</b> صافي الإيداعات = الإيداعات − السحوبات حتى تاريخ اللقطة. الربح الفعلي المحسوب = القيمة السوقية الحالية − صافي الإيداعات. ربح دراية الظاهر = القيمة الحالية − المبلغ المستثمر الظاهر في التطبيق. الفرق بين الرقمين = صافي الإيداعات − المستثمر الظاهر (قد ينتج عن رسوم إيداع/إدارة أو أرباح/خسائر محققة أو طريقة احتساب متوسط التكلفة في دراية).' +
      '</div>' +
    '</div>') : '') +

    /* Sheet 5: دليل الاستخدام */
    '<div class="sec-head">' +
      '<h2>📖 دليلك للرحلة المالية (ورقة «دليل الاستخدام»)</h2>' +
      '<small>خمس دقائق للتحديث الشهري</small>' +
    '</div>' +
    '<div class="grid-3">' +
      '<div class="card" style="margin-bottom:0"><b>01 • سجّل حركة المال</b><p style="font-size:13px;color:var(--muted);margin:6px 0 0">بعد نزول الراتب اضغط زر «إيداع الراتب الشهري بضغطة» لتسجيل إيداعَي الخطة الشهرية لـ SCHOOL و SMART تلقائياً، أو أضف أي حركة إضافية/سحب.</p></div>' +
      '<div class="card" style="margin-bottom:0"><b>02 • حدّث لقطة المحافظ</b><p style="font-size:13px;color:var(--muted);margin:6px 0 0">افتح تطبيق دراية وانسخ الأربعة أرقام (القيمة الحالية والمستثمر الظاهر لكل محفظة). عند تكرار اليوم يعتمد سجل الرحلة آخر لقطة لذلك اليوم.</p></div>' +
      '<div class="card" style="margin-bottom:0"><b>03 • استعرض الرسوم والأهداف</b><p style="font-size:13px;color:var(--muted);margin:6px 0 0">تابع تشارتات الأرباح والخسائر والرسوم المستنتجة، وعدّل أهدافك ومحطاتك في أي وقت مع حفظ احتياطي بصيغة Excel أو JSON.</p></div>' +
    '</div>';

  $('gOpenSecBtn').onclick = openSettingsModal;
  $('gExportXlsxBtn').onclick = exportExcelWorkbook;
  $('gImportXlsxBtn').onclick = function(){ $('xlsxFileInput').click(); };
  $('gExportJsonBtn').onclick = exportJsonBackup;
  $('gImportJsonBtn').onclick = function(){ $('jsonFileInput').click(); };
  $('gCopyCodeBtn').onclick = copyBackupCode;
  $('gPasteCodeBtn').onclick = openPasteModal;
}

/* ===== Modals, Actions, Import/Export & Initialization ===== */
var activeSheet = null;
function openSheet(id){
  if(activeSheet) activeSheet.classList.remove('open');
  activeSheet = $(id);
  $('scrim').style.display = 'block';
  activeSheet.scrollTop = 0;
  activeSheet.classList.add('open');
}
function closeSheet(){
  if(activeSheet) activeSheet.classList.remove('open');
  activeSheet = null;
  $('scrim').style.display = 'none';
}

function switchTab(tabName){
  UI.tab = tabName;
  [].forEach.call($('navTabs').querySelectorAll('.nav-tab'), function(b){
    b.classList.toggle('on', b.dataset.tab === tabName);
  });
  ['home','charts','journey','commit','goals','guide'].forEach(function(t){
    var pane = $('view-' + t);
    if(pane) pane.classList.toggle('on', t === tabName);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

var toastTimer = null;
function toast(msg, undoStateStr){
  var el = $('toast');
  clearTimeout(toastTimer);
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (undoStateStr ? ' <button id="undoActionBtn">تراجع ↩</button>' : '');
  el.classList.add('show');
  if(undoStateStr){
    $('undoActionBtn').onclick = function(){
      var prev = JSON.parse(undoStateStr);
      S.transactions = prev.transactions;
      S.snapshots = prev.snapshots;
      S.portfolios = prev.portfolios;
      save();
      el.classList.remove('show');
      renderAll();
    };
  }
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 5500);
}
function takeSnapshotForUndo(){
  return JSON.stringify({
    transactions: S.transactions,
    snapshots: S.snapshots,
    portfolios: S.portfolios
  });
}

/* One-tap Monthly Salary Deposit */
function quickRecordMonthlySalary(){
  var dt = todayISO();
  var pSch = Number(S.portfolios.SCHOOL.monthlyPlan) || 4000;
  var pSmt = Number(S.portfolios.SMART.monthlyPlan) || 2500;
  var ym = dt.slice(0, 7);
  var alreadyHas = S.transactions.some(function(t){
    return t.date.slice(0, 7) === ym && t.type === 'إيداع' && t.category === 'شهري';
  });
  var promptDate = prompt('تأكيد تاريخ تسجيل إيداع الراتب الشهري (' + moneyInt(pSch) + ' ر.س SCHOOL + ' + moneyInt(pSmt) + ' ر.س SMART):', alreadyHas ? edateISO(dt, 1).slice(0,8) + '27' : dt);
  if(!promptDate) return;
  promptDate = promptDate.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(promptDate)){
    toast('صيغة التاريخ يجب أن تكون YYYY-MM-DD');
    return;
  }
  var undo = takeSnapshotForUndo();
  S.transactions.push(
    {
      id: 'tx_' + Date.now() + '_smt',
      date: promptDate,
      portfolio: 'SMART',
      type: 'إيداع',
      amount: pSmt,
      category: 'شهري',
      note: ''
    },
    {
      id: 'tx_' + (Date.now() + 1) + '_sch',
      date: promptDate,
      portfolio: 'SCHOOL',
      type: 'إيداع',
      amount: pSch,
      category: 'شهري',
      note: ''
    }
  );
  save();
  renderAll();
  toast('تم تسجيل إيداع الراتب الشهري (' + moneyInt(pSch + pSmt) + ' ر.س) ✓', undo);
}

/* Open Add/Edit Transaction Modal */
function openTxModal(tx){
  var portSel = $('txPort');
  portSel.innerHTML = Object.keys(S.portfolios).map(function(k){
    return '<option value="' + esc(k) + '">' + esc(k) + ' — ' + esc(S.portfolios[k].goalName) + '</option>';
  }).join('');

  $('txEditId').value = tx ? tx.id : '';
  $('txSheetTitle').textContent = tx ? 'تعديل حركة مالية' : 'تسجيل حركة مالية جديدة';
  $('txDate').value = tx ? tx.date : todayISO();
  $('txPort').value = tx ? tx.portfolio : 'SCHOOL';
  $('txType').value = tx ? tx.type : 'إيداع';
  $('txCat').value = tx ? tx.category : 'شهري';
  $('txAmt').value = tx ? tx.amount : '';
  $('txNote').value = tx ? (tx.note || '') : '';
  $('txDelBtn').style.display = tx ? 'inline-flex' : 'none';
  $('txHint').style.display = (tx && tx.category === 'تاريخي') ? 'block' : 'none';
  if(tx && tx.category === 'تاريخي'){
    $('txHint').textContent = 'تنبيه: هذا السطر يمثل رصيداً تاريخياً تأسيسياً حتى 3 سبتمبر 2026.';
  }
  openSheet('txSheet');
}

function saveTxModal(){
  var id = $('txEditId').value;
  var dt = $('txDate').value || todayISO();
  var port = $('txPort').value || 'SCHOOL';
  var type = $('txType').value || 'إيداع';
  var cat = $('txCat').value || 'شهري';
  var amt = round2(parseNum($('txAmt').value));
  var note = $('txNote').value.trim();

  if(!(amt > 0)){
    $('txHint').style.display = 'block';
    $('txHint').textContent = 'الرجاء إدخال مبلغ موجب صحيح.';
    $('txAmt').focus();
    return;
  }
  var undo = takeSnapshotForUndo();
  if(id){
    var item = S.transactions.find(function(x){ return x.id === id; });
    if(item){
      item.date = dt; item.portfolio = port; item.type = type;
      item.category = cat; item.amount = amt; item.note = note;
    }
  } else {
    S.transactions.push({
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      date: dt,
      portfolio: port,
      type: type,
      amount: amt,
      category: cat,
      note: note
    });
  }
  save();
  closeSheet();
  renderAll();
  toast('تم حفظ الحركة المالية ✓', undo);
}

function deleteTxModal(){
  var id = $('txEditId').value;
  if(!id) return;
  var undo = takeSnapshotForUndo();
  S.transactions = S.transactions.filter(function(x){ return x.id !== id; });
  save();
  closeSheet();
  renderAll();
  toast('تم حذف الحركة المالية', undo);
}

/* Open Add/Edit Snapshot Modal with Live Preview */
function openSnapModal(snap){
  var E = computeEngine();
  var L = E.latest;
  $('snapEditId').value = snap ? snap.id : '';
  $('snapSheetTitle').textContent = snap ? 'تعديل لقطة المحافظ' : 'تسجيل لقطة جديدة من تطبيق دراية';
  $('snapDate').value = snap ? snap.date : todayISO();
  $('snapSchVal').value = snap ? snap.schoolVal : (L ? L.schoolVal : '');
  $('snapSchInv').value = snap ? snap.schoolInv : (L ? L.schoolInv : '');
  $('snapSmtVal').value = snap ? snap.smartVal : (L ? L.smartVal : '');
  $('snapSmtInv').value = snap ? snap.smartInv : (L ? L.smartInv : '');
  $('snapNote').value = snap ? (snap.note || '') : '';
  $('snapDelBtn').style.display = snap ? 'inline-flex' : 'none';
  updateSnapLivePreview();
  openSheet('snapSheet');
}

function updateSnapLivePreview(){
  var E = computeEngine();
  var dt = $('snapDate').value || todayISO();
  var sv = parseNum($('snapSchVal').value) || 0;
  var si = parseNum($('snapSchInv').value) || 0;
  var mv = parseNum($('snapSmtVal').value) || 0;
  var mi = parseNum($('snapSmtInv').value) || 0;

  var fSch = E.flowsUpTo(dt, 'SCHOOL');
  var fSmt = E.flowsUpTo(dt, 'SMART');
  var totVal = round2(sv + mv);
  var totNet = round2(fSch.net + fSmt.net);
  var actProf = round2(totVal - totNet);
  var appProf = round2((sv - si) + (mv - mi));
  var gap = round2(appProf - actProf);

  $('snapPreview').innerHTML =
    '<b>معاينة فورية قبل الحفظ:</b><br>' +
    '• إجمالي القيمة: <b class="n">' + money(totVal) + '</b> ر.س | صافي الإيداعات حتى التاريخ: <b class="n">' + money(totNet) + '</b> ر.س<br>' +
    '• الربح الفعلي المحسوب: <b class="n pos">+' + money(actProf) + '</b> ر.س | ربح دراية الظاهر: <b class="n">+' + money(appProf) + '</b> ر.س | الفجوة/الرسوم: <b class="n neg">' + money(gap) + '</b> ر.س';
}

function saveSnapModal(){
  var id = $('snapEditId').value;
  var dt = $('snapDate').value || todayISO();
  var sv = round2(parseNum($('snapSchVal').value));
  var si = round2(parseNum($('snapSchInv').value));
  var mv = round2(parseNum($('snapSmtVal').value));
  var mi = round2(parseNum($('snapSmtInv').value));
  var note = $('snapNote').value.trim();

  if(!(sv > 0) || !(mv > 0)){
    alert('الرجاء إدخال القيمة الحالية لكلتا المحفظتين (SCHOOL و SMART).');
    return;
  }
  var undo = takeSnapshotForUndo();
  if(id){
    var s = S.snapshots.find(function(x){ return x.id === id; });
    if(s){
      s.date = dt; s.schoolVal = sv; s.schoolInv = si;
      s.smartVal = mv; s.smartInv = mi; s.note = note;
    }
  } else {
    S.snapshots.push({
      id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      date: dt,
      schoolVal: sv,
      schoolInv: si,
      smartVal: mv,
      smartInv: mi,
      note: note
    });
  }
  save();
  closeSheet();
  renderAll();
  toast('تم حفظ لقطة المحافظ ✓', undo);
}

function deleteSnapModal(){
  var id = $('snapEditId').value;
  if(!id) return;
  var undo = takeSnapshotForUndo();
  S.snapshots = S.snapshots.filter(function(x){ return x.id !== id; });
  save();
  closeSheet();
  renderAll();
  toast('تم حذف اللقطة', undo);
}

/* Settings & Encryption Modal */
function openSettingsModal(){
  var hasEnc = !!sessionPassword || !!localStorage.getItem(ENC_KEY);
  $('setBody').innerHTML =
    '<div class="field">' +
      '<label>المظهر (الوضع الليلي / النهاري)</label>' +
      '<div class="seg-bar" id="setThemeSeg" style="width:100%;margin-top:4px">' +
        '<button data-t="auto" style="flex:1" class="'+(S.theme==='auto'?'on':'')+'">تلقائي</button>' +
        '<button data-t="light" style="flex:1" class="'+(S.theme==='light'?'on':'')+'">فاتح ☀️</button>' +
        '<button data-t="dark" style="flex:1" class="'+(S.theme==='dark'?'on':'')+'">داكن 🌙</button>' +
      '</div>' +
    '</div>' +

    '<div class="card" style="background:var(--bg);margin-bottom:12px">' +
      '<div style="font-weight:800;margin-bottom:6px">🔐 قفل التطبيق والتشفير المحلي (AES-256-GCM)</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">تُشفر بياناتك داخل المتصفح بمفتاح مشتق من كلمة مرورك. لا يمكن لأحد فتح التطبيق على جهازك بدون كلمة المرور.</p>' +
      '<div class="field" style="background:var(--card)">' +
        '<label>' + (hasEnc ? 'كلمة مرور جديدة لتحديث القفل' : 'اختر كلمة مرور أو رمز PIN لتفعيل التشفير') + '</label>' +
        '<input type="password" id="secPassNew" placeholder="أدخل كلمة المرور أو الرمز..." dir="ltr">' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-sm" id="secEnableBtn">تفعيل / تحديث التشفير 🔒</button>' +
        (hasEnc ? '<button class="btn danger btn-sm" id="secDisableBtn">إلغاء القفل وفك التشفير</button>' : '') +
      '</div>' +
    '</div>' +

    '<div class="card" style="background:var(--bg);margin-bottom:12px">' +
      '<div style="font-weight:800;margin-bottom:8px">📦 استيراد وتصدير البيانات (Excel & JSON)</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<button class="btn ghost btn-sm" id="sExpXlsx">📊 تصدير Excel (.xlsx)</button>' +
        '<button class="btn ghost btn-sm" id="sImpXlsx">📂 استيراد Excel (.xlsx)</button>' +
        '<button class="btn ghost btn-sm" id="sExpJson">⬇️ نسخة احتياطية (.json)</button>' +
        '<button class="btn ghost btn-sm" id="sImpJson">⬆️ استرجاع نسخة (.json)</button>' +
   '<button class="btn gold btn-sm" id="sCopyCode">📋 نسخ كود البيانات</button>' +
   '<button class="btn ghost btn-sm" id="sPasteCode">📋 لصق كود البيانات</button>' +
      '</div>' +
    '</div>' +
    '<div style="text-align:center;font-size:12px;color:var(--muted)">رحلتي المالية — الإصدار ' + APP_VERSION + ' • يعمل محلياً 100% بدون إنترنت</div>';

  $('setThemeSeg').onclick = function(e){
    var b = e.target.closest('button');
    if(!b) return;
    S.theme = b.dataset.t;
    applyTheme();
    save();
    openSettingsModal();
  };
  $('secEnableBtn').onclick = async function(){
    var pw = $('secPassNew').value.trim();
    if(pw.length < 3){
      alert('الرجاء إدخال كلمة مرور أو رمز من 3 خانات على الأقل.');
      return;
    }
    sessionPassword = pw;
    await save();
    closeSheet();
    renderAll();
    toast('تم تشفير البيانات محلياً بـ AES-256-GCM 🔒');
  };
  var disBtn = $('secDisableBtn');
  if(disBtn){
    disBtn.onclick = async function(){
      sessionPassword = null;
      localStorage.removeItem(ENC_KEY);
      await save();
      closeSheet();
      renderAll();
      toast('تم إلغاء قفل كلمة المرور');
    };
  }
  $('sExpXlsx').onclick = exportExcelWorkbook;
  $('sImpXlsx').onclick = function(){ closeSheet(); $('xlsxFileInput').click(); };
  $('sExpJson').onclick = exportJsonBackup;
  $('sImpJson').onclick = function(){ closeSheet(); $('jsonFileInput').click(); };
  $('sCopyCode').onclick = copyBackupCode;
  $('sPasteCode').onclick = function(){ closeSheet(); openPasteModal(); };
  openSheet('setSheet');
}

/* Export to .xlsx Workbook (preserving exact sheet names and columns) */
function exportExcelWorkbook(){
  var E = computeEngine();
  var L = E.latest;

  var txRows = [
    ['الإيداعات والسحوبات'],
    [],
    ['كل عملية = سطر واحد فقط.'],
    [],
    ['ابدأ من أول سطر فارغ.'],
    ['التاريخ', 'المحفظة', 'نوع الحركة', 'المبلغ', 'ملاحظات اختيارية', 'تصنيف الإيداع']
  ];
  S.transactions.forEach(function(t){
    txRows.push([t.date, t.portfolio, t.type, Number(t.amount), t.note || '', t.category || 'شهري']);
  });

  var snapRows = [
    ['لقطة الشهر'],
    [],
    ['انسخ القيمة الحالية والمستثمر الظاهر لكل محفظة من تطبيق دراية.'],
    [],
    ['أضف صفًا جديدًا عند التحديث.'],
    ['تاريخ اللقطة', 'قيمة SCHOOL الحالية', 'المستثمر الظاهر SCHOOL', 'قيمة SMART الحالية', 'المستثمر الظاهر SMART', 'ملاحظات اختيارية']
  ];
  S.snapshots.forEach(function(s){
    snapRows.push([s.date, Number(s.schoolVal), Number(s.schoolInv), Number(s.smartVal), Number(s.smartInv), s.note || '']);
  });

  var journeyRows = [
    ['سجل الرحلة'],
    ['التاريخ', 'SCHOOL', 'SMART', 'إجمالي القيمة', 'صافي الإيداعات', 'الربح المحسوب', 'تغير القيمة', 'صافي الحركات', 'تغير الربح', 'حصة SCHOOL', 'حصة SMART', 'الرسوم/الفجوة المستنتجة']
  ];
  E.dailyJourney.forEach(function(d){
    journeyRows.push([
      d.date, d.schoolVal, d.smartVal, d.totVal, d.totNet, d.totProfit,
      d.dVal === null ? '' : d.dVal,
      d.dNet === null ? '' : d.dNet,
      d.dProfit === null ? '' : d.dProfit,
      round2(d.schShare * 100) + '%',
      round2(d.smtShare * 100) + '%',
      d.totFeeGap
    ]);
  });

  var summaryRows = [
    ['رحلتي المالية — ملخص المحافظ'],
    ['آخر لقطة', L ? L.date : ''],
    [],
    ['المحفظة', 'الخطة الشهرية', 'صافي الإيداعات', 'المستثمر الظاهر بدراية', 'القيمة الحالية', 'صافي الربح المحسوب', 'ربح دراية الظاهر', 'الفرق عن دراية (الرسوم)'],
    ['SCHOOL', S.portfolios.SCHOOL.monthlyPlan, L ? L.schNet : 0, L ? L.schoolInv : 0, L ? L.schoolVal : 0, L ? L.schProfit : 0, L ? L.schAppProfit : 0, L ? L.schFeeGap : 0],
    ['SMART', S.portfolios.SMART.monthlyPlan, L ? L.smtNet : 0, L ? L.smartInv : 0, L ? L.smartVal : 0, L ? L.smtProfit : 0, L ? L.smtAppProfit : 0, L ? L.smtFeeGap : 0],
    ['الإجمالي', (S.portfolios.SCHOOL.monthlyPlan + S.portfolios.SMART.monthlyPlan), L ? L.totNet : 0, L ? L.totInv : 0, L ? L.totVal : 0, L ? L.totProfit : 0, L ? L.totAppProfit : 0, L ? L.totFeeGap : 0]
  ];

  var u8 = window.XlsxLite.buildWorkbookBytes([
    { name: 'رحلتي', rows: summaryRows },
    { name: 'سجل الرحلة', rows: journeyRows },
    { name: '2 الإيداعات والسحوبات', rows: txRows },
    { name: '3 لقطة الشهر', rows: snapRows }
  ]);

  var blob = new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'رحلتي-المالية-' + todayISO() + '.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('تم تصدير ملف الإكسل (.xlsx) بنجاح ✓');
}

function exportJsonBackup(){
  var json = JSON.stringify(S, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'رحلتي-المالية-نسخة-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('تم تنزيل النسخة الاحتياطية (.json) ✓');
}


function copyBackupCode(){
  var code = JSON.stringify({
    portfolios: S.portfolios,
    transactions: S.transactions,
    snapshots: S.snapshots,
    milestoneStep: S.milestoneStep
  });
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){
      toast('تم نسخ كود البيانات إلى الحافظة ✓ الصقه في جهازك الآخر');
    }).catch(function(){
      openPasteModal(code);
    });
  } else {
    openPasteModal(code);
  }
}

function openPasteModal(prefill){
  $('pasteCodeIn').value = typeof prefill === 'string' ? prefill : '';
  openSheet('pasteSheet');
  if(!prefill && navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(txt){
      if(txt && txt.trim().startsWith('{')) $('pasteCodeIn').value = txt.trim();
    }).catch(function(){});
  }
}

async function confirmPasteCode(){
  var raw = $('pasteCodeIn').value.trim();
  if(!raw){
    alert('الرجاء لصق كود البيانات أولاً');
    return;
  }
  try {
    var obj = JSON.parse(raw);
    if(!obj || (!Array.isArray(obj.transactions) && !Array.isArray(obj.snapshots))){
      throw new Error('بنية غير صالحة');
    }
    var undo = takeSnapshotForUndo();
    S = normalizeState(obj);
    await save();
    closeSheet();
    renderAll();
    toast('تم استيراد البيانات من الكود بنجاح (' + S.transactions.length + ' حركات و ' + S.snapshots.length + ' لقطات) ✓', undo);
  } catch(e){
    alert('كود البيانات غير صالح — تأكد من نسخ الكود كاملاً');
  }
}

function applyTheme(){
  var t = S ? (S.theme || 'auto') : 'auto';
  var root = document.documentElement;
  if(t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/* Interactive Chart Tooltip Handler */
function bindChartTooltips(){
  var tip = $('chartTip');
  function showTip(e){
    var tgt = e.target.closest('[data-tip]');
    if(!tgt){
      tip.style.display = 'none';
      return;
    }
    tip.textContent = tgt.getAttribute('data-tip');
    tip.style.display = 'block';
    var x = (e.clientX || (e.touches && e.touches[0].clientX) || 120);
    var y = (e.clientY || (e.touches && e.touches[0].clientY) || 120);
    tip.style.left = Math.min(window.innerWidth - 280, Math.max(10, x - 120)) + 'px';
    tip.style.top = Math.max(10, y - 68) + 'px';
  }
  document.addEventListener('mousemove', showTip);
  document.addEventListener('click', showTip);
}

async function initApp(){
  var encRaw = null;
  try { encRaw = localStorage.getItem(ENC_KEY); } catch(e){}
  if(encRaw){
    $('lockScreen').style.display = 'flex';
    $('unlockBtn').onclick = async function(){
      var pw = $('unlockPassInput').value;
      try {
        var dec = await decryptPayload(encRaw, pw);
        sessionPassword = pw;
        S = normalizeState(dec);
        $('lockScreen').style.display = 'none';
        applyTheme();
        renderAll();
      } catch(err){
        $('unlockErr').textContent = 'كلمة المرور غير صحيحة — حاول مرة أخرى';
      }
    };
    $('unlockPassInput').onkeydown = function(e){
      if(e.key === 'Enter') $('unlockBtn').click();
    };
  } else {
    var raw = null, parsed = null;
    try { raw = localStorage.getItem(KEY); parsed = raw ? JSON.parse(raw) : null; } catch(e){}
    S = normalizeState(parsed);
    await save();
    applyTheme();
    renderAll();
  }

  // Bind UI controls
  $('navTabs').onclick = function(e){
    var b = e.target.closest('.nav-tab');
    if(b) switchTab(b.dataset.tab);
  };
  $('privBtn').onclick = function(){
    S.privacy = !S.privacy;
    save();
    renderAll();
    toast(S.privacy ? 'تم إخفاء المبالغ المالية 👁️' : 'تم إظهار المبالغ المالية');
  };
  $('themeBtn').onclick = function(){
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
  };
  $('exportQuickBtn').onclick = exportExcelWorkbook;
  $('setBtn').onclick = openSettingsModal;
  $('secShieldBtn').onclick = openSettingsModal;

  [].forEach.call(document.querySelectorAll('[data-close]'), function(b){ b.onclick = closeSheet; });
  $('scrim').onclick = closeSheet;

  $('txSaveBtn').onclick = saveTxModal;
  $('txDelBtn').onclick = deleteTxModal;
  $('snapSaveBtn').onclick = saveSnapModal;
  $('snapDelBtn').onclick = deleteSnapModal;
  ['snapDate','snapSchVal','snapSchInv','snapSmtVal','snapSmtInv'].forEach(function(id){
    $(id).oninput = updateSnapLivePreview;
  });


  $('pasteConfirmBtn').onclick = confirmPasteCode;
  $('pasteFromClipBtn').onclick = function(){
    if(navigator.clipboard && navigator.clipboard.readText){
      navigator.clipboard.readText().then(function(t){
        if(t) $('pasteCodeIn').value = t.trim();
      }).catch(function(){ $('pasteCodeIn').focus(); });
    } else {
      $('pasteCodeIn').focus();
    }
  };
  $('anyDataFileInput').onchange = function(){
    var f = this.files[0];
    if(!f) return;
    var name = (f.name || '').toLowerCase();
    if(name.endsWith('.json')){
      var rdJ = new FileReader();
      rdJ.onload = async function(){
        try {
          var obj = JSON.parse(rdJ.result);
          if(!obj || (!Array.isArray(obj.transactions) && !Array.isArray(obj.snapshots))) throw new Error('بنية غير صالحة');
          var undo = takeSnapshotForUndo();
          S = normalizeState(obj);
          await save();
          applyTheme();
          renderAll();
          toast('تم استرجاع النسخة الاحتياطية بنجاح ✓', undo);
        } catch(err){
          alert('ملف النسخة الاحتياطية غير صالح');
        }
      };
      rdJ.readAsText(f);
    } else {
      var rdX = new FileReader();
      rdX.onload = async function(){
        try {
          var parsed = await window.XlsxLite.parseWorkbook(rdX.result);
          var undo = takeSnapshotForUndo();
          S.portfolios = parsed.portfolios;
          S.transactions = parsed.transactions;
          S.snapshots = parsed.snapshots;
          S.milestoneStep = parsed.milestoneStep;
          await save();
          renderAll();
          toast('تم استيراد ملف الإكسل بنجاح (' + parsed.transactions.length + ' حركات و ' + parsed.snapshots.length + ' لقطات) ✓', undo);
        } catch(err){
          alert('تعذر قراءة الملف: ' + (err.message || err));
        }
      };
      rdX.readAsArrayBuffer(f);
    }
    this.value = '';
  };

  // Excel file import
  $('xlsxFileInput').onchange = function(){
    var f = this.files[0];
    if(!f) return;
    var rd = new FileReader();
    rd.onload = async function(){
      try {
        var parsed = await window.XlsxLite.parseWorkbook(rd.result);
        var undo = takeSnapshotForUndo();
        S.portfolios = parsed.portfolios;
        S.transactions = parsed.transactions;
        S.snapshots = parsed.snapshots;
        S.milestoneStep = parsed.milestoneStep;
        await save();
        renderAll();
        toast('تم استيراد ملف الإكسل بنجاح (' + parsed.transactions.length + ' حركات و ' + parsed.snapshots.length + ' لقطات) ✓', undo);
      } catch(err){
        alert('تعذر قراءة ملف الإكسل: ' + (err.message || err));
      }
    };
    rd.readAsArrayBuffer(f);
    this.value = '';
  };

  // JSON backup import
  $('jsonFileInput').onchange = function(){
    var f = this.files[0];
    if(!f) return;
    var rd = new FileReader();
    rd.onload = async function(){
      try {
        var obj = JSON.parse(rd.result);
        if(!obj || (!Array.isArray(obj.transactions) && !Array.isArray(obj.snapshots))) throw new Error('بنية غير صالحة');
        var undo = takeSnapshotForUndo();
        S = normalizeState(obj);
        await save();
        applyTheme();
        renderAll();
        toast('تم استرجاع النسخة الاحتياطية بنجاح ✓', undo);
      } catch(err){
        alert('ملف النسخة الاحتياطية غير صالح');
      }
    };
    rd.readAsText(f);
    this.value = '';
  };

  bindChartTooltips();
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
}

window.RihlatiApp = {
  computeEngine: computeEngine,
  getState: function(){ return S; },
  switchTab: switchTab,
  exportExcelWorkbook: exportExcelWorkbook
};

initApp();
})();
