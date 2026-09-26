/* AI 问答：DeepSeek / Ollama / 自定义 OpenAI 兼容接口 */
window.AuditAI = (() => {
"use strict";
const LS_SETTINGS = "audit_ai_settings_v1";
const LS_CONVS = "audit_ai_convs_v1";

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}"); } catch (e) {}
  return Object.assign({
    provider: "deepseek",
    deepseekKey: "", deepseekModel: "deepseek-chat",
    ollamaUrl: "http://localhost:11434", ollamaModel: "qwen2.5:7b",
    customUrl: "", customKey: "", customModel: ""
  }, s);
}
function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }
let settings = loadSettings();

function loadConvs() {
  try { return JSON.parse(localStorage.getItem(LS_CONVS) || "[]"); } catch (e) { return []; }
}
function saveConvs(c) { localStorage.setItem(LS_CONVS, JSON.stringify(c)); }
let convs = loadConvs();
let activeId = convs.length ? convs[0].id : null;

function esc(s) { return String(s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function uid() { return "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }
function activeConv() { return convs.find(c => c.id === activeId) || null; }

/* ---------- 本机配置检测 ---------- */
function detectSpecs() {
  const cores = navigator.hardwareConcurrency || 0;
  const mem = navigator.deviceMemory || 0; // GB，可能 undefined
  let tierIdx = 1, note;
  if (mem) {
    tierIdx = mem <= 8 ? 0 : mem <= 16 ? 1 : 2;
    note = "检测到内存约 " + mem + "GB，CPU " + (cores || "?") + " 核";
  } else if (cores) {
    tierIdx = cores >= 8 ? 1 : 0;
    note = "检测到 CPU " + cores + " 核（浏览器未提供内存信息，按 CPU 保守推荐）";
  } else {
    tierIdx = 0;
    note = "浏览器未提供硬件信息，按保守配置推荐";
  }
  return { cores, mem, tierIdx, note };
}

/* ---------- Ollama API ---------- */
async function ollamaTags() {
  const r = await fetch(settings.ollamaUrl.replace(/\/$/, "") + "/api/tags");
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return (j.models || []).map(m => m.name);
}
async function ollamaPull(name, onProgress) {
  const r = await fetch(settings.ollamaUrl.replace(/\/$/, "") + "/api/pull", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true })
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const ln of lines) {
      if (!ln.trim()) continue;
      try {
        const j = JSON.parse(ln);
        if (j.error) throw new Error(j.error);
        if (j.total) onProgress(j.completed / j.total, j.status || "");
        else onProgress(null, j.status || "");
        if (j.status && /success/i.test(j.status)) onProgress(1, "下载完成");
      } catch (e) { if (e.message && e.message !== ln) throw e; }
    }
  }
  onProgress(1, "下载完成");
}
async function ollamaDelete(name) {
  const r = await fetch(settings.ollamaUrl.replace(/\/$/, "") + "/api/delete", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
}

/* ---------- 聊天发送（流式） ---------- */
async function streamOpenAI(url, key, model, messages, onToken) {
  const r = await fetch(url.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.3 })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("HTTP " + r.status + " " + t.slice(0, 200));
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const line = p.trim().split("\n").map(x => x.trim()).find(x => x.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const tok = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || "";
        if (tok) { full += tok; onToken(tok); }
      } catch (e) { /* 忽略半包 */ }
    }
  }
  return full;
}
async function streamOllama(model, messages, onToken) {
  const r = await fetch(settings.ollamaUrl.replace(/\/$/, "") + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("HTTP " + r.status + " " + t.slice(0, 200));
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const ln of lines) {
      if (!ln.trim()) continue;
      let j;
      try { j = JSON.parse(ln); } catch (e) { continue; /* 半包，下一轮再拼 */ }
      if (j.error) throw new Error(j.error);
      const tok = (j.message && j.message.content) || "";
      if (tok) { full += tok; onToken(tok); }
    }
  }
  return full;
}

function providerHint(err) {
  const m = String((err && err.message) || err);
  if (settings.provider === "ollama") {
    if (/Failed to fetch|NetworkError|Load failed/i.test(m))
      return "连不上 Ollama：1）确认本机已安装并运行 Ollama（任务栏图标）；2）本页地址若非 localhost，需设置环境变量 OLLAMA_ORIGINS 允许跨域后重启 Ollama。";
    if (/404/i.test(m)) return "模型不存在：请先在下方模型管理中下载该模型，或检查模型名是否写对。";
  } else {
    if (/Failed to fetch|NetworkError/i.test(m))
      return "网络请求失败：检查网络/代理设置（系统代理 7897），或确认 API 地址正确。";
    if (/401/i.test(m)) return "API Key 无效（401）：请到设置页更新 Key。";
    if (/402|429/i.test(m)) return "余额不足或触发限流：请检查账户余额后重试。";
  }
  return m;
}

