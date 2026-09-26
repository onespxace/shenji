/* 数据分析引擎：CSV 解析 + 审计分析算法（纯前端，零依赖） */
window.AuditTools = (() => {
"use strict";

/* ---------- CSV 解析（支持引号、换行、BOM） ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delimiter) { row.push(cur); cur = ""; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === '\r') { /* skip, handled by \n */ }
      else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}

function decodeFile(buf) {
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    if (t.indexOf("�") === -1) return t;
  } catch (e) { /* fall through to gbk */ }
  try { return new TextDecoder("gbk").decode(buf); }
  catch (e) { return new TextDecoder("utf-8").decode(buf); }
}

function toTable(rows) {
  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0].map(h => String(h).trim());
  const data = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] !== undefined ? String(r[i]).trim() : ""); });
    return o;
  });
  return { headers, data };
}

/* ---------- 通用 ---------- */
function num(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[,，\s¥￥$]/g, "").replace(/[（）]/g, m => m === "（" ? "-" : "");
  if (/^\(.*\)$/.test(s)) return -parseFloat(s.slice(1, -1));
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
function firstDigit(n) {
  n = Math.abs(n);
  if (!isFinite(n) || n === 0) return 0;
  while (n >= 10) n /= 10;
  while (n < 1) n *= 10;
  return Math.floor(n);
}
function fmt(n, d) {
  if (!isFinite(n)) return "-";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d === undefined ? 2 : d });
}
function downloadCSV(filename, headers, rows) {
  const esc = v => { v = String(v === undefined ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = "﻿" + headers.map(esc).join(",") + "\n" + rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- 1. 本福特定律 ---------- */
const BENFORD = [0, 0.3010, 0.1761, 0.1249, 0.0969, 0.0792, 0.0669, 0.0580, 0.0512, 0.0458];
function benford(col) {
  const counts = [0,0,0,0,0,0,0,0,0,0];
  let n = 0;
  col.forEach(v => {
    const d = firstDigit(num(v));
    if (d >= 1 && d <= 9) { counts[d]++; n++; }
  });
  let chi2 = 0;
  const rows = [];
  for (let d = 1; d <= 9; d++) {
    const exp = BENFORD[d], act = n ? counts[d] / n : 0;
    if (n * exp > 0) chi2 += Math.pow(counts[d] - n * exp, 2) / (n * exp);
    rows.push({ digit: d, count: counts[d], actual: act, expected: exp, diff: act - exp });
  }
  // 自由度8，显著性5%临界值15.51
  const verdict = n < 100 ? "样本量不足100，结果仅供参考"
    : chi2 > 15.51 ? "偏离显著：数据可能存在人为干预，建议结合分录测试进一步核查"
    : "基本符合：未发现系统性人为操纵迹象";
  return { n, chi2, verdict, rows };
}

/* ---------- 2. 重复值检查 ---------- */
function duplicates(data, keyCols) {
  const map = new Map();
  data.forEach((row, i) => {
    const k = keyCols.map(c => row[c] === undefined ? "" : row[c]).join("‖");
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  const groups = [];
  map.forEach((idxs, k) => { if (idxs.length > 1) groups.push({ key: k, count: idxs.length, rows: idxs.map(i => ({ line: i + 2, ...data[i] })) }); });
  groups.sort((a, b) => b.count - a.count);
  return groups;
}

/* ---------- 3. 断号检查 ---------- */
function gaps(data, col) {
  const nums = [];
  data.forEach((row, i) => {
    const n = num(row[col]);
    if (Number.isInteger(n)) nums.push({ n, line: i + 2, row });
  });
  if (!nums.length) return { numbers: [], missing: [], note: "该列无有效整数" };
  nums.sort((a, b) => a.n - b.n);
  const seen = new Set(nums.map(x => x.n));
  const missing = [];
  for (let v = nums[0].n; v <= nums[nums.length - 1].n; v++) {
    if (!seen.has(v) && missing.length < 5000) missing.push(v);
  }
  return { numbers: nums, missing, min: nums[0].n, max: nums[nums.length - 1].n, truncated: (nums[nums.length - 1].n - nums[0].n + 1 - seen.size) > 5000 };
}

/* ---------- 4. 账龄分析 ---------- */
function aging(data, dateCol, amtCol, asOfStr) {
  const asOf = asOfStr ? new Date(asOfStr) : new Date();
  const buckets = [
    { name: "0-30天", min: 0, max: 30, total: 0, count: 0 },
    { name: "31-60天", min: 31, max: 60, total: 0, count: 0 },
    { name: "61-90天", min: 61, max: 90, total: 0, count: 0 },
    { name: "91-180天", min: 91, max: 180, total: 0, count: 0 },
    { name: "181-365天", min: 181, max: 365, total: 0, count: 0 },
    { name: "365天以上", min: 366, max: Infinity, total: 0, count: 0 }
  ];
  let badDate = 0, total = 0;
  data.forEach(row => {
    const d = new Date(String(row[dateCol]).replace(/\./g, "-").replace(/\//g, "-"));
    const a = num(row[amtCol]);
    if (isNaN(d.getTime())) { badDate++; return; }
    if (isNaN(a)) return;
    const days = Math.floor((asOf - d) / 86400000);
    total += a;
    const b = buckets.find(x => days >= x.min && days <= x.max) || buckets[buckets.length - 1];
    b.total += a; b.count++;
  });
  return { buckets, badDate, total };
}

/* ---------- 5. 分层汇总 ---------- */
function stratify(data, groupCol, amtCol) {
  const map = new Map();
  data.forEach(row => {
    const g = row[groupCol] === undefined ? "(空)" : String(row[groupCol]);
    const a = num(row[amtCol]);
    if (!map.has(g)) map.set(g, { group: g, total: 0, count: 0 });
    const o = map.get(g);
    o.count++;
    if (!isNaN(a)) o.total += a;
  });
  const rows = [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const grand = rows.reduce((s, r) => s + r.total, 0);
  rows.forEach(r => { r.pct = grand ? r.total / grand * 100 : 0; });
  return { rows, grand };
}

/* ---------- 6. 审计抽样 ---------- */
function sampleSize(N, conf, tolerable, expected) {
  // 属性抽样（近似正态）：n0 = Z^2 * p(1-p) / e^2，有限总体修正
  const Z = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 }[conf] || 1.96;
  const p = Math.max(expected, 0.005);
  const e = Math.max(tolerable - expected, 0.001);
  let n0 = Math.ceil(Z * Z * p * (1 - p) / (e * e));
  const n = N ? Math.ceil(n0 / (1 + (n0 - 1) / N)) : n0;
  return { n0, n, Z, params: { N, conf, tolerable, expected } };
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickRandom(data, n, seed) {
  const rnd = mulberry32(seed || (Date.now() % 2147483647));
  const idx = data.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(n, idx.length)).sort((a, b) => a - b).map(i => ({ line: i + 2, ...data[i] }));
}

/* ---------- 7. 凭证筛查 ---------- */
function journalTests(data, dateCol, amtCol, descCol, bigThreshold) {
  const big = bigThreshold || 100000;
  const out = { weekend: [], round: [], big: [], blank: [] };
  data.forEach((row, i) => {
    const line = i + 2;
    const d = new Date(String(row[dateCol] || "").replace(/\./g, "-").replace(/\//g, "-"));
    if (!isNaN(d.getTime()) && (d.getDay() === 0 || d.getDay() === 6)) out.weekend.push({ line, ...row });
    const a = num(row[amtCol]);
    if (!isNaN(a) && a !== 0) {
      if (Math.abs(a) >= 1000 && Math.abs(a) % 1000 === 0) out.round.push({ line, ...row });
      if (Math.abs(a) >= big) out.big.push({ line, ...row });
    }
    if (descCol && String(row[descCol] || "").trim() === "") out.blank.push({ line, ...row });
  });
  return out;
}

/* ---------- 8. 试算平衡检查 ---------- */
function trialBalance(data, debitCol, creditCol) {
  let dr = 0, cr = 0, badRows = [];
  data.forEach((row, i) => {
    const d = num(row[debitCol]), c = num(row[creditCol]);
    if (isNaN(d) && isNaN(c)) { badRows.push(i + 2); return; }
    dr += isNaN(d) ? 0 : d;
    cr += isNaN(c) ? 0 : c;
  });
  const diff = dr - cr;
  return { dr, cr, diff, balanced: Math.abs(diff) < 0.01, badRows };
}

/* ---------- 描述统计 ---------- */
function describe(col) {
  const vals = col.map(num).filter(v => !isNaN(v)).sort((a, b) => a - b);
  if (!vals.length) return null;
  const sum = vals.reduce((s, v) => s + v, 0);
  const mean = sum / vals.length;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
  return { n: vals.length, sum, mean, median, min: vals[0], max: vals[vals.length - 1], sd };
}

return { parseCSV, decodeFile, toTable, num, fmt, downloadCSV, BENFORD, benford, duplicates, gaps, aging, stratify, sampleSize, pickRandom, journalTests, trialBalance, describe };
})();
