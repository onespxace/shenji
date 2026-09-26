/* 主入口：导航 + 数据分析视图 + 底稿视图 + 法规视图 */
(() => {
"use strict";
const T = window.AuditTools;
const esc = s => String(s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let dataset = null; // {headers, data, filename}
let activeTool = "benford";

const TOOLS = [
  { id: "benford", name: "本福特定律", desc: "首位数字检验" },
  { id: "dup", name: "重复检查", desc: "关键字段重复" },
  { id: "gap", name: "断号检查", desc: "编号连续性" },
  { id: "aging", name: "账龄分析", desc: "按日期分段" },
  { id: "strat", name: "分层汇总", desc: "分组求和" },
  { id: "sample", name: "审计抽样", desc: "样本量+随机抽样" },
  { id: "journal", name: "凭证筛查", desc: "周末/整数/大额" },
  { id: "tb", name: "试算平衡", desc: "借贷合计核对" }
];

/* ---------- 导航 ---------- */
document.querySelectorAll(".nav-item").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    b.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const v = document.getElementById("view-" + b.dataset.view);
    v.classList.add("active");
    if (b.dataset.view === "ai") window.AuditAI.renderAI(v);
    if (b.dataset.view === "settings") window.AuditAI.renderSettings(v);
  };
});

/* ---------- 数据分析视图 ---------- */
function colOptions(headers, sel) {
  return headers.map(h => `<option${h === sel ? " selected" : ""}>${esc(h)}</option>`).join("");
}
function guess(headers, keys) {
  for (const k of keys) {
    const f = headers.find(h => h.indexOf(k) !== -1);
    if (f) return f;
  }
  return headers[0] || "";
}
function resultTable(headers, rows, max) {
  max = max || 200;
  const body = rows.slice(0, max).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table class="data"><thead><tr>${headers.map(h => `<th class="l">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body || '<tr><td>无结果</td></tr>'}</tbody></table></div>
  ${rows.length > max ? `<p class="muted">仅显示前 ${max} 行，共 ${rows.length} 行，可下载完整结果。</p>` : ""}`;
}

function renderDataView() {
  const el = document.getElementById("view-data");
  el.innerHTML = `
  <h2>数据分析工具</h2>
  <p class="sub">导入 CSV 台账，一键执行审计分析程序。数据仅在浏览器内存中处理，不上传。</p>
  <div class="card"><h3>1. 导入数据</h3>
    <div class="drop" id="drop">点击选择 CSV 文件，或把文件拖到这里<br><span class="muted">支持 UTF-8 / GBK（含 Excel 另存的 CSV），最大约 20 万行</span><input type="file" id="file-in" accept=".csv,.txt"></div>
    <div id="file-info" class="muted">${dataset ? "已载入：" + esc(dataset.filename) + "（" + dataset.data.length + " 行，" + dataset.headers.length + " 列）" : "尚未导入数据，可先用下方示例数据体验"}</div>
    <div class="toolbar"><button class="btn small" id="btn-sample">载入示例数据（费用报销）</button></div>
  </div>
  <div class="card"><h3>2. 选择分析程序</h3>
    <div class="tool-grid">${TOOLS.map(t => `<button class="tool-btn${t.id === activeTool ? " active" : ""}" data-tool="${t.id}"><strong>${t.name}</strong><span>${t.desc}</span></button>`).join("")}</div>
    <div id="tool-params"></div>
    <div class="toolbar"><button class="btn primary" id="btn-run">执行分析</button><button class="btn" id="btn-download" style="display:none">下载结果 CSV</button></div>
  </div>
  <div class="card"><h3>3. 分析结果</h3><div id="tool-result"><p class="muted">执行分析后结果显示在这里。</p></div></div>`;

  const drop = el.querySelector("#drop"), fi = el.querySelector("#file-in");
  drop.onclick = e => { if (e.target !== fi) fi.click(); };
  fi.onchange = () => { if (fi.files[0]) loadFile(fi.files[0]); };
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  el.querySelector("#btn-sample").onclick = loadSample;
  el.querySelectorAll("[data-tool]").forEach(b => { b.onclick = () => { activeTool = b.dataset.tool; renderDataView(); }; });
  el.querySelector("#btn-run").onclick = runTool;
  el.querySelector("#btn-download").onclick = downloadResult;
  renderParams();
}

let lastDownload = null;
function downloadResult() {
  if (lastDownload) T.downloadCSV(lastDownload.name, lastDownload.headers, lastDownload.rows);
}

function loadFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const text = T.decodeFile(new Uint8Array(rd.result));
      const table = T.toTable(T.parseCSV(text));
      if (!table.headers.length) throw new Error("empty");
      dataset = { ...table, filename: file.name };
      renderDataView();
    } catch (e) { alert("文件解析失败，请确认是 CSV 格式：" + e.message); }
  };
  rd.readAsArrayBuffer(file);
}
function loadSample() {
  const csv = `日期,报销人,类别,金额,发票号,摘要
2025-03-05,张三,差旅费,1250.00,INV-1001,北京出差机票
2025-03-06,张三,差旅费,1250.00,INV-1001,北京出差机票
2025-03-08,李四,业务招待费,8000.00,INV-1002,客户宴请
2025-03-09,王五,办公费,320.50,INV-1003,打印纸
2025-03-15,赵六,咨询费,150000.00,INV-1004,项目咨询
2025-03-16,赵六,咨询费,150000.00,INV-1004,项目咨询
2025-03-22,张三,差旅费,20000.00,INV-1005,考察
2025-03-23,李四,业务招待费,5000.00,,客户宴请
2025-03-29,王五,办公费,9000.00,INV-1006,电脑
2025-03-30,钱七,会议费,12000.00,INV-1007,研讨会
2025-12-31,孙八,咨询费,200000.00,INV-1008,年末咨询`;
  const table = T.toTable(T.parseCSV(csv));
  dataset = { ...table, filename: "示例数据：费用报销.csv" };
  renderDataView();
}