/* ---------- 视图：设置（含 Ollama 模型管理） ---------- */
function renderSettings(el) {
  const s = settings;
  const spec = detectSpecs();
  el.innerHTML = `
  <h2>设置</h2><p class="sub">AI 服务配置 · 均保存在本机浏览器，不上传任何数据</p>
  <div class="card"><h3>AI 服务商</h3>
    <div class="field"><label>默认服务商</label>
      <select id="set-provider">
        <option value="deepseek"${s.provider === "deepseek" ? " selected" : ""}>DeepSeek（在线，需 Key）</option>
        <option value="ollama"${s.provider === "ollama" ? " selected" : ""}>Ollama 本地模型（离线免费）</option>
        <option value="custom"${s.provider === "custom" ? " selected" : ""}>自定义 OpenAI 兼容接口</option>
      </select></div>
    <div class="row">
      <div class="field"><label>DeepSeek API Key</label><input id="set-dskey" type="password" value="${esc(s.deepseekKey)}" placeholder="sk-..." style="min-width:260px"></div>
      <div class="field"><label>DeepSeek 模型</label><select id="set-dsmodel">
        <option${s.deepseekModel === "deepseek-chat" ? " selected" : ""}>deepseek-chat</option>
        <option${s.deepseekModel === "deepseek-reasoner" ? " selected" : ""}>deepseek-reasoner</option>
      </select></div>
    </div>
    <div class="row">
      <div class="field"><label>Ollama 服务地址</label><input id="set-ollamaurl" value="${esc(s.ollamaUrl)}" style="min-width:260px"></div>
      <div class="field"><label>Ollama 默认模型</label><input id="set-ollamamodel" value="${esc(s.ollamaModel)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>自定义接口地址（到 /v1）</label><input id="set-customurl" value="${esc(s.customUrl)}" placeholder="https://.../v1" style="min-width:260px"></div>
      <div class="field"><label>自定义 Key</label><input id="set-customkey" type="password" value="${esc(s.customKey)}"></div>
      <div class="field"><label>自定义模型名</label><input id="set-custommodel" value="${esc(s.customModel)}"></div>
    </div>
    <div class="toolbar"><button class="btn primary" id="btn-save-settings">保存设置</button></div>
  </div>
  <div class="card"><h3>Ollama 本地模型管理</h3>
    <p class="hint">先到 <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> 安装 Ollama 并启动，再在此页下载模型。</p>
    <div class="spec-box" id="spec-box">${esc(spec.note)}</div>
    <div class="toolbar"><button class="btn small" id="btn-ollama-refresh">刷新已安装列表</button><span class="muted" id="ollama-status"></span></div>
    <div id="installed-list"></div>
    <hr class="sep">
    <h3 style="font-size:14px">按配置推荐下载</h3>
    <div id="tier-list">${window.AUDIT_DATA.ollamaTiers.map((t, i) => `
      <div class="tier"${i === spec.tierIdx ? ' style="border-color:var(--accent)"' : ""}>
        <strong>${esc(t.tier)}${i === spec.tierIdx ? ' <span class="pill info">推荐</span>' : ""}</strong>
        <p>${esc(t.desc)}</p>
        <div class="models">${t.models.map(m => `<button data-pull="${esc(m.name)}" title="${esc(m.size + " · " + m.use)}">${esc(m.name)}</button>`).join("")}</div>
      </div>`).join("")}</div>
    <div id="pull-box" style="display:none"><div class="muted" id="pull-text"></div><div class="progress"><i id="pull-bar"></i></div></div>
  </div>`;

  el.querySelector("#btn-save-settings").onclick = () => {
    settings.provider = el.querySelector("#set-provider").value;
    settings.deepseekKey = el.querySelector("#set-dskey").value.trim();
    settings.deepseekModel = el.querySelector("#set-dsmodel").value;
    settings.ollamaUrl = el.querySelector("#set-ollamaurl").value.trim().replace(/\/$/, "") || "http://localhost:11434";
    settings.ollamaModel = el.querySelector("#set-ollamamodel").value.trim() || "qwen2.5:7b";
    settings.customUrl = el.querySelector("#set-customurl").value.trim().replace(/\/$/, "");
    settings.customKey = el.querySelector("#set-customkey").value.trim();
    settings.customModel = el.querySelector("#set-custommodel").value.trim();
    saveSettings(settings);
    updateDot();
    toast("设置已保存到本机");
  };
  el.querySelector("#btn-ollama-refresh").onclick = () => refreshInstalled(el);
  el.querySelectorAll("[data-pull]").forEach(b => { b.onclick = () => pullModel(el, b.getAttribute("data-pull")); });
  refreshInstalled(el);
}

