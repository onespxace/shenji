/* 底稿文书：函证/盘点/调整表 —— 表单填写 → 打印版式 */
window.DocTemplates = (() => {
"use strict";
const esc = s => String(s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const list = [
  { id: "bank", name: "银行询证函", desc: "银行存款、借款、担保、理财全覆盖" },
  { id: "ar", name: "往来款询证函", desc: "应收/应付/预付等往来款函证" },
  { id: "inv", name: "存货监盘表", desc: "盘点记录、差异、截止号码" },
  { id: "adj", name: "审计调整汇总表", desc: "可增删行，自动合计借贷" }
];

function today() {
  const d = new Date();
  return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
}

function field(id, label, val, ph) {
  return `<div class="field"><label>${label}</label><input id="tpl-${id}" value="${esc(val || "")}" placeholder="${esc(ph || "")}"></div>`;
}

function formHTML(id) {
  if (id === "bank") return `<div class="row">
    ${field("firm", "会计师事务所", "", "如：××会计师事务所")}
    ${field("bank", "被函证银行", "", "如：××银行××支行")}
    ${field("client", "被审计单位", "", "如：××股份有限公司")}
    ${field("date", "基准日", "", "如：2025年12月31日")}
    ${field("no", "函证编号", "YH-001", "")}
  </div>`;
  if (id === "ar") return `<div class="row">
    ${field("firm", "会计师事务所", "", "")}
    ${field("target", "被函证单位", "", "如：××客户公司")}
    ${field("client", "被审计单位", "", "")}
    ${field("subject", "往来科目", "应收账款", "如：应收账款/预付账款")}
    ${field("amount", "账面余额（元）", "", "如：1,250,000.00")}
    ${field("date", "基准日", "", "如：2025年12月31日")}
    ${field("no", "函证编号", "WZ-001", "")}
  </div>`;
  if (id === "inv") return `<div class="row">
    ${field("client", "被审计单位", "", "")}
    ${field("place", "盘点地点", "", "如：××仓库")}
    ${field("date", "盘点日期", "", "")}
    ${field("scope", "盘点范围", "", "如：全部存货/抽盘A类")}
    ${field("auditor", "监盘人", "", "")}
    ${field("keeper", "仓管陪同", "", "")}
  </div>
  <div class="hint muted">盘点明细行请在下方表格中填写（点击“加一行”）。</div>
  <table class="data" id="inv-table"><thead><tr><th class="l">存货名称/编号</th><th>账面数量</th><th>实盘数量</th><th>差异</th><th class="l">备注</th><th class="l"></th></tr></thead><tbody></tbody></table>
  <div class="toolbar"><button class="btn small" data-inv="add">加一行</button></div>`;
  if (id === "adj") return `<div class="row">
    ${field("client", "被审计单位", "", "")}
    ${field("period", "审计期间", "", "如：2025年度")}
    ${field("firm", "会计师事务所", "", "")}
  </div>
  <table class="data" id="adj-table"><thead><tr><th class="l">调整事项说明</th><th class="l">借方科目</th><th>借方金额</th><th class="l">贷方科目</th><th>贷方金额</th><th class="l"></th></tr></thead><tbody></tbody></table>
  <div class="toolbar"><button class="btn small" data-adj="add">加一行</button></div>`;
  return "";
}

function sheetHTML(id, v) {
  const t = today();
  if (id === "bank") return `<div class="sheet"><div class="sheet-no">编号：${esc(v.no)}</div>
    <h2>银行询证函</h2>
    <p><strong>${esc(v.bank)}</strong>：</p>
    <p>本会计师事务所（${esc(v.firm)}）受托审计<strong>${esc(v.client)}</strong>的财务报表。按照中国注册会计师审计准则的要求，应当询证其与贵行相关的账户余额等信息。现需向贵行函证截至 <strong>${esc(v.date)}</strong> 的下列信息，请直接回函至本所。回函地址以本函落款为准，回函请加盖贵行业务章。</p>
    <table><tr><th style="width:45%">项目</th><th>请贵行填写（金额：人民币元）</th></tr>
    <tr><td>1. 银行存款（含定期、通知、保证金户）余额</td><td></td></tr>
    <tr><td>2. 短期借款 / 长期借款余额及担保情况</td><td></td></tr>
    <tr><td>3. 银行承兑汇票、信用证、保函余额</td><td></td></tr>
    <tr><td>4. 委托理财、结构性存款余额</td><td></td></tr>
    <tr><td>5. 账户受限、冻结、质押情况说明</td><td></td></tr>
    <tr><td>6. 其他需说明事项</td><td></td></tr></table>
    <p>发函日期：${esc(t)}&nbsp;&nbsp;&nbsp;&nbsp;经办注册会计师（签章）：</p>
    <div class="sign"><span>会计师事务所（盖章）：</span><span>银行回函（盖章）：&nbsp;&nbsp;&nbsp;&nbsp;经办人：&nbsp;&nbsp;&nbsp;&nbsp;日期：</span></div>
    <p class="muted">注：本函一式两份。请贵行核对后一份留存，一份直接寄回本所，切勿交被审计单位转交。</p></div>`;
  if (id === "ar") return `<div class="sheet"><div class="sheet-no">编号：${esc(v.no)}</div>
    <h2>往来款项询证函</h2>
    <p><strong>${esc(v.target)}</strong>：</p>
    <p>本会计师事务所（${esc(v.firm)}）受托审计<strong>${esc(v.client)}</strong>的财务报表。按审计准则要求，需向贵单位函证截至 <strong>${esc(v.date)}</strong> 与其往来款项余额。下列信息出自其账簿记录，如与贵单位记录相符请签章确认；如有不符请在“贵单位记录”栏列明。</p>
    <table><tr><th>往来科目</th><th>账面余额（元）</th><th>贵单位记录（元）</th><th>差异说明</th></tr>
    <tr><td>${esc(v.subject)}</td><td>${esc(v.amount)}</td><td></td><td></td></tr></table>
    <p>发函日期：${esc(t)}&nbsp;&nbsp;&nbsp;&nbsp;经办注册会计师（签章）：</p>
    <div class="sign"><span>会计师事务所（盖章）：</span><span>被函证单位（盖章）：&nbsp;&nbsp;&nbsp;&nbsp;经办人：&nbsp;&nbsp;&nbsp;&nbsp;日期：</span></div></div>`;
  if (id === "inv") {
    const rows = v.rows.map((r, i) => `<tr><td style="text-align:left">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td style="text-align:left">${esc(r[4])}</td></tr>`).join("");
    return `<div class="sheet"><h2>存货监盘表</h2>
    <p>被审计单位：${esc(v.client)}&nbsp;&nbsp;盘点地点：${esc(v.place)}&nbsp;&nbsp;盘点日期：${esc(v.date)}&nbsp;&nbsp;盘点范围：${esc(v.scope)}</p>
    <table><tr><th>序号</th><th style="text-align:left">存货名称/编号</th><th>账面数量</th><th>实盘数量</th><th>差异</th><th style="text-align:left">备注</th></tr>
    ${rows || '<tr><td colspan="6" style="height:120px"></td></tr>'}</table>
    <p>截止号码：入库单最后一号______　出库单最后一号______　（截止日前后各抽查 5 张，附复印件）</p>
    <p>盘点结论：□账实相符　□存在差异（见备注，已跟进）</p>
    <div class="sign"><span>监盘人：${esc(v.auditor)}　日期：</span><span>仓管陪同：${esc(v.keeper)}　日期：</span></div></div>`;
  }
  if (id === "adj") {
    let dr = 0, cr = 0;
    const rows = v.rows.map(r => {
      dr += parseFloat(String(r[2]).replace(/,/g, "")) || 0;
      cr += parseFloat(String(r[4]).replace(/,/g, "")) || 0;
      return `<tr><td style="text-align:left">${esc(r[0])}</td><td style="text-align:left">${esc(r[1])}</td><td>${esc(r[2])}</td><td style="text-align:left">${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`;
    }).join("");
    const ok = Math.abs(dr - cr) < 0.01;
    return `<div class="sheet"><h2>审计调整汇总表</h2>
    <p>被审计单位：${esc(v.client)}&nbsp;&nbsp;审计期间：${esc(v.period)}&nbsp;&nbsp;编制：${esc(v.firm)}</p>
    <table><tr><th>序号</th><th style="text-align:left">调整事项说明</th><th style="text-align:left">借方科目</th><th>借方金额</th><th style="text-align:left">贷方科目</th><th>贷方金额</th></tr>
    ${rows}<tr><td colspan="3"><strong>合计</strong></td><td><strong>${dr.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</strong></td><td></td><td><strong>${cr.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</strong></td></tr></table>
    <p>借贷平衡检查：${ok ? "✓ 平衡" : "✗ 不平衡，差额 " + Math.abs(dr - cr).toFixed(2)}</p>
    <div class="sign"><span>编制人：　日期：</span><span>复核人：　日期：</span></div></div>`;
  }
  return "";
}

function collect(id) {
  const g = x => { const el = document.getElementById("tpl-" + x); return el ? el.value.trim() : ""; };
  const v = { firm: g("firm"), bank: g("bank"), client: g("client"), date: g("date"), no: g("no"), target: g("target"), subject: g("subject"), amount: g("amount"), place: g("place"), scope: g("scope"), auditor: g("auditor"), keeper: g("keeper"), period: g("period"), rows: [] };
  if (id === "inv") {
    document.querySelectorAll("#inv-table tbody tr").forEach(tr => {
      const cells = tr.querySelectorAll("input");
      v.rows.push([cells[0].value, cells[1].value, cells[2].value, cells[3].value, cells[4].value]);
    });
  }
  if (id === "adj") {
    document.querySelectorAll("#adj-table tbody tr").forEach(tr => {
      const cells = tr.querySelectorAll("input");
      v.rows.push([cells[0].value, cells[1].value, cells[2].value, cells[3].value, cells[4].value]);
    });
  }
  return v;
}

function addInvRow() {
  const tb = document.querySelector("#inv-table tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input style="width:150px" placeholder="名称/编号"></td><td><input style="width:80px"></td><td><input style="width:80px"></td><td><input style="width:80px"></td><td><input style="width:120px"></td><td><button class="btn small danger" data-inv="del">删</button></td>`;
  tb.appendChild(tr);
}
function addAdjRow() {
  const tb = document.querySelector("#adj-table tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input style="width:160px" placeholder="调整说明"></td><td><input style="width:100px"></td><td><input style="width:90px"></td><td><input style="width:100px"></td><td><input style="width:90px"></td><td><button class="btn small danger" data-adj="del">删</button></td>`;
  tb.appendChild(tr);
}

return { list, formHTML, sheetHTML, collect, addInvRow, addAdjRow };
})();
