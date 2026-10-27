/* XlsxLite — Zero-dependency browser/Node .xlsx reader & RTL .xlsx writer */
(function(root){
'use strict';

var CRC_TABLE = (function(){
  var t = new Uint32Array(256);
  for(var n=0; n<256; n++){
    var c = n;
    for(var k=0; k<8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8){
  var c = 0xFFFFFFFF;
  for(var i=0; i<u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function strToU8(str){
  return new TextEncoder().encode(str);
}
function u8ToStr(u8){
  return new TextDecoder('utf-8').decode(u8);
}

/* Build a valid uncompressed ZIP (Store method 0) from [{name, data (Uint8Array|string)}] */
function makeZip(files){
  var localParts = [], centralParts = [], offset = 0;
  files.forEach(function(f){
    var nameBytes = strToU8(f.name);
    var dataBytes = typeof f.data === 'string' ? strToU8(f.data) : f.data;
    var crc = crc32(dataBytes);
    var size = dataBytes.length;

    var lh = new Uint8Array(30 + nameBytes.length);
    var lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true);      // store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    var ch = new Uint8Array(46 + nameBytes.length);
    var cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    localParts.push(lh, dataBytes);
    centralParts.push(ch);
    offset += lh.length + size;
  });

  var centralSize = centralParts.reduce(function(a, b){ return a + b.length; }, 0);
  var eocd = new Uint8Array(22);
  var ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  var total = offset + centralSize + 22;
  var out = new Uint8Array(total);
  var pos = 0;
  localParts.concat(centralParts, [eocd]).forEach(function(p){
    out.set(p, pos);
    pos += p.length;
  });
  return out;
}

/* Decompress raw deflate bytes using DecompressionStream (browser & modern Node) */
async function inflateRaw(u8){
  var ds = new DecompressionStream('deflate-raw');
  var writer = ds.writable.getWriter();
  writer.write(u8);
  writer.close();
  var reader = ds.readable.getReader();
  var chunks = [], total = 0;
  while(true){
    var res = await reader.read();
    if(res.done) break;
    chunks.push(res.value);
    total += res.value.length;
  }
  var out = new Uint8Array(total), off = 0;
  chunks.forEach(function(c){ out.set(c, off); off += c.length; });
  return out;
}

async function readZip(buffer){
  var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var eocdPos = -1;
  for(var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--){
    if(dv.getUint32(i, true) === 0x06054b50){ eocdPos = i; break; }
  }
  if(eocdPos < 0) throw new Error('ملف غير صالح (ليس أرشيف ZIP/XLSX)');
  var count = dv.getUint16(eocdPos + 10, true);
  var dirOffset = dv.getUint32(eocdPos + 16, true);
  var pos = dirOffset;
  var entries = {};
  for(var n=0; n<count; n++){
    if(dv.getUint32(pos, true) !== 0x02014b50) break;
    var method = dv.getUint16(pos + 10, true);
    var compSize = dv.getUint32(pos + 20, true);
    var nameLen = dv.getUint16(pos + 28, true);
    var extraLen = dv.getUint16(pos + 30, true);
    var commentLen = dv.getUint16(pos + 32, true);
    var localOffset = dv.getUint32(pos + 42, true);
    var name = u8ToStr(u8.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    var lNameLen = dv.getUint16(localOffset + 26, true);
    var lExtraLen = dv.getUint16(localOffset + 28, true);
    var dataStart = localOffset + 30 + lNameLen + lExtraLen;
    var raw = u8.subarray(dataStart, dataStart + compSize);
    if(method === 0) entries[name] = raw;
    else if(method === 8) entries[name] = await inflateRaw(raw);
  }
  return entries;
}

function colLetter(n){
  var s = '';
  while(n > 0){
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function colToIdx(colStr){
  var n = 0;
  for(var i=0; i<colStr.length; i++){
    n = n * 26 + (colStr.charCodeAt(i) - 64);
  }
  return n;
}

function excelSerialToISO(serial){
  var num = Number(serial);
  if(!isFinite(num) || num < 20000 || num > 100000) return null;
  var utcDays = Math.round(num - 25569);
  var d = new Date(utcDays * 86400000);
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function normDateStr(val){
  if(val == null || val === '') return null;
  if(typeof val === 'number') return excelSerialToISO(val);
  var s = String(val).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  if(/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s));
  return null;
}

function decodeXmlEntities(s){
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, function(_, h){ return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d){ return String.fromCharCode(parseInt(d, 10)); });
}

function parseSharedStrings(xml){
  var out = [];
  if(!xml) return out;
  var siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
  while((m = siRe.exec(xml)) !== null){
    var body = m[1], tRe = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g, tm, txt = '';
    while((tm = tRe.exec(body)) !== null) txt += decodeXmlEntities(tm[1]);
    out.push(txt);
  }
  return out;
}

function parseSheetCells(xml, shared){
  var rows = {};
  var cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
  while((m = cRe.exec(xml)) !== null){
    var attrs = m[1], inner = m[2] || '';
    var rMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
    if(!rMatch) continue;
    var col = rMatch[1], rowNum = parseInt(rMatch[2], 10);
    var tMatch = attrs.match(/\bt="([^"]+)"/);
    var type = tMatch ? tMatch[1] : '';
    var val = null;
    if(type === 's'){
      var vm = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      if(vm) val = shared[parseInt(vm[1], 10)] ?? '';
    } else if(type === 'inlineStr' || type === 'str'){
      var tm = inner.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
      if(tm) val = decodeXmlEntities(tm[1]);
      else {
        var vm2 = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if(vm2) val = decodeXmlEntities(vm2[1]);
      }
    } else {
      var vm3 = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      if(vm3){
        var raw = vm3[1].trim();
        var num = Number(raw);
        val = (raw !== '' && isFinite(num)) ? num : decodeXmlEntities(raw);
      }
    }
    if(val !== null && val !== ''){
      if(!rows[rowNum]) rows[rowNum] = {};
      rows[rowNum][col] = val;
    }
  }
  return rows;
}

async function parseWorkbook(buffer){
  var entries = await readZip(buffer);
  var sharedXml = entries['xl/sharedStrings.xml'] ? u8ToStr(entries['xl/sharedStrings.xml']) : '';
  var shared = parseSharedStrings(sharedXml);
  var wbXml = entries['xl/workbook.xml'] ? u8ToStr(entries['xl/workbook.xml']) : '';
  var relsXml = entries['xl/_rels/workbook.xml.rels'] ? u8ToStr(entries['xl/_rels/workbook.xml.rels']) : '';

  var relMap = {};
  var relRe = /<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"/g, rm;
  while((rm = relRe.exec(relsXml)) !== null){
    var tgt = rm[2].replace(/^\/+/, '');
    if(!tgt.startsWith('xl/')) tgt = 'xl/' + tgt.replace(/^\.\//, '');
    relMap[rm[1]] = tgt;
  }
  // also check reversed attribute order Target before Id
  var relRe2 = /<Relationship\b[^>]*?\bTarget="([^"]+)"[^>]*?\bId="([^"]+)"/g;
  while((rm = relRe2.exec(relsXml)) !== null){
    var tgt2 = rm[1].replace(/^\/+/, '');
    if(!tgt2.startsWith('xl/')) tgt2 = 'xl/' + tgt2.replace(/^\.\//, '');
    relMap[rm[2]] = tgt2;
  }

  var sheets = {};
  var shRe = /<sheet\b[^>]*?\bname="([^"]+)"[^>]*?\br:id="([^"]+)"/g, sm;
  while((sm = shRe.exec(wbXml)) !== null){
    var sName = decodeXmlEntities(sm[1]), rId = sm[2];
    var path = relMap[rId];
    if(path && entries[path]){
      sheets[sName] = parseSheetCells(u8ToStr(entries[path]), shared);
    }
  }
  return extractFinancialData(sheets);
}

function extractFinancialData(sheets){
  var txSheet = sheets['2 الإيداعات والسحوبات'] || sheets['الإيداعات والسحوبات'] || null;
  var snapSheet = sheets['3 لقطة الشهر'] || sheets['لقطة الشهر'] || null;
  var goalSheet = sheets['أهدافي'] || null;
  var mainSheet = sheets['1 الرئيسية'] || null;

  // Fallback search by sheet headers
  if(!txSheet || !snapSheet){
    Object.keys(sheets).forEach(function(k){
      var s = sheets[k];
      if(!txSheet && s[6] && s[6].B === 'المحفظة' && s[6].C === 'نوع الحركة') txSheet = s;
      if(!snapSheet && s[6] && String(s[6].B || '').indexOf('SCHOOL') >= 0 && String(s[6].D || '').indexOf('SMART') >= 0) snapSheet = s;
    });
  }
  if(!txSheet && !snapSheet) throw new Error('لم يتم العثور على ورقتَي الإيداعات أو لقطة الشهر داخل ملف الإكسل');

  var transactions = [];
  if(txSheet){
    Object.keys(txSheet).map(Number).sort(function(a,b){return a-b;}).forEach(function(r){
      if(r < 2) return;
      var row = txSheet[r];
      var dt = normDateStr(row.A);
      var port = String(row.B || '').trim().toUpperCase();
      var type = String(row.C || '').trim();
      var amt = Number(row.D);
      if(!dt || !port || (type !== 'إيداع' && type !== 'سحب') || !(amt > 0)) return;
      var note = row.E != null ? String(row.E).trim() : '';
      var cat = row.F != null ? String(row.F).trim() : (type === 'إيداع' ? 'شهري' : 'سحب');
      transactions.push({
        id: 'tx_' + r + '_' + dt.replace(/-/g,''),
        seq: transactions.length + 1,
        date: dt,
        portfolio: port,
        type: type,
        amount: Math.round(amt * 100) / 100,
        category: cat,
        note: note
      });
    });
  }

  var snapshots = [];
  if(snapSheet){
    Object.keys(snapSheet).map(Number).sort(function(a,b){return a-b;}).forEach(function(r){
      if(r < 2) return;
      var row = snapSheet[r];
      var dt = normDateStr(row.A);
      var sv = Number(row.B), si = Number(row.C), mv = Number(row.D), mi = Number(row.E);
      if(!dt || !isFinite(sv) || !isFinite(mv) || (sv <= 0 && mv <= 0)) return;
      var note = row.F != null ? String(row.F).trim() : '';
      snapshots.push({
        id: 'snap_' + r + '_' + dt.replace(/-/g,''),
        seq: snapshots.length + 1,
        date: dt,
        schoolVal: Math.round(sv * 100) / 100,
        schoolInv: Math.round((isFinite(si) ? si : 0) * 100) / 100,
        smartVal: Math.round(mv * 100) / 100,
        smartInv: Math.round((isFinite(mi) ? mi : 0) * 100) / 100,
        note: note
      });
    });
  }

  var portfolios = {
    SCHOOL: {
      code: 'SCHOOL',
      nameAr: 'تعليم الأبناء',
      goalName: (goalSheet && goalSheet[11] && goalSheet[11].F) ? String(goalSheet[11].F) : 'إدخار لتعليم الأبناء',
      targetAmount: (goalSheet && goalSheet[12] && Number(goalSheet[12].F) > 0) ? Number(goalSheet[12].F) : 0,
      targetDate: (goalSheet && goalSheet[13] && normDateStr(goalSheet[13].F)) ? normDateStr(goalSheet[13].F) : '',
      monthlyPlan: (mainSheet && mainSheet[20] && Number(mainSheet[20].B) > 0) ? Number(mainSheet[20].B) : 0,
      color: '#0e8a5f'
    },
    SMART: {
      code: 'SMART',
      nameAr: 'السيارات والطوارئ',
      goalName: (goalSheet && goalSheet[11] && goalSheet[11].J) ? String(goalSheet[11].J) : 'إدخار للسيارات والطوارئ',
      targetAmount: (goalSheet && goalSheet[12] && Number(goalSheet[12].J) > 0) ? Number(goalSheet[12].J) : 0,
      targetDate: (goalSheet && goalSheet[13] && normDateStr(goalSheet[13].J)) ? normDateStr(goalSheet[13].J) : '',
      monthlyPlan: (mainSheet && mainSheet[21] && Number(mainSheet[21].B) > 0) ? Number(mainSheet[21].B) : 0,
      color: '#d99b26'
    }
  };

  var milestoneStep = (goalSheet && goalSheet[33] && Number(goalSheet[33].F) > 0) ? Number(goalSheet[33].F) : 50000;
  return {
    portfolios: portfolios,
    transactions: transactions,
    snapshots: snapshots,
    milestoneStep: milestoneStep
  };
}

function escXml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSheetXml(rowsAoA){
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews>' +
    '<sheetData>';
  for(var r=0; r<rowsAoA.length; r++){
    var row = rowsAoA[r];
    if(!row || !row.length) continue;
    var rNum = r + 1;
    var cells = '';
    for(var c=0; c<row.length; c++){
      var v = row[c];
      if(v === null || v === undefined || v === '') continue;
      var ref = colLetter(c + 1) + rNum;
      if(typeof v === 'number' && isFinite(v)){
        cells += '<c r="' + ref + '"><v>' + v + '</v></c>';
      } else {
        cells += '<c r="' + ref + '" t="inlineStr"><is><t>' + escXml(v) + '</t></is></c>';
      }
    }
    if(cells) xml += '<row r="' + rNum + '">' + cells + '</row>';
  }
  xml += '</sheetData></worksheet>';
  return xml;
}

/* Export full workbook compatible with both Excel and re-importing into our app */
function buildWorkbookBytes(sheetsList){
  var files = [];
  var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';

  var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  var wbSheets = '';

  sheetsList.forEach(function(sh, idx){
    var num = idx + 1;
    contentTypes += '<Override PartName="/xl/worksheets/sheet' + num + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    wbRels += '<Relationship Id="rId' + num + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + num + '.xml"/>';
    wbSheets += '<sheet name="' + escXml(sh.name) + '" sheetId="' + num + '" r:id="rId' + num + '"/>';
    files.push({ name: 'xl/worksheets/sheet' + num + '.xml', data: buildSheetXml(sh.rows) });
  });

  contentTypes += '</Types>';
  wbRels += '</Relationships>';

  var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  var workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + wbSheets + '</sheets></workbook>';

  files.unshift(
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels }
  );

  return makeZip(files);
}

root.XlsxLite = {
  parseWorkbook: parseWorkbook,
  buildWorkbookBytes: buildWorkbookBytes
};
})(typeof window !== 'undefined' ? window : globalThis);