async function refreshInstalled(el) {
  const box = el.querySelector("#installed-list");
  const st = el.querySelector("#ollama-status");
  st.textContent = "连接中…";
  try {
    const names = await ollamaTags();
    box.innerHTML = names.length ? names.map(n => `
      <div class="tier"><strong>${esc(n)}</strong>
      <div class="toolbar"><button class="btn small" data-use="${esc(n)}">设为对话模型</button><button class="btn small danger" data-del="${esc(n)}">删除</button></div></div>`).join("")
      : '<div class="notice">尚未安装任何模型，请从下方推荐中下载一个。</div>';
    st.textContent = "已连接，共 " + names.length + " 个模型";
    box.querySelectorAll("[data-use]").forEach(b => { b.onclick = () => { settings.ollamaModel = b.getAttribute("data-use"); settings.provider = "ollama"; saveSettings(settings); updateDot(); toast("已切换对话模型：" + settings.ollamaModel); }; });
    box.querySelectorAll("[data-del]").forEach(b => { b.onclick = async () => {
      if (!confirm("确定删除模型 " + b.getAttribute("data-del") + " 吗？")) return;
      try { await ollamaDelete(b.getAttribute("data-del")); toast("已删除"); refreshInstalled(el); }
      catch (e) { toast("删除失败：" + e.message); }
    }; });
  } catch (e) {
    st.textContent = "连接失败";
    box.innerHTML = '<div class="notice warn">连不上 Ollama 服务（' + esc(settings.ollamaUrl) + '）。请确认 Ollama 已安装并处于运行中；若本页面不是通过 localhost 打开，还需设置 OLLAMA_ORIGINS 环境变量允许跨域。</div>';
  }
}

async function pullModel(el, name) {
  const box = el.querySelector("#pull-box"), bar = el.querySelector("#pull-bar"), txt = el.querySelector("#pull-text");
  box.style.display = "block"; bar.style.width = "0"; txt.textContent = "开始下载 " + name + " …";
  try {
    await ollamaPull(name, (p, status) => {
      if (p !== null && p !== undefined) bar.style.width = Math.round(p * 100) + "%";
      txt.textContent = name + " · " + status + (p !== null && p !== undefined ? " " + Math.round(p * 100) + "%" : "");
    });
    toast("模型下载完成：" + name);
    refreshInstalled(el);
  } catch (e) { toast("下载失败：" + e.message); }
  setTimeout(() => { box.style.display = "none"; }, 3000);
}