function renderParams() {
  const box = document.getElementById("tool-params");
  if (!box) return;
  if (!dataset) { box.innerHTML = '<p class="muted">请先导入数据。</p>'; return; }
  const H = dataset.headers;
  const F = (id, label, opts) => `<div class="field"><label>${label}</label><select id="p-${id}">${colOptions(H, opts)}</select></div>`;
  if (activeTool === "benford") box.innerHTML = `<div class="row">${F("amt", "金额列", guess(H, ["金额", "借方", "发生额", "余额"]))}</div>`;
  else if (activeTool === "dup") box.innerHTML = `<div class="row">${F("k1", "关键列1", guess(H, ["发票号", "凭证号", "单号"]))}<div class="field"><label>关键列2（可选）</label><select id="p-k2"><option value="">（不启用）</option>${colOptions(H, "")}</select></div></div>`;
  else if (activeTool === "gap") box.innerHTML = `<div class="row">${F("seq", "编号列", guess(H, ["编号", "单号", "凭证号", "发票号"]))}</div>`;
  else if (activeTool === "aging") box.innerHTML = `<div class="row">${F("dt", "日期列", guess(H, ["日期", "发生日期", "入账日期"]))}${F("amt", "金额列", guess(H, ["金额", "余额", "发生额"]))}<div class="field"><label>基准日（默认今天）</label><input id="p-asof" type="date"></div></div>`;
  else if (activeTool === "strat") box.innerHTML = `<div class="row">${F("grp", "分组列", guess(H, ["类别", "科目", "部门", "客户"]))}${F("amt", "金额列", guess(H, ["金额", "发生额", "余额"]))}</div>`;
  else if (activeTool === "sample") box.innerHTML = `<div class="row">
    <div class="field"><label>总体规模 N（默认用当前行数）</label><input id="p-n" type="number" placeholder="${dataset.data.length}"></div>
    <div class="field"><label>置信水平</label><select id="p-conf"><option value="0.90">90%</option><option value="0.95" selected>95%</option><option value="0.99">99%</option></select></div>
    <div class="field"><label>可容忍偏差率 %</label><input id="p-tol" type="number" value="5" step="0.5"></div>
    <div class="field"><label>预期偏差率 %</label><input id="p-exp" type="number" value="1" step="0.5"></div>
    <div class="field"><label>随机种子（复核留痕）</label><input id="p-seed" type="number" value="20250101"></div></div>`;
  else if (activeTool === "journal") box.innerHTML = `<div class="row">${F("dt", "日期列", guess(H, ["日期", "记账日期"]))}${F("amt", "金额列", guess(H, ["金额", "借方"]))}${F("desc", "摘要列", guess(H, ["摘要", "说明"]))}<div class="field"><label>大额阈值（元）</label><input id="p-big" type="number" value="100000"></div></div>`;
  else if (activeTool === "tb") box.innerHTML = `<div class="row">${F("dr", "借方列", guess(H, ["借方", "借"] ))}${F("cr", "贷方列", guess(H, ["贷方", "贷"] ))}</div>`;
}

function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setDownload(name, headers, rows) {
  lastDownload = { name, headers, rows };
  document.getElementById("btn-download").style.display = "";
}

function runTool() {
  const box = document.getElementById("tool-result");
  if (!dataset) { box.innerHTML = '<p class="muted">请先导入数据。</p>'; return; }
  const H = dataset.headers, D = dataset.data;
  document.getElementById("btn-download").style.display = "none";
  lastDownload = null;

  if (activeTool === "benford") {
    const r = T.benford(D.map(x => x[val("p-amt")]));
    const maxC = Math.max(...r.rows.map(x => x.count), 1);
    box.innerHTML = `<div class="kv">
      <div class="k"><span>有效样本</span><strong>${r.n}</strong></div>
      <div class="k"><span>卡方统计量（临界 15.51）</span><strong>${r.chi2.toFixed(2)}</strong></div>
      <div class="k"><span>结论</span><strong style="font-size:13px">${esc(r.verdict)}</strong></div></div>
    <div class="bars">${r.rows.map(x => `<div class="bar-group"><div class="bar-pair">
      <div class="bar actual" style="height:${Math.round(x.count / maxC * 130)}px" title="实际${(x.actual * 100).toFixed(1)}%"></div>
      <div class="bar expected" style="height:${Math.round(x.expected / 0.301 * 130)}px" title="理论${(x.expected * 100).toFixed(1)}%"></div>
      </div><div class="bar-x">${x.digit}</div></div>`).join("")}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>实际占比</span><span><i style="background:#b9c8e8"></i>本福特理论占比</span></div>
    ${resultTable(["首位", "频数", "实际占比", "理论占比", "差异"], r.rows.map(x => [x.digit, x.count, (x.actual * 100).toFixed(1) + "%", (x.expected * 100).toFixed(1) + "%", (x.diff * 100).toFixed(1) + "%"]))}`;
    setDownload("benford.csv", ["digit", "count", "actual", "expected"], r.rows.map(x => [x.digit, x.count, x.actual.toFixed(4), x.expected.toFixed(4)]));
  }
  else if (activeTool === "dup") {
    const k1 = val("p-k1"), k2 = val("p-k2");
    const keys = (k2 && k2 !== k1) ? [k1, k2] : [k1];
    const g = T.duplicates(D, keys);
    const total = g.reduce((s, x) => s + x.count, 0);
    box.innerHTML = `<div class="kv"><div class="k"><span>重复组数</span><strong>${g.length}</strong></div>
      <div class="k"><span>涉及记录</span><strong>${total}</strong></div>
      <div class="k"><span>结论</span><strong style="font-size:13px">${g.length ? "发现重复记录，请核对是否为重复报销/入账" : "未发现重复"}</strong></div></div>
      ${g.length ? resultTable(["重复键", "次数", "行号"], g.map(x => [x.key, x.count, x.rows.map(r => r.line).join("、")])) : ""}`;
    setDownload("duplicates.csv", ["key", "count", "lines"], g.map(x => [x.key, x.count, x.rows.map(r => r.line).join(";")]));
  }
  else if (activeTool === "gap") {
    const r = T.gaps(D, val("p-seq"));
    box.innerHTML = `<div class="kv"><div class="k"><span>编号范围</span><strong>${r.min} ~ ${r.max}</strong></div>
      <div class="k"><span>缺失号码数</span><strong>${r.missing.length}</strong></div>
      <div class="k"><span>结论</span><strong style="font-size:13px">${r.note || (r.missing.length ? "存在断号，请核查缺失编号去向" : "编号连续，未发现断号")}</strong></div></div>
      ${r.missing.length ? `<p>缺失号码：${r.missing.slice(0, 200).join("、")}${r.missing.length > 200 ? "…（仅显示前200个）" : ""}${r.truncated ? "（数量过大已截断）" : ""}</p>` : ""}`;
    setDownload("gaps.csv", ["missing_no"], r.missing.map(x => [x]));
  }
  else if (activeTool === "aging") {
    const r = T.aging(D, val("p-dt"), val("p-amt"), val("p-asof"));
    box.innerHTML = `${r.badDate ? `<div class="notice warn">有 ${r.badDate} 行日期无法识别，已跳过。请检查日期格式（YYYY-MM-DD）。</div>` : ""}
      ${resultTable(["账龄段", "笔数", "金额", "占比"], r.buckets.map(b => [b.name, b.count, T.fmt(b.total), (r.total ? b.total / r.total * 100 : 0).toFixed(1) + "%"]))}
      <div class="kv"><div class="k"><span>合计</span><strong>${T.fmt(r.total)}</strong></div>
      <div class="k"><span>1年以上占比</span><strong>${(r.total ? r.buckets[5].total / r.total * 100 : 0).toFixed(1)}%</strong></div></div>
      <p class="muted">提示：1 年以上大额款项应要求专项说明，计提坏账是否充分。</p>`;
    setDownload("aging.csv", ["bucket", "count", "total"], r.buckets.map(b => [b.name, b.count, b.total.toFixed(2)]));
  }
  else if (activeTool === "strat") {
    const r = T.stratify(D, val("p-grp"), val("p-amt"));
    const st = T.describe(D.map(x => x[val("p-amt")]));
    box.innerHTML = `${resultTable(["分组", "笔数", "金额合计", "占比"], r.rows.map(x => [x.group, x.count, T.fmt(x.total), x.pct.toFixed(1) + "%"]))}
      <div class="kv"><div class="k"><span>总体合计</span><strong>${T.fmt(r.grand)}</strong></div>
      ${st ? `<div class="k"><span>均值 / 中位数</span><strong>${T.fmt(st.mean)} / ${T.fmt(st.median)}</strong></div>
      <div class="k"><span>最大 / 最小</span><strong>${T.fmt(st.max)} / ${T.fmt(st.min)}</strong></div>` : ""}</div>`;
    setDownload("stratify.csv", ["group", "count", "total", "pct"], r.rows.map(x => [x.group, x.count, x.total.toFixed(2), x.pct.toFixed(2)]));
  }
  else if (activeTool === "sample") {
    const N = parseInt(val("p-n")) || D.length;
    const conf = parseFloat(val("p-conf"));
    const tol = parseFloat(val("p-tol")) / 100, exp = parseFloat(val("p-exp")) / 100;
    const seed = parseInt(val("p-seed")) || 1;
    const s = T.sampleSize(N, conf, tol, exp);
    const picked = T.pickRandom(D, s.n, seed);
    box.innerHTML = `<div class="kv"><div class="k"><span>建议样本量</span><strong>${s.n}</strong></div>
      <div class="k"><span>参数</span><strong style="font-size:12px">N=${N}，${conf * 100}%，容忍${tol * 100}%，预期${exp * 100}%</strong></div>
      <div class="k"><span>随机种子</span><strong>${seed}</strong></div></div>
      <p class="muted">已从当前 ${D.length} 行数据中随机抽取 ${picked.length} 行（种子 ${seed}，结果可复现，请将种子记入底稿）。</p>
      ${resultTable(["抽样行号"].concat(H), picked.map(r => [r.line].concat(H.map(h => r[h]))))}`;
    setDownload("sample.csv", ["line"].concat(H), picked.map(r => [r.line].concat(H.map(h => r[h]))));
  }
  else if (activeTool === "journal") {
    const r = T.journalTests(D, val("p-dt"), val("p-amt"), val("p-desc"), parseFloat(val("p-big")) || 100000);
    const secs = [["周末/节假日入账", r.weekend], ["整数金额（千元整）", r.round], ["超过大额阈值", r.big], ["摘要为空", r.blank]];
    box.innerHTML = `<div class="kv">${secs.map(s => `<div class="k"><span>${s[0]}</span><strong>${s[1].length}</strong></div>`).join("")}</div>` +
      secs.map(s => `<h4 style="margin:12px 0 4px">${s[0]}（${s[1].length}）</h4>` +
        (s[1].length ? resultTable(["行号"].concat(H), s[1].slice(0, 100).map(x => [x.line].concat(H.map(h => x[h])))) : '<p class="muted">无</p>')).join("");
    const all = [];
    secs.forEach(s => s[1].forEach(x => all.push([s[0], x.line].concat(H.map(h => x[h])))));
    setDownload("journal_flags.csv", ["type", "line"].concat(H), all);
  }
  else if (activeTool === "tb") {
    const r = T.trialBalance(D, val("p-dr"), val("p-cr"));
    box.innerHTML = `<div class="kv"><div class="k"><span>借方合计</span><strong>${T.fmt(r.dr)}</strong></div>
      <div class="k"><span>贷方合计</span><strong>${T.fmt(r.cr)}</strong></div>
      <div class="k"><span>差额</span><strong>${T.fmt(r.diff)}</strong></div>
      <div class="k"><span>结论</span><strong>${r.balanced ? "✓ 平衡" : "✗ 不平衡"}</strong></div></div>
      ${r.badRows.length ? `<div class="notice warn">第 ${r.badRows.join("、")} 行借贷均为空或非数字，已跳过。</div>` : ""}
      ${r.balanced ? "" : '<p class="muted">不平衡时请检查：公式错误、漏行、借贷方向记反、本位币折算。</p>'}`;
  }
}