/* ---------- 视图：AI 问答 ---------- */
function currentModel() {
  if (settings.provider === "deepseek") return settings.deepseekModel || "deepseek-chat";
  if (settings.provider === "ollama") return settings.ollamaModel || "qwen2.5:7b";
  return settings.customModel || "";
}
function renderAI(el) {
  el.innerHTML = `
  <h2>AI 问答</h2><p class="sub">审计实务问答 · 当前：${esc(settings.provider === "deepseek" ? "DeepSeek" : settings.provider === "ollama" ? "Ollama 本地" : "自定义接口")} / ${esc(currentModel())}</p>
  <div class="ai-wrap">
    <div class="card chat-list">
      <div class="toolbar" style="margin-top:0"><button class="btn small primary" id="btn-newchat">新对话</button></div>
      <div id="conv-list">${convs.map(c => `<div class="conv${c.id === activeId ? " active" : ""}" data-conv="${c.id}"><span>${esc(c.title)}</span><button class="del" data-delconv="${c.id}">×</button></div>`).join("") || '<div class="muted">暂无对话</div>'}</div>
    </div>
    <div class="card chat-box">
      <div class="quick-prompts">${window.AUDIT_DATA.quickPrompts.map(q => `<button data-q="${esc(q)}">${esc(q.length > 18 ? q.slice(0, 18) + "…" : q)}</button>`).join("")}</div>
      <div id="chat-log"></div>
      <div class="chat-input">
        <textarea id="chat-in" placeholder="输入审计问题，回车发送…"></textarea>
        <button class="btn primary" id="btn-send">发送</button>
      </div>
    </div>
  </div>`;
  paintLog(el);
  el.querySelector("#btn-newchat").onclick = () => {
    const c = { id: uid(), title: "新对话", messages: [] };
    convs.unshift(c); activeId = c.id; saveConvs(convs);
    renderAI(el);
    const nav = document.querySelector('[data-view="ai"]'); if (nav) { document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active")); nav.classList.add("active"); }
  };
  el.querySelectorAll("[data-conv]").forEach(dv => { dv.onclick = e => {
    if (e.target.hasAttribute("data-delconv")) return;
    activeId = dv.getAttribute("data-conv"); saveConvs(convs); renderAI(el);
  }; });
  el.querySelectorAll("[data-delconv]").forEach(b => { b.onclick = () => {
    convs = convs.filter(c => c.id !== b.getAttribute("data-delconv"));
    if (activeId === b.getAttribute("data-delconv")) activeId = convs.length ? convs[0].id : null;
    saveConvs(convs); renderAI(el);
  }; });
  el.querySelectorAll("[data-q]").forEach(b => { b.onclick = () => { el.querySelector("#chat-in").value = b.getAttribute("data-q"); send(el); }; });
  el.querySelector("#btn-send").onclick = () => send(el);
  el.querySelector("#chat-in").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(el); }
  });
}
function paintLog(el) {
  const log = el.querySelector("#chat-log");
  const c = activeConv();
  if (!c || !c.messages.length) {
    log.innerHTML = '<div class="msg sys">在下方输入审计问题开始对话。对话记录仅保存在本机浏览器。</div>';
    return;
  }
  log.innerHTML = c.messages.map(m => `<div class="msg ${m.role === "user" ? "user" : "ai"}"><span class="role">${m.role === "user" ? "我" : "AI 助手"}</span>${esc(m.content)}</div>`).join("");
  log.scrollTop = log.scrollHeight;
}
let sending = false;
async function send(el) {
  if (sending) return;
  const input = el.querySelector("#chat-in");
  const q = input.value.trim();
  if (!q) return;
  let c = activeConv();
  if (!c) { c = { id: uid(), title: q.slice(0, 20), messages: [] }; convs.unshift(c); activeId = c.id; }
  if (!c.messages.length) c.title = q.slice(0, 20);
  c.messages.push({ role: "user", content: q });
  input.value = "";
  sending = true;
  paintLog(el);
  const log = el.querySelector("#chat-log");
  const aiDiv = document.createElement("div");
  aiDiv.className = "msg ai";
  aiDiv.innerHTML = '<span class="role">AI 助手</span><span class="body">思考中…</span>';
  log.appendChild(aiDiv);
  log.scrollTop = log.scrollHeight;
  const body = aiDiv.querySelector(".body");
  let full = "";
  const sys = window.AUDIT_DATA.auditSystemPrompt;
  const msgs = [{ role: "system", content: sys }].concat(c.messages.map(m => ({ role: m.role, content: m.content })));
  try {
    if (settings.provider === "ollama") {
      if (!settings.ollamaModel) throw new Error("尚未选择 Ollama 模型，请到设置页下载并选择。");
      full = await streamOllama(currentModel(), msgs, tok => { if (body.textContent === "思考中…") body.textContent = ""; body.textContent += tok; log.scrollTop = log.scrollHeight; });
      if (!full) { body.textContent = "(空回复)"; full = "(空回复)"; }
    } else {
      const url = settings.provider === "deepseek" ? "https://api.deepseek.com/v1" : settings.customUrl;
      const key = settings.provider === "deepseek" ? settings.deepseekKey : settings.customKey;
      if (settings.provider === "deepseek" && !key) throw new Error("尚未填写 DeepSeek API Key，请到设置页填写。");
      if (settings.provider === "custom" && !url) throw new Error("尚未填写自定义接口地址，请到设置页填写。");
      full = await streamOpenAI(url, key, currentModel(), msgs, tok => { body.textContent = (body.textContent === "思考中…" ? "" : body.textContent) + tok; log.scrollTop = log.scrollHeight; });
      if (!full) body.textContent = "(空回复)";
    }
  } catch (e) {
    body.textContent = "出错了：" + providerHint(e);
    full = body.textContent;
  }
  c.messages.push({ role: "assistant", content: full });
  saveConvs(convs);
  sending = false;
  renderAI(el);
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#20293a;color:#fff;padding:9px 18px;border-radius:6px;font-size:13px;z-index:9999";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function updateDot() {
  const dot = document.getElementById("ai-dot");
  if (!dot) return;
  const ok = settings.provider === "deepseek" ? !!settings.deepseekKey
    : settings.provider === "ollama" ? !!settings.ollamaModel
    : !!(settings.customUrl && settings.customModel);
  dot.className = "ai-dot" + (ok ? " on" : "");
}

return { renderSettings, renderAI, updateDot, get settings() { return settings; }, ollamaTags };
})();