/* ---------- 底稿视图 ---------- */
let activeTpl = "bank";
function renderDocsView() {
  const el = document.getElementById("view-docs");
  el.innerHTML = `<h2>底稿文书</h2><p class="sub">填写表单 → 生成标准版式 → 打印 / 存档。支持银行函证、往来函证、监盘表、调整表。</p>
  <div class="tpl-list">${window.DocTemplates.list.map(t => `<button class="tpl-btn" data-tpl="${t.id}"><strong>${t.name}</strong><span>${t.desc}</span></button>`).join("")}</div>
  <div class="card"><h3 id="tpl-title"></h3><div id="tpl-form"></div>
    <div class="toolbar no-print"><button class="btn primary" id="btn-preview">生成文书</button><button class="btn" id="btn-print" style="display:none">打印</button></div></div>
  <div id="tpl-sheet"></div>`;
  const showForm = () => {
    const t = window.DocTemplates.list.find(x => x.id === activeTpl);
    el.querySelector("#tpl-title").textContent = t.name + " · 填写";
    el.querySelector("#tpl-form").innerHTML = window.DocTemplates.formHTML(activeTpl);
    if (activeTpl === "inv") window.DocTemplates.addInvRow();
    if (activeTpl === "adj") window.DocTemplates.addAdjRow();
  };
  el.querySelectorAll("[data-tpl]").forEach(b => { b.onclick = () => { activeTpl = b.dataset.tpl; el.querySelector("#tpl-sheet").innerHTML = ""; el.querySelector("#btn-print").style.display = "none"; showForm(); }; });
  el.querySelector("#btn-preview").onclick = () => {
    const v = window.DocTemplates.collect(activeTpl);
    el.querySelector("#tpl-sheet").innerHTML = window.DocTemplates.sheetHTML(activeTpl, v);
    el.querySelector("#btn-print").style.display = "";
    const sheet = document.getElementById("tpl-sheet");
    if (sheet && sheet.scrollIntoView) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  el.querySelector("#btn-print").onclick = () => {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("printing"));
    el.classList.add("printing");
    window.print();
    setTimeout(() => el.classList.remove("printing"), 500);
  };
  el.addEventListener("click", e => {
    if (e.target.hasAttribute("data-inv")) {
      if (e.target.getAttribute("data-inv") === "add") window.DocTemplates.addInvRow();
      else e.target.closest("tr").remove();
    }
    if (e.target.hasAttribute("data-adj")) {
      if (e.target.getAttribute("data-adj") === "add") window.DocTemplates.addAdjRow();
      else e.target.closest("tr").remove();
    }
  });
  showForm();
}

/* ---------- 法规视图 ---------- */
function renderLawView() {
  const el = document.getElementById("view-law");
  const render = q => {
    q = (q || "").trim();
    const stds = window.AUDIT_DATA.standards.filter(s => !q || (s.no + s.name + s.desc).indexOf(q) !== -1);
    const tops = window.AUDIT_DATA.topics.filter(t => !q || (t.tag + t.title + t.body).indexOf(q) !== -1);
    el.querySelector("#law-result").innerHTML =
      (tops.length ? "<h3>实务指引</h3>" + tops.map(t => `<div class="law-item"><span class="no">${esc(t.tag)}</span><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div>`).join("") : "") +
      (stds.length ? "<h3>审计准则</h3>" + stds.map(s => `<div class="law-item"><span class="no">CSA ${esc(s.no)}</span><h4>${esc(s.name)}</h4><p>${esc(s.desc)}</p><div class="procs">关键程序：${esc(s.procs)}</div></div>`).join("") : "") +
      (!stds.length && !tops.length ? '<div class="notice">没有匹配结果，换个关键词试试（如：函证、存货、收入）。</div>' : "");
  };
  el.innerHTML = `<h2>法规速查</h2><p class="sub">中国注册会计师审计准则号 + 高频实务指引，离线可用。注意：此处为学习速查，执业请以准则原文为准。</p>
  <div class="search-row"><input id="law-q" placeholder="搜索：函证 / 存货 / 收入 / 1501…"><button class="btn primary" id="law-go">搜索</button></div>
  <div id="law-result"></div>`;
  el.querySelector("#law-go").onclick = () => render(el.querySelector("#law-q").value);
  el.querySelector("#law-q").addEventListener("keydown", e => { if (e.key === "Enter") render(e.target.value); });
  render("");
}

/* ---------- 启动 ---------- */
renderDataView();
renderDocsView();
renderLawView();
window.AuditAI.updateDot();

window.AuditApp = { get dataset() { return dataset; }, TOOLS };
})();
