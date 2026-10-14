const STORAGE_KEY = "ai-secretary-data";

const defaultState = () => ({
  currency: "HK$",
  transactions: [],
  accounts: [],
  bills: [],
  recurring: [],
  catBudgets: {},
  budget: 0,
  goals: [],
  weights: [],
  weightGoal: { height: null, target: null },
  profile: { height: null, gender: "male", age: null, activity: 1.375 },
  projects: [],
  bucket: [],
  plan: [],
  planBaseline: {},
  events: [],
});

let state = loadState();

function normalize(data) {
  const base = defaultState();
  const { ai, youtube, ...rest } = data;
  return { ...base, ...rest, profile: { ...base.profile, ...(data.profile || {}) } };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

function save(msg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (msg) Effects.toast(msg);
}

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toLocaleDateString("sv-SE");
const thisMonth = () => today().slice(0, 7);
const money = (n) =>
  `${state.currency}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = (n) => `${state.currency}${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const card = (label, value, sub = "", accent = "") =>
  `<div class="card" ${accent ? `style="--accent:${accent}"` : ""}>
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;

const C = { cyan: "#2a8f86", magenta: "#c0436d", violet: "#7d55a8", green: "#4e8f2c", red: "#c0392b", amber: "#d48a14", blue: "#3a6fb0" };

function lastMonths(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthTotals(month) {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    if (!t.date.startsWith(month)) continue;
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }
  return { income, expense };
}

function groupByCategory(list) {
  const out = {};
  list.forEach((t) => (out[t.category] = (out[t.category] || 0) + t.amount));
  return Object.entries(out)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

const DEBT_TYPES = ["負債", "信用卡"];
const isDebt = (a) => DEBT_TYPES.includes(a.type);

function nextDue(day) {
  if (!day) return null;
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), 1);
  const at = (d) => new Date(d.getFullYear(), d.getMonth(), Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  let due = at(t);
  if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) due = at(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  return { date: due, days: Math.round((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000) };
}

const round2 = (n) => Math.round(n * 100) / 100;

function moveMoney(id, flow) {
  const a = id && state.accounts.find((x) => x.id === id);
  if (!a) return;
  a.balance = round2(a.balance + (isDebt(a) ? -flow : flow));
  a.updated = today();
}

function applyTx(t, sign = 1) {
  const amt = t.amount * sign;
  if (t.type === "transfer") {
    moveMoney(t.accountId, -amt);
    moveMoney(t.toAccountId, amt);
  } else {
    moveMoney(t.accountId, t.type === "income" ? amt : -amt);
  }
}

const EXPENSE_CATS = ["飲食", "交通", "購物", "日用品", "娛樂", "醫療", "住屋", "水電煤", "電話上網", "保險", "交稅", "教育", "運動", "美容", "社交", "禮物", "旅行", "訂閱", "家用", "其他"];
const INCOME_CATS = ["薪金", "花紅", "兼職", "利息", "投資", "YouTube", "退款", "利是", "其他"];

function addTx(t) {
  const tx = { id: uid(), date: today(), note: "", accountId: "", ...t };
  state.transactions.push(tx);
  applyTx(tx);
  return tx;
}

function accountOptions(selected, placeholder = "") {
  const opt = (a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`;
  const assets = state.accounts.filter((a) => !isDebt(a));
  const debts = state.accounts.filter(isDebt);
  return (placeholder ? `<option value="" disabled ${selected ? "" : "selected"}>${placeholder}</option>` : "") +
    (assets.length ? `<optgroup label="帳戶">${assets.map(opt).join("")}</optgroup>` : "") +
    (debts.length ? `<optgroup label="信用卡／負債">${debts.map(opt).join("")}</optgroup>` : "");
}

const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
const nextMonthOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
function recurDate(r, month) {
  const [y, m] = month.split("-").map(Number);
  const day = r.day === "last" ? lastDayOf(y, m) : Math.min(Number(r.day), lastDayOf(y, m));
  return `${month}-${String(day).padStart(2, "0")}`;
}
function nextRecurDate(r) {
  let month = r.lastRun ? nextMonthOf(r.lastRun) : r.start.slice(0, 7);
  while (recurDate(r, month) < r.start) month = nextMonthOf(month);
  return recurDate(r, month);
}
function runRecurring() {
  let count = 0;
  for (const r of state.recurring) {
    let month = r.lastRun ? nextMonthOf(r.lastRun) : r.start.slice(0, 7);
    while (month <= thisMonth()) {
      const date = recurDate(r, month);
      if (date > today()) break;
      if (date >= r.start) {
        addTx({ type: r.type, category: r.category, amount: r.amount, accountId: r.accountId, date, note: `${r.name}（固定）` });
        count++;
      }
      r.lastRun = month;
      month = nextMonthOf(month);
    }
  }
  return count;
}

const daysUntil = (date) => Math.round((new Date(date) - new Date(today())) / 86400000);
const daysText = (d) => (d < 0 ? `已過期 ${-d} 天` : d === 0 ? "今天" : `${d} 天後`);

function billPlan() {
  const pool = {};
  state.accounts.filter((a) => !isDebt(a) && a.purpose).forEach((a) => (pool[a.purpose] = (pool[a.purpose] || 0) + a.balance));
  return state.bills
    .filter((b) => !b.paid)
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((b) => {
      const have = Math.max(0, Math.min(b.amount, pool[b.fund] || 0));
      if (b.fund) pool[b.fund] = (pool[b.fund] || 0) - have;
      const short = b.amount - have;
      const days = daysUntil(b.due);
      const perMonth = short > 0 ? short / Math.max(1, days / 30.44) : 0;
      return { ...b, have, short, days, perMonth };
    });
}

function netWorth() {
  return state.accounts.reduce((sum, a) => sum + (isDebt(a) ? -Math.abs(a.balance) : a.balance), 0);
}

function sortedWeights() {
  return [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
}

const dayMs = (date) => new Date(date).getTime();

function weightSeries(ws) {
  const points = ws.map((w) => ({ x: dayMs(w.date), y: w.weight, label: w.date.slice(5) }));
  const avg = points.map((p, i) => {
    const win = points.slice(Math.max(0, i - 6), i + 1);
    return { ...p, y: +(win.reduce((s, q) => s + q.y, 0) / win.length).toFixed(2) };
  });
  const series = [{ name: "體重", color: C.cyan, points, area: true, dots: true }];
  if (points.length >= 4) series.push({ name: "7 次移動平均", color: C.magenta, points: avg, dashed: true });
  return series;
}

function budgetRing(expense) {
  if (!(state.budget > 0)) return `<div class="chart-empty">未設定預算</div>`;
  const pct = (expense / state.budget) * 100;
  const color = pct > 100 ? C.red : pct > 80 ? C.amber : C.cyan;
  const left = state.budget - expense;
  return Charts.ring(pct, {
    color,
    sub: left >= 0 ? `剩 ${moneyShort(left)}` : `超支 ${moneyShort(-left)}`,
    label: `${moneyShort(expense)} / ${moneyShort(state.budget)}`,
  });
}

const STATUS_LABEL = { todo: "未開始", doing: "進行中", done: "已完成" };
const STATUS_COLOR = { todo: "#b8a07a", doing: C.cyan, done: C.green };

function projectStatus(p) {
  if (!p.tasks.length) {
    if (p.progress == null) return p.status || "todo";
    return p.progress >= 100 ? "done" : p.progress > 0 ? "doing" : "todo";
  }
  const done = p.tasks.filter((t) => t.done).length;
  if (done === p.tasks.length) return "done";
  return done > 0 || p.status === "doing" ? "doing" : "todo";
}

function projectPct(p) {
  if (!p.tasks.length) return p.progress ?? (projectStatus(p) === "done" ? 100 : 0);
  return (p.tasks.filter((t) => t.done).length / p.tasks.length) * 100;
}

// ---------- 路由 ----------
function route() {
  const view = location.hash.slice(1) || "dashboard";
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  document.querySelectorAll(".sidebar a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  Effects.enterView(document.getElementById(`view-${view}`));
}
window.addEventListener("hashchange", route);

// ---------- 時鐘 ----------
function tick() {
  const now = new Date();
  const h = now.getHours();
  const hello = h < 5 ? "夜深了，好好休息" : h < 12 ? "早安。新的一天開始了" : h < 18 ? "午安" : "晚安";
  const week = "日一二三四五六"[now.getDay()];
  $("#greeting").innerHTML = `${hello}<small>${today()} 星期${week}</small>`;
  $("#clock").textContent = now.toLocaleTimeString("en-GB");
  if (tick.day && tick.day !== today()) {
    const n = runRecurring();
    if (n) save(`已自動記錄 ${n} 筆固定收支`);
    checkBackup();
  }
  tick.day = today();
}
setInterval(tick, 1000);

// ---------- 渲染 ----------
function render() {
  renderDashboard();
  renderLedger();
  renderFinance();
  renderRecurring();
  renderWeight();
  renderProjects();
  renderBucket();
  renderPlan();
  renderTime();
  $("#currency-form").elements.currency.value = state.currency;
}

function renderDashboard() {
  const month = thisMonth();
  const { income, expense } = monthTotals(month);
  const ws = sortedWeights();
  const latest = ws.at(-1);
  const active = state.projects.filter((p) => projectStatus(p) !== "done");

  $("#dash-cards").innerHTML =
    card("本月收入", money(income), "", C.cyan) +
    card("本月支出", money(expense), state.budget ? `預算 ${money(state.budget)}` : "", C.magenta) +
    card("淨資產", money(netWorth()), "", C.violet) +
    card("最新體重", latest ? `${latest.weight} kg` : "—", latest ? latest.date : "", C.green) +
    card("進行中項目", active.length, `共 ${state.projects.length} 個項目`, C.amber);

  const months = lastMonths(6);
  const totals = months.map(monthTotals);
  $("#dash-cashflow").innerHTML = Charts.bars(
    months.map((m) => m.slice(2).replace("-", "/")),
    [
      { name: "收入", color: C.cyan, values: totals.map((t) => t.income) },
      { name: "支出", color: C.magenta, values: totals.map((t) => t.expense) },
    ],
    { fmt: money }
  );

  const expenses = state.transactions.filter((t) => t.type === "expense" && t.date.startsWith(month));
  $("#dash-donut").innerHTML = Charts.donut(groupByCategory(expenses).slice(0, 6), {
    center: moneyShort(expense),
    sub: "本月支出",
    fmt: money,
  });

  $("#dash-weight").innerHTML = Charts.line(weightSeries(ws.slice(-30)), {
    target: state.weightGoal.target,
    fmt: (v) => `${v} kg`,
  });

  $("#dash-budget").innerHTML = budgetRing(expense);

  $("#dash-rings").innerHTML = active.length
    ? active
        .map((p) => Charts.ring(projectPct(p), { label: p.name, color: STATUS_COLOR[projectStatus(p)] }))
        .join("")
    : `<div class="chart-empty">暫無進行中的項目</div>`;

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $("#dash-recent").innerHTML = recent.length
    ? recent
        .map(
          (t) =>
            `<li><span>${t.date} · ${esc(t.type === "transfer" ? transferText(t) : t.category)}</span><span class="${t.type}">${t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}${money(t.amount)}</span></li>`
        )
        .join("")
    : `<li class="muted">暫無記錄</li>`;

  const upcoming = [
    ...active.filter((p) => p.deadline).map((p) => ({ label: `項目：${p.name}`, date: p.deadline })),
    ...billPlan().map((b) => ({ label: `付款：${b.name} ${moneyShort(b.amount)}`, date: b.due, warn: b.short > 0 })),
    ...state.plan.filter((e) => !e.done).map((e) => ({ label: `計劃：${e.note} ${moneyShort(e.amount)}`, date: e.date, warn: e.date < today() })),
    ...Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = d.toLocaleDateString("sv-SE");
      return eventsOn(ds).filter((e) => !isDoneOn(e, ds)).map((e) => ({ label: `事項：${e.start ? `${e.start} ` : ""}${e.title}`, date: ds }));
    }).flat(),
    ...state.accounts
      .filter((a) => a.type === "信用卡" && a.balance > 0 && a.dueDay)
      .map((a) => ({ label: `還卡：${a.name} ${moneyShort(a.balance)}`, date: nextDue(a.dueDay).date.toLocaleDateString("sv-SE") })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  $("#dash-projects").innerHTML = upcoming.length
    ? upcoming
        .map((u) => {
          const d = daysUntil(u.date);
          return `<li><span>${esc(u.label)}</span><span class="${d < 0 || (u.warn && d <= 30) ? "bad" : "muted"}">${u.date}（${daysText(d)}）</span></li>`;
        })
        .join("")
    : `<li class="muted">暫無即將到期事項</li>`;
}

const accName = (id) => (id ? state.accounts.find((a) => a.id === id)?.name || "（已刪除帳戶）" : "—");
const transferText = (t) => `${accName(t.accountId)} → ${accName(t.toAccountId)}`;
const TYPE_LABEL = { income: "收入", expense: "支出", transfer: "轉帳" };

function renderTxForm() {
  const f = $("#tx-form");
  const type = f.elements.type.value;
  f.dataset.mode = type;
  if (type !== "transfer") {
    const cur = $("#tx-category").value;
    const used = state.transactions.filter((t) => t.type === type).map((t) => t.category);
    const cats = [...new Set([...(type === "income" ? INCOME_CATS : EXPENSE_CATS), ...used, cur])].filter(Boolean);
    $("#cat-chips").innerHTML =
      cats.map((c) => `<button type="button" class="chip ${c === cur ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("") +
      `<button type="button" class="chip add" data-cat-custom>＋ 自訂</button>`;
  }
  const accSel = $("#tx-account");
  const toSel = $("#tx-to");
  const exists = (id) => state.accounts.some((a) => a.id === id);
  const from = [accSel.value, state.lastAccountId].find(exists) || "";
  accSel.innerHTML = accountOptions(from, type === "transfer" ? "轉出帳戶" : "選擇帳戶");
  toSel.innerHTML = accountOptions(exists(toSel.value) ? toSel.value : "", "轉入帳戶");
}

const ledgerView = { mode: "month", anchor: today() };
const ymd = (d) => d.toLocaleDateString("sv-SE");
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayDiff = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

function ledgerPeriod() {
  const { mode, anchor } = ledgerView;
  const a = parseYmd(anchor);
  const y = a.getFullYear();
  const m = a.getMonth() + 1;
  if (mode === "week") {
    const start = addDays(anchor, -((a.getDay() + 6) % 7));
    const end = addDays(start, 6);
    const md = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8))}日`;
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    return {
      start, end, label: `${start.slice(0, 4)}年 ${md(start)} – ${md(end)}`,
      buckets: labels.map((l, i) => `${l}（${Number(addDays(start, i).slice(8))}）`),
      bucketOf: (date) => dayDiff(start, date), unit: "天", labelEvery: 1, budgetFactor: (7 * 12) / 365, name: "每週",
    };
  }
  if (mode === "year") {
    return {
      start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}年`,
      buckets: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
      bucketOf: (date) => Number(date.slice(5, 7)) - 1, unit: "月", labelEvery: 1, budgetFactor: 12, name: "每年",
    };
  }
  const mm = String(m).padStart(2, "0");
  const n = lastDayOf(y, m);
  return {
    start: `${y}-${mm}-01`, end: `${y}-${mm}-${n}`, label: `${y}年${m}月`,
    buckets: Array.from({ length: n }, (_, i) => String(i + 1)),
    bucketOf: (date) => Number(date.slice(8)) - 1, unit: "天", labelEvery: 3, budgetFactor: 1, name: "每月",
  };
}

function shiftPeriod(dir) {
  const a = parseYmd(ledgerView.anchor);
  if (ledgerView.mode === "week") a.setDate(a.getDate() + 7 * dir);
  else if (ledgerView.mode === "year") a.setFullYear(a.getFullYear() + dir, 0, 1);
  else a.setMonth(a.getMonth() + dir, 1);
  ledgerView.anchor = ymd(a);
  renderLedger();
}

function renderCatBudgets(p) {
  const spent = {};
  state.transactions
    .filter((t) => t.type === "expense" && t.date >= p.start && t.date <= p.end)
    .forEach((t) => (spent[t.category] = (spent[t.category] || 0) + t.amount));
  const now = today();
  const daysLeft = now >= p.start && now <= p.end ? dayDiff(now, p.end) + 1 : 0;
  $("#catb-note").textContent = p.budgetFactor === 1 ? "" : `（每月預算按${p.name}折算）`;
  const entries = Object.entries(state.catBudgets).map(([cat, v]) => [cat, round2(v * p.budgetFactor)]);
  $("#catb-list").innerHTML = entries.length
    ? entries
        .map(([cat, limit]) => {
          const used = spent[cat] || 0;
          const pct = limit > 0 ? (used / limit) * 100 : 0;
          const left = limit - used;
          return `<div class="catb">
            <div class="catb-top"><b>${esc(cat)}</b><button class="link" data-del-catb="${esc(cat)}">移除</button></div>
            <div class="catb-amt">${money(used)}<span class="muted"> / ${money(limit)}</span></div>
            <div class="bar ${pct > 100 ? "over" : pct > 80 ? "warn" : ""}"><div style="width:${Math.min(pct, 100)}%"></div></div>
            <div class="muted tiny">${
              left < 0
                ? `<span class="bad">已超支 ${money(-left)}</span>`
                : `尚餘 ${money(left)}${daysLeft > 0 ? `，每天約 ${money(left / daysLeft)}` : ""}`
            }</div>
          </div>`;
        })
        .join("")
    : `<div class="chart-empty">暫無分類預算</div>`;
  $("#catb-cats").innerHTML = EXPENSE_CATS.map((c) => `<option value="${c}">`).join("");
}

function renderRecurring() {
  const list = [...state.recurring].sort((a, b) => (a.type === b.type ? b.amount - a.amount : a.type === "income" ? -1 : 1));
  const income = list.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const fixed = list.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const budgets = Object.values(state.catBudgets).reduce((s, v) => s + v, 0);
  const free = income - fixed - budgets;
  $("#rec-summary").innerHTML = list.length
    ? `<span>每月收入 <b class="income">${money(income)}</b></span>
       <span>固定支出 <b class="expense">${money(fixed)}</b></span>
       ${budgets ? `<span>分類預算 <b class="expense">${money(budgets)}</b></span>` : ""}
       <span>每月可儲蓄 <b class="${free >= 0 ? "good" : "bad"}">${money(free)}</b></span>`
    : "";
  const dayOptions = (sel) =>
    `<option value="last" ${sel === "last" ? "selected" : ""}>最後一天</option>` +
    Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${String(sel) === String(i + 1) ? "selected" : ""}>${i + 1} 日</option>`).join("");
  $("#rec-table").innerHTML = list.length
    ? list
        .map(
          (r) => `<tr>
        <td><b>${esc(r.name)}</b></td>
        <td><span class="tag">${esc(r.category)}</span></td>
        <td><input type="number" step="0.01" min="0" value="${r.amount}" data-rec-amount="${r.id}" class="cell-input num ${r.type}" /></td>
        <td><select class="cell-input" data-rec-acc="${r.id}">${accountOptions(r.accountId)}</select></td>
        <td><select class="cell-input" data-rec-day="${r.id}">${dayOptions(r.day)}</select></td>
        <td class="muted">${nextRecurDate(r)}</td>
        <td><button class="link" data-del-rec="${r.id}">刪除</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="muted">暫無固定收支</td></tr>`;
  const accSel = $("#rec-account");
  accSel.innerHTML = accountOptions(accSel.value, "選擇帳戶");
  const daySel = $("#rec-day");
  if (!daySel.options.length) daySel.innerHTML = dayOptions("last");
  $("#rec-cats").innerHTML = [...new Set([...EXPENSE_CATS, ...INCOME_CATS])].map((c) => `<option value="${c}">`).join("");
}

function renderFunds() {
  const assetsList = state.accounts.filter((a) => !isDebt(a));
  const liquid = assetsList.filter((a) => !a.purpose);
  const reserved = assetsList.filter((a) => a.purpose);
  const total = liquid.reduce((s, a) => s + a.balance, 0);
  const reservedSum = reserved.reduce((s, a) => s + a.balance, 0);
  const cardDebt = state.accounts.filter(isDebt).reduce((s, a) => s + Math.abs(a.balance), 0);
  if (!assetsList.length) {
    $("#tx-funds").innerHTML = `<div class="muted">請先在「理財」頁新增帳戶，即可在此查看可動資金。</div>`;
    return;
  }
  $("#tx-funds").innerHTML = `
    <div class="funds-main">
      <span class="label">可動資金</span>
      <b class="${total < 0 ? "expense" : ""}">${money(total)}</b>
      ${cardDebt > 0 ? `<span class="muted">扣除信用卡欠款後 ${money(total - cardDebt)}</span>` : ""}
    </div>
    <div class="funds-accs">
      ${liquid.map((a) => `<span class="funds-acc"><small>${esc(a.name)}</small>${money(a.balance)}</span>`).join("")}
      ${reserved.length ? `<span class="funds-acc reserved" title="${esc(reserved.map((a) => `${a.name}：${a.purpose}`).join("\n"))}"><small>已預留（${esc(reserved.map((a) => a.purpose).join("、"))}）</small>${money(reservedSum)}</span>` : ""}
    </div>`;
}

function renderLedger() {
  const p = ledgerPeriod();
  $("#period-label").textContent = p.label;
  document.querySelector(`input[name="period"][value="${ledgerView.mode}"]`).checked = true;

  renderTxForm();
  renderFunds();

  const list = state.transactions
    .filter((t) => t.date >= p.start && t.date <= p.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  const expenses = list.filter((t) => t.type === "expense");
  const incomes = list.filter((t) => t.type === "income");
  const income = incomes.reduce((s, t) => s + t.amount, 0);
  const expense = expenses.reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const now = today();
  const elapsed = now < p.start ? 0 : now > p.end ? p.buckets.length : p.bucketOf(now) + 1;
  const avgOver = Math.max(1, ledgerView.mode === "year" ? elapsed : now > p.end ? dayDiff(p.start, p.end) + 1 : dayDiff(p.start, now) + 1);

  $("#tx-cards").innerHTML =
    card("收入", money(income), `${incomes.length} 筆`, C.cyan) +
    card("支出", money(expense), `${expenses.length} 筆`, C.magenta) +
    card("結餘", money(balance), income > 0 ? `儲蓄率 ${((balance / income) * 100).toFixed(0)}%` : "", balance >= 0 ? C.green : C.red) +
    card(`${p.unit === "月" ? "月" : "日"}均支出`, money(expense / avgOver), `按 ${avgOver} ${p.unit === "月" ? "個月" : "天"}計算`, C.violet);
  renderCatBudgets(p);

  $("#tx-donut").innerHTML = Charts.donut(groupByCategory(expenses), {
    center: moneyShort(expense),
    sub: "總支出",
    fmt: money,
  });
  $("#tx-income-donut").innerHTML = Charts.donut(groupByCategory(incomes), {
    center: moneyShort(income),
    sub: "總收入",
    fmt: money,
  });

  const perBucket = Array(p.buckets.length).fill(0);
  expenses.forEach((t) => (perBucket[p.bucketOf(t.date)] += t.amount));
  $("#tx-bars-title").textContent = ledgerView.mode === "year" ? "每月支出" : "每日支出";
  $("#tx-daily").innerHTML = Charts.bars(p.buckets, [{ name: "支出", color: C.magenta, values: perBucket }], {
    fmt: money,
    labelEvery: p.labelEvery,
  });

  let running = 0;
  const cumulative = perBucket.slice(0, elapsed).map((v, i) => {
    running += v;
    return { x: i + 1, y: running, label: p.buckets[i] };
  });
  const budget = state.budget > 0 && p.budgetFactor >= 1 ? state.budget * p.budgetFactor : null;
  $("#tx-cumulative").innerHTML = Charts.line(
    [{ name: "累計支出", color: C.violet, points: cumulative, area: true }],
    { target: budget, targetLabel: "預算", fmt: money, height: 220 }
  );

  $("#tx-table").innerHTML = list.length
    ? list
        .map(
          (t) => `<tr>
        <td>${t.date}</td>
        <td class="${t.type}">${TYPE_LABEL[t.type]}</td>
        <td>${esc(t.category)}</td>
        <td class="${t.type}">${money(t.amount)}</td>
        <td class="muted">${esc(t.type === "transfer" ? transferText(t) : accName(t.accountId))}</td>
        <td>${esc(t.note)}</td>
        <td><button class="link" data-del-tx="${t.id}">刪除</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="muted">此期間暫無記錄</td></tr>`;
}

function renderFinance() {
  const assetsList = state.accounts.filter((a) => !isDebt(a));
  const cards = state.accounts.filter((a) => a.type === "信用卡");
  const assets = assetsList.reduce((s, a) => s + a.balance, 0);
  const reserved = assetsList.filter((a) => a.purpose).reduce((s, a) => s + a.balance, 0);
  const debts = state.accounts.filter(isDebt).reduce((s, a) => s + Math.abs(a.balance), 0);
  const { income, expense } = monthTotals(thisMonth());
  const savingRate = income > 0 ? (((income - expense) / income) * 100).toFixed(1) + "%" : "—";
  const dueSoon = cards
    .filter((c) => c.balance > 0 && c.dueDay)
    .map((c) => ({ c, due: nextDue(c.dueDay) }))
    .sort((a, b) => a.due.days - b.due.days)[0];
  const plan = billPlan();
  const shortTotal = plan.reduce((s, b) => s + b.short, 0);
  const nextBill = plan[0];

  $("#fin-cards").innerHTML =
    card("淨資產", money(assets - debts), `資產 ${moneyShort(assets)} − 負債 ${moneyShort(debts)}`, C.violet) +
    card("可動用", money(assets - reserved), "已扣除預留", C.cyan) +
    card("已預留", money(reserved), assetsList.filter((a) => a.purpose).map((a) => a.purpose).join("、") || "暫無", C.amber) +
    card("應付款項尚欠", money(shortTotal),
      nextBill ? `下一筆：${nextBill.name} ${daysText(nextBill.days)}` : "暫無未付款項", shortTotal > 0 ? C.red : C.green) +
    card("信用卡欠款", money(cards.reduce((s, c) => s + c.balance, 0)),
      dueSoon ? `${dueSoon.c.name} ${daysText(dueSoon.due.days)}還款` : `${cards.length} 張卡`, C.red) +
    card("本月儲蓄率", savingRate, "（收入 − 支出）÷ 收入", C.green);

  $("#fin-alloc").innerHTML = Charts.donut(
    assetsList.filter((a) => a.balance > 0).map((a) => ({ label: a.purpose ? `${a.name}（${a.purpose}）` : a.name, value: a.balance })),
    { center: moneyShort(assets), sub: "總資產", fmt: money }
  );

  $("#fin-budget").innerHTML = budgetRing(expense);

  $("#goal-rings").innerHTML = state.goals.length
    ? state.goals
        .map((g, i) =>
          Charts.ring(g.target > 0 ? (g.saved / g.target) * 100 : 0, {
            label: g.name,
            color: Charts.PALETTE[(i + 2) % Charts.PALETTE.length],
          })
        )
        .join("")
    : `<div class="chart-empty">暫無儲蓄目標</div>`;

  $("#goal-list").innerHTML = state.goals
    .map(
      (g) => `<div class="goal-row">
        <span>${esc(g.name)}</span>
        <input type="number" value="${g.saved}" data-goal-saved="${g.id}" title="已儲金額" />
        <em class="muted">/ ${moneyShort(g.target)}</em>
        <button class="link" data-del-goal="${g.id}">✕</button>
      </div>`
    )
    .join("");

  const months = lastMonths(12);
  $("#fin-monthly").innerHTML = Charts.bars(
    months.map((m) => m.slice(2).replace("-", "/")),
    [{ name: "結餘", color: C.cyan, values: months.map((m) => { const t = monthTotals(m); return t.income - t.expense; }) }],
    { fmt: money, colorFn: (v) => (v >= 0 ? C.cyan : C.red), width: 1000, height: 240 }
  );

  const purposes = [...new Set(assetsList.map((a) => a.purpose).filter(Boolean))];
  const fundSel = $("#bill-fund");
  const keepFund = fundSel.value;
  fundSel.innerHTML = `<option value="">預留帳戶（無）</option>` + purposes.map((p) => `<option value="${esc(p)}">由「${esc(p)}」帳戶支付</option>`).join("");
  fundSel.value = purposes.includes(keepFund) ? keepFund : "";

  const paid = state.bills.filter((b) => b.paid);
  const sources = assetsList.filter((a) => !a.purpose);
  $("#bill-list").innerHTML =
    (plan.length
      ? plan
          .map((b) => {
            const pct = b.amount ? (b.have / b.amount) * 100 : 0;
            const urgent = b.short > 0 && b.days <= 30;
            return `<div class="bill ${urgent ? "urgent" : ""}">
            <div class="bill-top">
              <div><b>${esc(b.name)}</b><div class="muted tiny">${b.due} 前 · ${daysText(b.days)}${b.fund ? ` · 由「${esc(b.fund)}」帳戶支付` : ""}</div></div>
              <div class="bill-amt">${money(b.amount)}</div>
            </div>
            <div class="bar ${b.short > 0 ? (urgent ? "over" : "warn") : ""}"><div style="width:${pct}%"></div></div>
            <div class="credit-line"><span>已預留 ${money(b.have)}（${pct.toFixed(0)}%）</span>
              ${b.short > 0 ? `<span class="bad">尚欠 ${money(b.short)}</span>` : `<span class="good">資金充足 ✓</span>`}</div>
            ${b.short > 0 ? `<div class="bill-tip">需於 ${daysText(b.days)}前再儲 <b>${money(b.short)}</b>，平均<b>每月 ${money(Math.ceil(b.perMonth))}</b></div>` : ""}
            ${b.fund ? `<form class="bill-add" data-bill-add="${b.id}">
              <input type="number" name="amount" step="0.01" min="0.01" placeholder="存入金額" required />
              <select name="from">
                <option value="">新收入（例如薪金）</option>
                ${sources.map((a) => `<option value="${a.id}">由 ${esc(a.name)} 轉入（${moneyShort(a.balance)}）</option>`).join("")}
              </select>
              <button type="submit" class="small">＋ 存入</button>
            </form>` : ""}
            <div class="bill-actions">
              <button class="ghost small" data-bill-paid="${b.id}">已付</button>
              <button class="link" data-del-bill="${b.id}">刪除</button>
            </div>
          </div>`;
          })
          .join("")
      : `<div class="chart-empty">暫無未付款項</div>`) +
    (paid.length
      ? `<details class="fold"><summary>已付（${paid.length}）</summary><ul class="simple-list">${paid
          .map((b) => `<li><span>${esc(b.name)} · ${money(b.amount)}</span><span class="muted">${b.paidOn || b.due} 已付 <button class="link" data-del-bill="${b.id}">刪除</button></span></li>`)
          .join("")}</ul></details>`
      : "");

  const others = state.accounts.filter((a) => a.type !== "信用卡");
  $("#acc-table").innerHTML = others.length
    ? others
        .map(
          (a) => `<tr>
        <td><b>${esc(a.name)}</b></td>
        <td><span class="tag">${esc(a.type)}</span></td>
        <td><input value="${esc(a.purpose || "")}" placeholder="—" data-acc-purpose="${a.id}" class="cell-input" /></td>
        <td><input type="number" step="0.01" value="${a.balance}" data-acc-balance="${a.id}" class="cell-input num ${isDebt(a) ? "bad" : ""}" /></td>
        <td class="muted">${a.updated || "—"}</td>
        <td><button class="link" data-del-acc="${a.id}">刪除</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="muted">暫無帳戶</td></tr>`;

  $("#cc-list").innerHTML = cards.length
    ? cards
        .map((c) => {
          const pct = c.limit ? (c.balance / c.limit) * 100 : 0;
          const due = nextDue(c.dueDay);
          const urgent = due && c.balance > 0 && due.days <= 5;
          return `<div class="cc">
          <div class="cc-head"><b>${esc(c.name)}</b><button class="link" data-del-acc="${c.id}">刪除</button></div>
          <div class="cc-owe"><span>目前欠款</span>
            <input type="number" step="0.01" min="0" value="${c.balance}" data-acc-balance="${c.id}" class="cell-input num" /></div>
          ${c.limit ? `<div class="bar ${pct > 70 ? "over" : pct > 30 ? "warn" : ""}"><div style="width:${Math.min(pct, 100)}%"></div></div>
            <div class="credit-line"><span>已用額度 ${pct.toFixed(0)}%</span><span>可用 ${money(c.limit - c.balance)}</span></div>` : ""}
          <div class="cc-meta">
            <label>額度 <input type="number" step="1" min="0" value="${c.limit || ""}" placeholder="—" data-cc-limit="${c.id}" class="cell-input" /></label>
            <label>每月 <input type="number" min="1" max="31" value="${c.dueDay || ""}" placeholder="—" data-cc-due="${c.id}" class="cell-input day" /> 日還款</label>
          </div>
          <div class="cc-foot ${urgent ? "bad" : ""}">
            ${c.balance > 0
              ? due ? `下次還款 ${due.date.toLocaleDateString("sv-SE")}（${daysText(due.days)}）` : "未設定還款日"
              : "沒有欠款 ✓"}
            ${c.balance > 0 ? `<form class="cc-pay" data-cc-pay="${c.id}">
              <select name="from" required>${assetsList.map((a) => `<option value="${a.id}">由 ${esc(a.name)} 還款</option>`).join("")}</select>
              <button type="submit" class="ghost small">還清</button>
            </form>` : ""}
          </div>
        </div>`;
        })
        .join("")
    : `<div class="chart-empty">暫無信用卡</div>`;
}

const BMI_ZONES = [
  { name: "過輕", from: 15, to: 18.5, color: C.blue },
  { name: "正常", from: 18.5, to: 23, color: C.green },
  { name: "過重", from: 23, to: 25, color: C.amber },
  { name: "肥胖", from: 25, to: 35, color: C.red },
];

function bmiScale(bmi) {
  if (bmi == null) return `<div class="chart-empty">輸入身高並記錄體重後顯示</div>`;
  const pos = Math.max(0, Math.min(((bmi - 15) / 20) * 100, 100));
  return `<div class="bmi-scale">
    <div class="bmi-marker gauge-marker" style="left:${pos}%"><span>${bmi.toFixed(1)}</span></div>
    <div class="bmi-bar">${BMI_ZONES.map((z) => `<div style="flex:${z.to - z.from};background:${z.color};box-shadow:0 0 10px ${z.color}"></div>`).join("")}</div>
    <div class="bmi-labels">${BMI_ZONES.map((z) => `<span style="flex:${z.to - z.from}">${z.name}</span>`).join("")}</div>
  </div>`;
}

const LEVEL_COLOR = { good: C.green, warn: C.amber, bad: C.red, info: C.violet };
const LEVEL_ICON = { good: "✓", warn: "!", bad: "✕", info: "◆" };
const METRIC_ORDER = ["bmi", "bodyFat", "fatMass", "muscle", "muscleRate", "skeletalMuscle", "water", "protein", "bone",
  "visceral", "bmr", "fatFree", "whr", "bodyAge", "heartRate", "score"];
const metricInfo = (k) => (k === "bmi" ? { label: "BMI", unit: "" } : Body.FIELD[k]);
const fmtMetric = (k, v) => {
  const d = ["bmr", "visceral", "bodyAge", "heartRate", "score"].includes(k) ? 0 : k === "whr" ? 2 : 1;
  return String(Number(Number(v).toFixed(d)));
};

function gauge(key, v, gender) {
  const s = Body.standards(gender)[key];
  if (!s) return "";
  const span = s.max - s.min;
  const w = (a, b) => Math.max(0, ((Math.min(b, s.max) - Math.max(a, s.min)) / span) * 100);
  const zones = [[w(s.min, s.lo), s.lowGood ? C.green : C.blue], [w(s.lo, s.hi), C.green]];
  if (s.highGood) zones.push([w(s.hi, s.max), C.cyan]);
  else if (s.bad != null) zones.push([w(s.hi, s.bad), C.amber], [w(s.bad, s.max), C.red]);
  else zones.push([w(s.hi, s.max), C.amber]);
  const pos = Math.max(0, Math.min(((v - s.min) / span) * 100, 100));
  return `<div class="gauge">
    <div class="gauge-bar">${zones.filter(([wd]) => wd > 0).map(([wd, c]) => `<div style="width:${wd}%;background:${c}"></div>`).join("")}</div>
    <div class="gauge-marker" style="left:${pos}%"></div>
  </div>`;
}

const SILHOUETTE = `
  <circle cx="60" cy="24" r="16" />
  <rect x="53" y="38" width="14" height="12" rx="3" />
  <path d="M32 50 Q60 42 88 50 L86 122 Q60 130 34 122 Z" />
  <rect x="18" y="52" width="12" height="74" rx="6" transform="rotate(10 24 52)" />
  <rect x="90" y="52" width="12" height="74" rx="6" transform="rotate(-10 96 52)" />
  <rect x="37" y="120" width="20" height="106" rx="9" />
  <rect x="63" y="120" width="20" height="106" rx="9" />`;

function bodyScan(cur) {
  const rows = [
    ["體重", cur.weight, "kg"], ["體脂率", cur.bodyFat, "%"], ["脂肪量", cur.fatMass, "kg"], ["去脂體重", cur.fatFree, "kg"],
    ["肌肉量", cur.muscle, "kg"], ["骨骼肌", cur.skeletalMuscle, "kg"], ["水分", cur.waterKg, "kg"],
    ["蛋白質", cur.proteinKg, "kg"], ["骨鹽", cur.bone, "kg"],
  ].filter((r) => r[1] != null);
  const fatH = Math.min((cur.bodyFat ?? 0) / 50, 1) * 218;
  const grid = Array.from({ length: 30 }, (_, i) => `<line x1="0" x2="120" y1="${i * 8}" y2="${i * 8}" />`).join("");
  return `<div class="body-scan">
    <svg viewBox="0 0 120 240" class="silhouette">
      <defs>
        <linearGradient id="holo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#22d3ee" stop-opacity="0.45" />
          <stop offset="1" stop-color="#b98cff" stop-opacity="0.2" />
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#22d3ee" stop-opacity="0" />
          <stop offset="0.8" stop-color="#22d3ee" stop-opacity="0.7" />
          <stop offset="1" stop-color="#22d3ee" stop-opacity="1" />
        </linearGradient>
        <clipPath id="body-clip">${SILHOUETTE}</clipPath>
      </defs>
      <g fill="url(#holo)" stroke="#22d3ee" stroke-width="0.8" class="sil-body">${SILHOUETTE}</g>
      <g clip-path="url(#body-clip)">
        <rect x="0" y="${226 - fatH}" width="120" height="${fatH}" fill="#ff5ca8" opacity="0.3" class="fat-fill" />
        <g class="scan-grid">${grid}</g>
        <rect x="0" y="-20" width="120" height="20" fill="url(#beam)" class="scan-beam" />
      </g>
    </svg>
    <ul class="scan-list">${rows
      .map(([l, v, u], i) => `<li style="--i:${i}"><span>${l}</span><b class="count-up">${Number(v).toFixed(1)}</b><em>${u}</em></li>`)
      .join("")}</ul>
  </div>`;
}

function bodyTypeGrid(type) {
  const rows = ["high", "mid", "low"], cols = ["low", "mid", "high"];
  const cells = rows
    .map((b) => cols.map((f) => `<div class="type-cell ${type?.key === `${b}-${f}` ? "active" : ""}">${Body.TYPES[`${b}-${f}`][0]}</div>`).join(""))
    .join("");
  return `<div class="type-wrap">
    <span class="type-y">BMI ↑</span>
    <div class="type-grid">${cells}</div>
    <span class="type-x">體脂率 →</span>
  </div>${type ? `<p class="type-desc"><b>${type.name}</b>：${type.desc}</p>` : ""}`;
}

let trendKey = null;

function fillProfileForm() {
  const form = $("#profile-form");
  if (form.contains(document.activeElement)) return;
  const p = state.profile;
  form.elements.height.value = p.height ?? "";
  form.elements.gender.value = p.gender || "male";
  form.elements.age.value = p.age ?? "";
  form.elements.activity.value = String(p.activity || 1.375);
  form.elements.target.value = state.weightGoal.target ?? "";
}

function renderWeight() {
  const ws = sortedWeights();
  const latest = ws.at(-1);
  const first = ws[0];
  const p = state.profile;
  const height = p.height;
  const userTarget = state.weightGoal.target;
  fillProfileForm();

  const analysis = Body.analyze(ws, p, userTarget);
  const cur = analysis?.cur;
  const goalFat = p.gender === "female" ? 0.25 : 0.15;
  const target =
    userTarget || (cur?.fatFree ? +(cur.fatFree / (1 - goalFat)).toFixed(1) : height ? +(22 * (height / 100) ** 2).toFixed(1) : null);

  const bmi = latest && height ? latest.weight / (height / 100) ** 2 : null;
  const zone = bmi != null ? BMI_ZONES.find((z) => bmi < z.to) || BMI_ZONES.at(-1) : null;
  const change = latest && first ? latest.weight - first.weight : null;

  let cards =
    card("最新體重", latest ? `${latest.weight} kg` : "—", latest?.date || "", C.cyan) +
    card("累計變化", change != null ? `${change > 0 ? "+" : ""}${change.toFixed(1)} kg` : "—", first ? `由 ${first.date} 起` : "", change > 0 ? C.red : C.green) +
    card("BMI", bmi != null ? bmi.toFixed(1) : "—", zone ? `${zone.name}（亞洲標準）` : "", zone?.color || C.violet);
  for (const [k, label, unit] of [["bodyFat", "體脂率", "%"], ["visceral", "內臟脂肪", " 級"], ["muscle", "肌肉量", " kg"]]) {
    if (cur?.[k] == null) continue;
    const st = Body.status(k, cur[k], p.gender);
    cards += card(label, `${fmtMetric(k, cur[k])}${unit}`, st?.label || "", st ? LEVEL_COLOR[st.level] : C.violet);
  }
  cards += card("距離目標", latest && target ? `${(latest.weight - target).toFixed(1)} kg` : "—", target ? `${userTarget ? "目標" : "建議目標"} ${target} kg` : "", C.magenta);
  $("#wt-cards").innerHTML = cards;

  $("#wt-chart").innerHTML = Charts.line(weightSeries(ws), {
    target,
    targetLabel: userTarget ? "目標" : "建議目標",
    fmt: (v) => `${v} kg`,
    height: 260,
  });
  $("#wt-bmi").innerHTML = bmiScale(bmi);

  if (latest && target && first) {
    const startW = Math.max(...ws.map((w) => w.weight));
    const pct = startW === target ? 100 : ((startW - latest.weight) / (startW - target)) * 100;
    $("#wt-progress").innerHTML = Charts.ring(pct, { color: C.green, sub: `${startW} → ${target} kg` });
  } else {
    $("#wt-progress").innerHTML = `<div class="chart-empty">記錄體重後顯示</div>`;
  }

  renderBodyAnalysis(analysis, ws);

  const recent = ws.slice(-21);
  const diffs = recent.slice(1).map((w, i) => +(w.weight - recent[i].weight).toFixed(2));
  $("#wt-diff").innerHTML = Charts.bars(
    recent.slice(1).map((w) => w.date.slice(5)),
    [{ name: "變化", color: C.cyan, values: diffs }],
    { fmt: (v) => `${v > 0 ? "+" : ""}${v} kg`, colorFn: (v) => (v > 0 ? C.red : C.green), height: 200 }
  );

  $("#wt-table").innerHTML = ws.length
    ? [...ws]
        .reverse()
        .map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? w.weight - prev.weight : null;
          const diffText = diff === null ? "" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
          const fat = w.bodyFat ?? (w.fatMass != null ? (w.fatMass / w.weight) * 100 : null);
          return `<tr>
          <td>${w.date}</td>
          <td>${w.weight}</td>
          <td>${fat != null ? fat.toFixed(1) + "%" : '<span class="muted">—</span>'}</td>
          <td class="${diff > 0 ? "bad" : diff < 0 ? "good" : ""}">${diffText}</td>
          <td class="nowrap">
            <button class="link" data-edit-wt="${w.id}">編輯</button>
            <button class="link" data-del-wt="${w.id}">刪除</button>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="muted">暫無記錄</td></tr>`;
}

function renderBodyAnalysis(analysis, ws) {
  const ids = ["#body-scan", "#body-composition", "#body-radar", "#body-type", "#body-metrics", "#body-insights", "#body-plan", "#body-trend"];
  if (!analysis) {
    ids.forEach((id) => ($(id).innerHTML = `<div class="chart-empty">記錄體重或匯入體脂磅數據後開始分析</div>`));
    $("#body-date").textContent = "";
    $("#trend-metric").innerHTML = "";
    return;
  }
  const { cur, prev, insights, plan, type } = analysis;
  const g = state.profile.gender;
  $("#body-date").textContent = `根據 ${cur.date} 的測量${prev ? `，對比 ${prev.date}` : ""}`;

  $("#body-scan").innerHTML = bodyScan(cur);

  if (cur.fatMass != null) {
    const parts = [
      { label: "水分", value: cur.waterKg, color: C.blue },
      { label: "蛋白質", value: cur.proteinKg, color: C.violet },
      { label: "骨鹽", value: cur.bone, color: C.amber },
      { label: "脂肪", value: cur.fatMass, color: C.magenta },
    ].filter((x) => x.value != null);
    const rest = cur.weight - parts.reduce((s, x) => s + x.value, 0);
    if (parts.length === 1) parts.push({ label: "去脂體重", value: cur.fatFree, color: C.cyan });
    else if (rest > 0.1) parts.push({ label: "其他", value: rest, color: "#b8a07a" });
    $("#body-composition").innerHTML = Charts.donut(parts, {
      center: `${cur.weight} kg`,
      sub: "體重組成",
      fmt: (v) => `${v.toFixed(1)} kg`,
    });
  } else {
    $("#body-composition").innerHTML = `<div class="chart-empty">需要體脂率數據</div>`;
  }

  const axes = [["bmi", "BMI"], ["bodyFat", "體脂率"], ["muscleRate", "肌肉率"], ["water", "水分率"], ["protein", "蛋白質"], ["visceral", "內臟脂肪"], ["bone", "骨鹽"]]
    .filter(([k]) => cur[k] != null)
    .map(([k, label]) => ({ label, value: Body.score(k, cur[k], g), display: fmtMetric(k, cur[k]) + (metricInfo(k).unit === "%" ? "%" : "") }));
  $("#body-radar").innerHTML = Charts.radar(axes);

  $("#body-type").innerHTML = bodyTypeGrid(type);

  const metrics = METRIC_ORDER.filter((k) => cur[k] != null);
  $("#body-metrics").innerHTML = metrics
    .map((k, i) => {
      const v = cur[k];
      const info = metricInfo(k);
      const st = Body.status(k, v, g);
      const delta = prev && prev[k] != null ? v - prev[k] : null;
      let better = Body.BETTER[k];
      if (k === "bmi") better = v > 23 ? "down" : v < 18.5 ? "up" : null;
      const shown = delta != null && Math.abs(delta) >= 0.05;
      const cls = !shown || !better ? "" : (better === "down" ? delta < 0 : delta > 0) ? "good" : "bad";
      return `<div class="metric" style="--i:${i}">
        <div class="metric-head">
          <span class="metric-name">${info.label}</span>
          ${st ? `<span class="lvl ${st.level}">${st.label}</span>` : ""}
          <span class="metric-val">${fmtMetric(k, v)}<small>${info.unit}</small></span>
          <span class="delta ${cls}">${shown ? `${delta > 0 ? "▲" : "▼"} ${fmtMetric(k, Math.abs(delta))}` : ""}</span>
        </div>
        ${gauge(k, v, g)}
      </div>`;
    })
    .join("");

  $("#body-insights").innerHTML = insights
    .map(
      (it, i) => `<div class="insight ${it.level}" style="--i:${i}">
        <div class="insight-icon">${LEVEL_ICON[it.level]}</div>
        <div><b>${esc(it.title)}</b><p>${esc(it.text)}</p></div>
      </div>`
    )
    .join("");

  $("#body-plan").innerHTML = plan
    .map(
      (it, i) => `<div class="plan-item ${it.hl ? "hl" : ""}" style="--i:${i}">
        <span>${it.label}</span><b>${it.value}</b>${it.note ? `<em>${it.note}</em>` : ""}
      </div>`
    )
    .join("");

  const derived = ws.map((w) => Body.derive(w, state.profile.height));
  const keys = ["weight", ...METRIC_ORDER].filter((k) => derived.filter((d) => d[k] != null).length >= 2);
  const select = $("#trend-metric");
  const optionsHtml = keys.map((k) => `<option value="${k}">${k === "weight" ? "體重" : metricInfo(k).label}</option>`).join("");
  if (select.dataset.keys !== keys.join()) {
    select.innerHTML = optionsHtml;
    select.dataset.keys = keys.join();
  }
  if (!keys.includes(trendKey)) trendKey = keys.includes("bodyFat") ? "bodyFat" : keys[0] || null;
  if (trendKey) select.value = trendKey;
  if (!trendKey) {
    $("#body-trend").innerHTML = `<div class="chart-empty">同一指標有兩次或以上記錄後顯示趨勢</div>`;
  } else {
    const info = trendKey === "weight" ? { label: "體重", unit: "kg" } : metricInfo(trendKey);
    const s = Body.standards(g)[trendKey];
    const points = derived
      .filter((d) => d[trendKey] != null)
      .map((d) => ({ x: dayMs(d.date), y: +Number(d[trendKey]).toFixed(2), label: d.date.slice(5) }));
    $("#body-trend").innerHTML = Charts.line(
      [{ name: info.label, color: C.violet, points, area: true, dots: true }],
      { width: 1000, height: 260, band: s ? [Math.max(s.lo, s.min), s.hi] : null, fmt: (v) => `${v} ${info.unit}` }
    );
  }
}

function upsertRecord(rec) {
  const existing = state.weights.find((w) => w.date === rec.date);
  if (existing) Object.assign(existing, rec);
  else state.weights.push({ id: uid(), ...rec });
}

let editingId = null;

function openBodyDialog(id, scanned) {
  const form = $("#body-form");
  form.reset();
  form.querySelectorAll(".ocr-hit").forEach((el) => el.classList.remove("ocr-hit"));
  editingId = id || null;
  const rec = id ? state.weights.find((w) => w.id === id) : scanned?.values;
  form.elements.date.value = (id ? rec?.date : scanned?.date) || today();
  if (rec)
    Body.FIELDS.forEach((f) => {
      form.elements[f.key].value = rec[f.key] ?? "";
      if (scanned && rec[f.key] != null) form.elements[f.key].classList.add("ocr-hit");
    });
  const note = $("#ocr-note");
  note.hidden = !scanned;
  if (scanned) {
    const n = Object.keys(scanned.values).length;
    note.innerHTML = n
      ? `已自動辨認 <b>${n}</b> 項（發光框）。請對照截圖核對一次，特別是日期和體重，如有錯誤請直接修改。`
      : "未能辨認數字，可能圖片太小或太模糊。請手動填寫，或嘗試使用未經壓縮的原圖。";
  }
  $("#body-dialog").showModal();
}

// ---------- 截圖辨識 ----------
const OCR_STAGE = {
  "loading engine": "載入辨識引擎…",
  "loading tesseract core": "載入辨識引擎…",
  "initializing tesseract": "初始化…",
  "loading language traineddata": "下載中文字庫（首次較慢）…",
  "initializing api": "準備中…",
  "recognizing text": "正在辨識文字…",
  "gemini upload": "正在上傳圖片至 Gemini…",
  "gemini thinking": "Gemini AI 正在分析截圖…",
};

function renderEngineLine() {
  const g = ScaleOCR.getGemini();
  $("#engine-line").innerHTML = g.key
    ? `辨識引擎：<b class="good">Gemini AI</b>（高準確度）`
    : `辨識引擎：內置文字辨識（準確度一般）· <a href="#settings" data-close>設定 Gemini 以提升準確度</a>`;
  $("#gemini-status").innerHTML = g.key
    ? `<span class="good">✓ 已設定 Gemini（${esc(g.model && !/pro/i.test(g.model) ? g.model : "gemini-flash-latest")}）</span>`
    : "未設定";
}

async function scanImage(file) {
  if (!file || !file.type.startsWith("image/")) return Effects.toast("請選擇圖片檔案", "warn");
  const dialog = $("#scan-dialog");
  if (!dialog.open) dialog.showModal();
  const img = $("#scan-img");
  img.src = URL.createObjectURL(file);
  $("#scan-preview").hidden = false;
  $("#drop-hint").hidden = true;
  dialog.classList.add("scanning");
  const status = $("#ocr-status"), bar = $("#ocr-bar");
  try {
    const result = await ScaleOCR.scan(file, (m) => {
      status.textContent = OCR_STAGE[m.status] || "處理中…";
      const pct = m.status === "recognizing text" ? 30 + m.progress * 70 : Math.min(30, (m.progress || 0) * 30);
      bar.style.width = `${pct}%`;
    });
    bar.style.width = "100%";
    dialog.close();
    openBodyDialog(null, result);
  } catch (err) {
    status.textContent = err.message || "辨識失敗";
    Effects.toast(err.message || "辨識失敗", "error");
  } finally {
    dialog.classList.remove("scanning");
    URL.revokeObjectURL(img.src);
  }
}

function resetScanDialog() {
  renderEngineLine();
  $("#scan-preview").hidden = true;
  $("#drop-hint").hidden = false;
  $("#ocr-status").textContent = "";
  $("#ocr-bar").style.width = "0";
}

let parsedImport = [];

function previewImport() {
  parsedImport = Body.parse($("#import-text").value);
  const btn = $("#import-confirm");
  btn.disabled = !parsedImport.length;
  btn.textContent = parsedImport.length ? `確認匯入 ${parsedImport.length} 筆` : "確認匯入";
  if (!parsedImport.length) {
    $("#import-preview").innerHTML = `<div class="chart-empty">找不到體重數據。CSV 第一行須有「體重」欄位；文字則須包含「體重 xx」。</div>`;
    return;
  }
  const keys = Body.FIELDS.map((f) => f.key).filter((k) => parsedImport.some((r) => r[k] != null));
  $("#import-preview").innerHTML = `<div class="table-wrap preview">
    <table>
      <thead><tr><th>日期</th>${keys.map((k) => `<th>${Body.FIELD[k].label}</th>`).join("")}</tr></thead>
      <tbody>${parsedImport
        .slice(0, 50)
        .map((r) => `<tr><td>${r.date}</td>${keys.map((k) => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>
  </div>
  <p class="muted">辨認到 ${keys.length} 項指標${parsedImport.length > 50 ? `（只顯示首 50 筆）` : ""}。同日已有的記錄會合併更新。</p>`;
}

let projGroup = "all";

function renderProjects() {
  const groups = [...new Set(state.projects.map((p) => p.group).filter(Boolean))];
  $("#proj-groups").innerHTML = groups.map((g) => `<option value="${esc(g)}">`).join("");
  const hasUngrouped = state.projects.some((p) => !p.group);
  if (projGroup !== "all" && !(projGroup ? groups.includes(projGroup) : hasUngrouped)) projGroup = "all";
  const chip = (key, label, n) =>
    `<button type="button" class="chip ${projGroup === key ? "on" : ""}" data-proj-group="${esc(key)}">${esc(label)} <small>${n}</small></button>`;
  $("#proj-group-chips").innerHTML =
    chip("all", "全部", state.projects.length) +
    groups.map((g) => chip(g, g, state.projects.filter((p) => p.group === g).length)).join("") +
    (hasUngrouped ? chip("", "未分組", state.projects.filter((p) => !p.group).length) : "");

  const pool = projGroup === "all" ? state.projects : state.projects.filter((p) => (p.group || "") === projGroup);
  const counts = { todo: 0, doing: 0, done: 0 };
  pool.forEach((p) => counts[projectStatus(p)]++);
  $("#proj-donut").innerHTML = Charts.donut(
    Object.entries(counts).map(([k, v]) => ({ label: STATUS_LABEL[k], value: v, color: STATUS_COLOR[k] })),
    { center: String(pool.length), sub: "個項目" }
  );

  const avg = pool.length ? pool.reduce((s, p) => s + projectPct(p), 0) / pool.length : null;
  $("#proj-overall").innerHTML =
    avg != null
      ? Charts.ring(avg, { color: C.violet, sub: `${counts.done} / ${pool.length} 已完成` })
      : `<div class="chart-empty">暫無項目</div>`;

  const ranked = [...pool].sort((a, b) => projectPct(b) - projectPct(a));
  $("#proj-bars").innerHTML = ranked.length
    ? `<div class="proj-rank">${ranked
        .map((p) => {
          const pct = Math.round(projectPct(p));
          return `<div class="proj-rank-row"><span title="${esc(p.name)}">${esc(p.name)}</span><div class="bar"><div style="width:${pct}%"></div></div><b>${pct}%</b></div>`;
        })
        .join("")}</div>`
    : `<div class="chart-empty">暫無項目</div>`;

  const filter = $("#proj-filter").value;
  const list = pool.filter((p) => filter === "all" || projectStatus(p) === filter);

  $("#proj-list").innerHTML = list.length
    ? list.map((p) => projectCard(p, state.projects.indexOf(p) + 1)).join("")
    : `<div class="chart-empty">暫無項目</div>`;
}

function projectCard(p, rank) {
  const status = projectStatus(p);
  const done = p.tasks.filter((t) => t.done).length;
  const overdue = p.deadline && p.deadline < today() && status !== "done";
  const daysLeft = p.deadline ? Math.ceil((dayMs(p.deadline) - dayMs(today())) / 86400000) : null;
  return `<div class="project">
          <span class="proj-no" title="優先次序">${rank}</span>
          <div class="project-top">
            ${Charts.ring(projectPct(p), { color: STATUS_COLOR[status] })}
            <div class="project-info">
              <div class="project-head">
                <span class="proj-drag" role="button" aria-label="拖拉排序：${esc(p.name)}" data-proj-drag="${p.id}" title="拖拉以排列優先次序">≡</span>
                <h4 class="proj-name" contenteditable="plaintext-only" spellcheck="false" title="按此修改名稱" data-proj-name="${p.id}">${esc(p.name)}</h4>
                <span class="badge ${status}">${STATUS_LABEL[status]}</span>
              </div>
              ${p.note ? `<div class="muted">${esc(p.note)}</div>` : ""}
              <div class="meta ${overdue ? "overdue" : ""}">
                ${p.group ? `<span class="tag">${esc(p.group)}</span>` : ""}
                ${p.deadline ? `截止 ${p.deadline}${status === "done" ? "" : overdue ? `（已過期 ${-daysLeft} 天）` : `（尚餘 ${daysLeft} 天）`}` : "沒有截止日期"}
                ${p.tasks.length ? `｜ 任務 ${done}/${p.tasks.length}` : ""}
              </div>
            </div>
          </div>
          <ul class="tasks">
            ${p.tasks
              .map(
                (t) => `<li class="${t.done ? "done" : ""}">
                <input type="checkbox" ${t.done ? "checked" : ""} data-toggle-task="${p.id}:${t.id}" />
                <span>${esc(t.text)}</span>
                <button class="link" data-del-task="${p.id}:${t.id}">✕</button>
              </li>`
              )
              .join("")}
          </ul>
          <form class="task-form" data-add-task="${p.id}">
            <input name="text" placeholder="新增任務…" required />
            <button type="submit">＋</button>
          </form>
          <div class="form-row proj-foot">
            ${!p.tasks.length ? `<label class="proj-progress">進度
              <input type="range" min="0" max="100" step="5" value="${projectPct(p)}" data-proj-progress="${p.id}" />
              <b>${Math.round(projectPct(p))}%</b></label>` : ""}
            <button class="link" data-del-proj="${p.id}">刪除項目</button>
          </div>
        </div>`;
}

// ---------- 願望清單 ----------
const WISH_CATS = ["旅行", "體驗", "創作", "健康", "運動", "理財", "其他"];
let bucketFilter = "all";

function renderBucket() {
  const all = state.bucket;
  const doneN = all.filter((w) => w.done).length;
  const cats = [...new Set([...WISH_CATS, ...all.map((w) => w.category)])];
  $("#wish-cats").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");

  $("#wish-overall").innerHTML = all.length
    ? Charts.ring((doneN / all.length) * 100, { color: C.magenta, sub: `${doneN} / ${all.length} 已達成` })
    : `<div class="chart-empty">暫無願望</div>`;

  const used = cats.filter((c) => all.some((w) => w.category === c));
  $("#wish-bycat").innerHTML = used.length
    ? `<div class="proj-rank">${used
        .map((c) => {
          const ws = all.filter((w) => w.category === c);
          const d = ws.filter((w) => w.done).length;
          return `<div class="proj-rank-row"><span>${esc(c)}</span><div class="bar"><div style="width:${(d / ws.length) * 100}%"></div></div><b>${d}/${ws.length}</b></div>`;
        })
        .join("")}</div>`
    : `<div class="chart-empty">暫無願望</div>`;

  const recent = all.filter((w) => w.done && w.doneDate).sort((a, b) => b.doneDate.localeCompare(a.doneDate)).slice(0, 5);
  $("#wish-recent").innerHTML = recent.length
    ? `<ul class="simple-list">${recent.map((w) => `<li><span>${esc(w.text)}</span><span class="muted">${w.doneDate}</span></li>`).join("")}</ul>`
    : `<div class="chart-empty">達成後會在此顯示</div>`;

  document.querySelectorAll("#wish-filter [data-filter]").forEach((b) => b.classList.toggle("on", b.dataset.filter === bucketFilter));
  const list = all.filter((w) => bucketFilter === "all" || (bucketFilter === "done") === w.done);
  $("#wish-list").innerHTML = list.length
    ? cats
        .map((c) => [c, list.filter((w) => w.category === c)])
        .filter(([, ws]) => ws.length)
        .map(
          ([c, ws]) => `<div class="panel wish-group">
            <h3>${esc(c)} <small class="muted">${ws.filter((w) => w.done).length} / ${ws.length}</small></h3>
            <ul class="wishes">${ws
              .sort((a, b) => a.done - b.done)
              .map(
                (w) => `<li class="${w.done ? "done" : ""}">
                  <input type="checkbox" id="wish-${w.id}" ${w.done ? "checked" : ""} data-toggle-wish="${w.id}" />
                  <div class="wish-body">
                    <label for="wish-${w.id}">${esc(w.text)}</label>
                    ${w.done ? `<div class="wish-date">達成日期 <input type="date" value="${w.doneDate || ""}" data-wish-date="${w.id}" /></div>` : ""}
                  </div>
                  <button class="link" data-del-wish="${w.id}">✕</button>
                </li>`
              )
              .join("")}</ul>
          </div>`
        )
        .join("")
    : `<div class="chart-empty">沒有符合的願望</div>`;
}

// ---------- 表單事件 ----------
$("#tx-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const amount = parseFloat(d.amount);
  const isTransfer = d.type === "transfer";
  if (!isTransfer && !d.category) return Effects.toast("請先選擇類別", "warn");
  if (!d.accountId) return Effects.toast(isTransfer ? "請選擇轉出帳戶" : "請選擇帳戶", "warn");
  if (isTransfer && !d.toAccountId) return Effects.toast("請選擇轉入帳戶", "warn");
  if (isTransfer && d.accountId === d.toAccountId) return Effects.toast("轉出與轉入帳戶不可相同", "warn");
  addTx({
    date: d.date,
    type: d.type,
    category: isTransfer ? "轉帳" : d.category,
    amount,
    note: d.note.trim(),
    accountId: d.accountId,
    ...(isTransfer ? { toAccountId: d.toAccountId } : {}),
  });
  state.lastAccountId = d.accountId;
  ledgerView.anchor = d.date;
  e.target.elements.amount.value = "";
  e.target.elements.note.value = "";
  save(isTransfer ? `已由 ${accName(d.accountId)} 轉 ${money(amount)} 去 ${accName(d.toAccountId)}` : `已記錄${TYPE_LABEL[d.type]} ${money(amount)}`);
});
$("#tx-form").addEventListener("change", (e) => {
  if (e.target.name !== "type") return;
  $("#tx-category").value = "";
  $("#tx-account").value = state.lastAccountId || "";
  renderTxForm();
});
$("#cat-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  let cat = chip.dataset.cat;
  if (chip.hasAttribute("data-cat-custom")) {
    cat = (prompt("新類別名稱：") || "").trim();
    if (!cat) return;
  }
  $("#tx-category").value = cat;
  renderTxForm();
});
document.querySelectorAll('input[name="period"]').forEach((r) =>
  r.addEventListener("change", () => {
    ledgerView.mode = r.value;
    renderLedger();
  })
);
$("#period-prev").addEventListener("click", () => shiftPeriod(-1));
$("#period-next").addEventListener("click", () => shiftPeriod(1));
$("#period-today").addEventListener("click", () => {
  ledgerView.anchor = today();
  renderLedger();
});

$("#acc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.accounts.push({ id: uid(), name: d.name.trim(), type: d.type, balance: parseFloat(d.balance), purpose: d.purpose.trim(), updated: today() });
  e.target.reset();
  save("已新增帳戶");
});

$("#rec-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.recurring.push({
    id: uid(), type: d.type, name: d.name.trim(), category: d.category.trim(),
    amount: parseFloat(d.amount), accountId: d.accountId, day: d.day, start: today(),
  });
  e.target.elements.name.value = "";
  e.target.elements.amount.value = "";
  save("已新增固定收支");
});

$("#catb-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.catBudgets[d.category.trim()] = parseFloat(d.amount);
  e.target.reset();
  save(`已設定「${d.category.trim()}」每月預算`);
});

$("#bill-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.bills.push({ id: uid(), name: d.name.trim(), amount: parseFloat(d.amount), due: d.due, fund: d.fund, paid: false });
  e.target.reset();
  save("已新增應付款項");
});

$("#cc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.accounts.push({
    id: uid(), name: d.name.trim(), type: "信用卡", balance: parseFloat(d.balance) || 0,
    limit: parseFloat(d.limit) || 0, dueDay: parseInt(d.dueDay) || null, updated: today(),
  });
  e.target.reset();
  save("已新增信用卡");
});

$("#budget-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.budget = parseFloat(formData(e.target).budget) || 0;
  e.target.reset();
  save("已設定預算");
});

$("#goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.goals.push({ id: uid(), name: d.name.trim(), target: parseFloat(d.target), saved: parseFloat(d.saved) || 0 });
  e.target.reset();
  save("已新增儲蓄目標");
});

$("#wt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  upsertRecord({ date: d.date, weight: parseFloat(d.weight) });
  e.target.elements.weight.value = "";
  save("已記錄體重");
});

$("#profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.profile = {
    height: parseFloat(d.height) || null,
    gender: d.gender,
    age: parseInt(d.age) || null,
    activity: parseFloat(d.activity) || 1.375,
  };
  state.weightGoal.target = parseFloat(d.target) || null;
  document.activeElement?.blur();
  save("個人資料已更新");
});

$("#open-body-form").addEventListener("click", () => openBodyDialog(null));

$("#open-scan").addEventListener("click", () => {
  resetScanDialog();
  $("#scan-dialog").showModal();
});
$("#scan-file").addEventListener("change", (e) => {
  scanImage(e.target.files[0]);
  e.target.value = "";
});
const dropZone = $("#drop-zone");
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("over");
  scanImage(e.dataTransfer.files[0]);
});
document.addEventListener("paste", (e) => {
  const onWeight = $("#view-weight").classList.contains("active");
  if (!onWeight && !$("#scan-dialog").open) return;
  if ($("#body-dialog").open || $("#import-dialog").open) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  e.preventDefault();
  resetScanDialog();
  scanImage(item.getAsFile());
});

$("#body-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const rec = { date: form.elements.date.value };
  Body.FIELDS.forEach((f) => {
    const v = parseFloat(form.elements[f.key].value);
    if (!isNaN(v)) rec[f.key] = v;
  });
  if (!(rec.weight > 0)) return Effects.toast("體重為必填項目", "warn");
  if (editingId) state.weights = state.weights.filter((w) => w.id !== editingId);
  upsertRecord(rec);
  $("#body-dialog").close();
  save("已儲存體脂磅記錄，分析已更新");
  $("#body-analysis").scrollIntoView({ behavior: "smooth" });
  Effects.enterView($("#view-weight"));
});

$("#open-body-import").addEventListener("click", () => {
  $("#import-text").value = "";
  $("#import-preview").innerHTML = "";
  parsedImport = [];
  $("#import-confirm").disabled = true;
  $("#import-confirm").textContent = "確認匯入";
  $("#import-dialog").showModal();
});

$("#body-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#import-text").value = await file.text();
  e.target.value = "";
  previewImport();
});

$("#import-parse").addEventListener("click", previewImport);

$("#import-confirm").addEventListener("click", () => {
  if (!parsedImport.length) return;
  parsedImport.forEach(upsertRecord);
  $("#import-dialog").close();
  save(`已匯入 ${parsedImport.length} 筆體脂磅記錄`);
  $("#body-analysis").scrollIntoView({ behavior: "smooth" });
  Effects.enterView($("#view-weight"));
});

$("#download-template").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([Body.csvTemplate()], { type: "text/csv" }));
  a.download = "體脂磅記錄範本.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.addEventListener("click", (e) => e.target.closest?.("[data-close]")?.closest("dialog")?.close());

$("#trend-metric").addEventListener("change", (e) => {
  trendKey = e.target.value;
  renderWeight();
});

$("#proj-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.projects.push({ id: uid(), group: d.group.trim(), name: d.name.trim(), deadline: d.deadline, note: d.note.trim(), progress: 0, tasks: [] });
  if (projGroup !== "all") projGroup = d.group.trim();
  e.target.reset();
  save("已新增項目");
});
$("#proj-filter").addEventListener("change", renderProjects);
$("#proj-group-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-proj-group]");
  if (!btn) return;
  projGroup = btn.dataset.projGroup;
  renderProjects();
});

let projDrag = null;
document.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest?.("[data-proj-drag]");
  if (!handle || e.button !== 0) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  projDrag = { card: handle.closest(".project"), moved: false };
  projDrag.card.classList.add("dragging");
  $("#proj-list").classList.add("sorting");
});
document.addEventListener("pointermove", (e) => {
  if (!projDrag) return;
  if (e.clientY < 70) window.scrollBy(0, -14);
  else if (e.clientY > innerHeight - 70) window.scrollBy(0, 14);
  const list = $("#proj-list");
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".project");
  if (!over || over === projDrag.card || !list.contains(over)) return;
  const r = over.getBoundingClientRect();
  const sideBySide = r.width < list.clientWidth * 0.75;
  const before = sideBySide ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
  list.insertBefore(projDrag.card, before ? over : over.nextSibling);
  projDrag.moved = true;
});
function endProjDrag() {
  if (!projDrag) return;
  const { card, moved } = projDrag;
  projDrag = null;
  card.classList.remove("dragging");
  $("#proj-list").classList.remove("sorting");
  if (!moved) return;
  const ids = [...$("#proj-list").querySelectorAll("[data-proj-drag]")].map((h) => h.dataset.projDrag);
  const shown = new Set(ids);
  const queue = ids.map((id) => state.projects.find((p) => p.id === id));
  state.projects = state.projects.map((p) => (shown.has(p.id) ? queue.shift() : p));
  save("已更新優先次序");
}
document.addEventListener("pointerup", endProjDrag);
document.addEventListener("pointercancel", endProjDrag);
document.addEventListener("keydown", (e) => {
  if (!e.target.dataset?.projName) return;
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  } else if (e.key === "Escape") {
    e.target.textContent = state.projects.find((x) => x.id === e.target.dataset.projName).name;
    e.target.blur();
  }
});
document.addEventListener("focusout", (e) => {
  const id = e.target.dataset?.projName;
  if (!id) return;
  const p = state.projects.find((x) => x.id === id);
  const name = e.target.textContent.trim();
  if (!name || name === p.name) return (e.target.textContent = p.name);
  p.name = name;
  save("已更新名稱");
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.projProgress) e.target.nextElementSibling.textContent = `${e.target.value}%`;
});

$("#wish-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  state.bucket.push({ id: uid(), text: d.text.trim(), category: d.category.trim() || "其他", done: false, doneDate: null });
  e.target.reset();
  save("已加入願望清單");
});
$("#wish-filter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  bucketFilter = b.dataset.filter;
  renderBucket();
});

$("#gemini-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const cur = ScaleOCR.getGemini();
  ScaleOCR.setGemini({ key: d.key.trim() || cur.key || "", model: d.model.trim() || cur.model || "" });
  e.target.elements.key.value = "";
  renderEngineLine();
  Effects.toast("已儲存 Gemini 設定");
});
$("#gemini-clear").addEventListener("click", () => {
  ScaleOCR.setGemini({});
  renderEngineLine();
  Effects.toast("已移除密鑰");
});

$("#currency-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.currency = formData(e.target).currency;
  save();
});

// ---------- 列表內操作（事件委派） ----------
const findProjTask = (key) => {
  const [pid, tid] = key.split(":");
  const p = state.projects.find((x) => x.id === pid);
  return [p, p?.tasks.find((t) => t.id === tid)];
};

document.addEventListener("click", (e) => {
  const ds = e.target.dataset;
  if (ds.editWt) return openBodyDialog(ds.editWt);
  if (ds.billPaid) {
    const b = state.bills.find((x) => x.id === ds.billPaid);
    const funds = state.accounts.filter((a) => b.fund && a.purpose === b.fund && !isDebt(a));
    const fundTotal = funds.reduce((s, a) => s + Math.max(0, a.balance), 0);
    const fallback = funds.at(-1) || state.accounts.filter((a) => !isDebt(a) && !a.purpose).sort((x, y) => y.balance - x.balance)[0];
    if (!funds.length && !fallback) return Effects.toast("請先新增帳戶", "warn");
    const lines = [`${b.name} ${money(b.amount)} 是否已付款？`];
    if (funds.length) lines.push(`將從「${b.fund}」帳戶扣除。`);
    if (fundTotal < b.amount) lines.push(`不足的 ${money(b.amount - fundTotal)} 將從「${fallback.name}」扣除。`);
    lines.push("記帳中會自動記錄此筆支出。");
    if (!confirm(lines.join("\n"))) return;
    const category = b.name.replace(/（.*）/, "");
    let left = b.amount;
    funds.forEach((a, i) => {
      const take = i === funds.length - 1 ? left : round2(Math.min(left, Math.max(0, a.balance)));
      if (take > 0) addTx({ type: "expense", category, amount: take, accountId: a.id, note: b.name });
      left = round2(left - take);
    });
    if (left > 0) addTx({ type: "expense", category, amount: left, accountId: fallback.id, note: b.name });
    b.paid = true;
    b.paidOn = today();
    return save(`${b.name} 已付`);
  }
  if (ds.delTx) {
    const t = state.transactions.find((x) => x.id === ds.delTx);
    if (t) applyTx(t, -1);
    state.transactions = state.transactions.filter((x) => x.id !== ds.delTx);
  } else if (ds.delAcc && confirm("確定刪除此帳戶？")) {
    state.accounts = state.accounts.filter((a) => a.id !== ds.delAcc);
  } else if (ds.delRec && confirm("確定刪除此固定收支？已記錄的帳目不受影響。")) {
    state.recurring = state.recurring.filter((r) => r.id !== ds.delRec);
  } else if (ds.delCatb) {
    delete state.catBudgets[ds.delCatb];
  } else if (ds.delBill && confirm("確定刪除此應付款項？")) {
    state.bills = state.bills.filter((b) => b.id !== ds.delBill);
  } else if (ds.delGoal) {
    state.goals = state.goals.filter((g) => g.id !== ds.delGoal);
  } else if (ds.delWt) {
    state.weights = state.weights.filter((w) => w.id !== ds.delWt);
  } else if (ds.delProj && confirm("確定刪除此項目？")) {
    state.projects = state.projects.filter((p) => p.id !== ds.delProj);
  } else if (ds.delTask) {
    const [p, t] = findProjTask(ds.delTask);
    p.tasks = p.tasks.filter((x) => x !== t);
  } else if (ds.delWish && confirm("確定刪除此願望？")) {
    state.bucket = state.bucket.filter((w) => w.id !== ds.delWish);
  } else {
    return;
  }
  save("已刪除");
});

document.addEventListener("change", (e) => {
  const ds = e.target.dataset;
  if (ds.toggleTask) {
    const [, t] = findProjTask(ds.toggleTask);
    t.done = e.target.checked;
  } else if (ds.accBalance || ds.accPurpose || ds.ccLimit || ds.ccDue) {
    const a = state.accounts.find((x) => x.id === (ds.accBalance || ds.accPurpose || ds.ccLimit || ds.ccDue));
    const v = e.target.value;
    if (ds.accBalance) a.balance = parseFloat(v) || 0;
    if (ds.accPurpose) a.purpose = v.trim();
    if (ds.ccLimit) a.limit = parseFloat(v) || 0;
    if (ds.ccDue) a.dueDay = parseInt(v) || null;
    if (ds.accBalance) a.updated = today();
  } else if (ds.recAmount || ds.recAcc || ds.recDay) {
    const r = state.recurring.find((x) => x.id === (ds.recAmount || ds.recAcc || ds.recDay));
    if (ds.recAmount) r.amount = parseFloat(e.target.value) || 0;
    if (ds.recAcc) r.accountId = e.target.value;
    if (ds.recDay) r.day = e.target.value;
  } else if (ds.goalSaved) {
    state.goals.find((g) => g.id === ds.goalSaved).saved = parseFloat(e.target.value) || 0;
  } else if (ds.projProgress) {
    state.projects.find((p) => p.id === ds.projProgress).progress = Number(e.target.value);
  } else if (ds.toggleWish) {
    const w = state.bucket.find((x) => x.id === ds.toggleWish);
    w.done = e.target.checked;
    w.doneDate = w.done ? today() : null;
    return save(w.done ? `恭喜達成：${w.text}！` : null);
  } else if (ds.wishDate) {
    state.bucket.find((x) => x.id === ds.wishDate).doneDate = e.target.value || null;
  } else {
    return;
  }
  save();
});

document.addEventListener("submit", (e) => {
  const cid = e.target.dataset.ccPay;
  if (!cid) return;
  e.preventDefault();
  const c = state.accounts.find((a) => a.id === cid);
  const src = state.accounts.find((a) => a.id === formData(e.target).from);
  const amt = c.balance;
  if (!src) return Effects.toast("請選擇還款帳戶", "warn");
  if (!confirm(`確定還清 ${c.name} ${money(amt)}，並從 ${src.name} 扣款？`)) return;
  addTx({ type: "transfer", category: "轉帳", amount: amt, accountId: src.id, toAccountId: c.id, note: "償還信用卡" });
  save(`${c.name} 已還清`);
});

document.addEventListener("submit", (e) => {
  const bid = e.target.dataset.billAdd;
  if (!bid) return;
  e.preventDefault();
  const b = state.bills.find((x) => x.id === bid);
  const d = formData(e.target);
  const amt = parseFloat(d.amount);
  const fund = state.accounts.find((a) => a.purpose === b.fund && !isDebt(a));
  if (!fund || !(amt > 0)) return;
  const src = state.accounts.find((a) => a.id === d.from);
  if (src && src.balance < amt && !confirm(`${src.name} 只有 ${money(src.balance)}，不足 ${money(amt)}，是否仍要轉帳？`)) return;
  if (src) {
    addTx({ type: "transfer", category: "轉帳", amount: amt, accountId: src.id, toAccountId: fund.id, note: `存入「${b.fund}」` });
  } else {
    addTx({ type: "income", category: "收入", amount: amt, accountId: fund.id, note: `存入「${b.fund}」` });
  }
  save(`已存入 ${money(amt)} 至「${b.fund}」${src ? `（由 ${src.name} 轉入）` : "，並已記錄此筆收入"}`);
});

document.addEventListener("submit", (e) => {
  const pid = e.target.dataset.addTask;
  if (!pid) return;
  e.preventDefault();
  const text = formData(e.target).text.trim();
  if (!text) return;
  state.projects.find((p) => p.id === pid).tasks.push({ id: uid(), text, done: false });
  save();
});

// ---------- 備份 ----------
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `手帳-備份-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  Effects.setPref("lastExport", today());
  Effects.setPref("snoozeUntil", null);
  renderBackupStatus();
  Effects.toast("已匯出備份");
}

const daysSinceExport = () => {
  const last = Effects.prefs.lastExport;
  return last ? -daysUntil(last) : null;
};
const backupDue = () => {
  const every = Number(Effects.prefs.remindDays);
  const since = daysSinceExport();
  return every > 0 && (since === null || since >= every);
};

function renderBackupStatus() {
  const since = daysSinceExport();
  const text = since === null ? "從未匯出" : since === 0 ? "今天" : `${since} 天前`;
  const btn = $("#backup-status");
  btn.textContent = `上次備份：${text}`;
  btn.title = "按此立即匯出備份";
  btn.classList.toggle("due", backupDue());
  $("#backup-remind").value = String(Effects.prefs.remindDays);
  const every = Number(Effects.prefs.remindDays);
  $("#backup-info").textContent = `上次匯出：${text}${every ? `；每 ${every} 天提醒一次` : ""}`;
}

function checkBackup() {
  renderBackupStatus();
  const snooze = Effects.prefs.snoozeUntil;
  if (!backupDue() || (snooze && today() < snooze) || $("#backup-dialog").open) return;
  const since = daysSinceExport();
  $("#backup-msg").textContent =
    since === null ? "尚未匯出過備份。" : `距離上次匯出備份已經 ${since} 天。`;
  $("#backup-dialog").showModal();
  Sound.play("warn");
}

$("#export-btn").addEventListener("click", exportData);
$("#backup-status").addEventListener("click", exportData);
$("#backup-now").addEventListener("click", () => {
  $("#backup-dialog").close();
  exportData();
});
$("#backup-later").addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  Effects.setPref("snoozeUntil", d.toLocaleDateString("sv-SE"));
  $("#backup-dialog").close();
});
$("#backup-remind").addEventListener("change", (e) => {
  Effects.setPref("remindDays", Number(e.target.value));
  renderBackupStatus();
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm("匯入會覆蓋現有所有資料，確定？")) return;
    state = normalize(data);
    save("匯入成功");
  } catch {
    Effects.toast("檔案格式不正確，匯入失敗", "error");
  } finally {
    e.target.value = "";
  }
});

$("#clear-btn").addEventListener("click", () => {
  if (!confirm("確定清除所有資料？建議先匯出備份。")) return;
  state = defaultState();
  save();
});

// ---------- 初始化 ----------
$("#profile-form").elements.activity.innerHTML = Body.ACTIVITY.map((a) => `<option value="${a.value}">${a.label}</option>`).join("");
$("#body-fields").insertAdjacentHTML(
  "beforeend",
  Body.FIELDS.map(
    (f) => `<label>${f.label}${f.unit ? `（${f.unit}）` : ""}
      <input type="number" step="any" name="${f.key}" ${f.key === "weight" ? "required" : ""} /></label>`
  ).join("")
);
document.querySelectorAll('input[type="date"][name="date"]').forEach((i) => (i.value = today()));
// 個人數字只在本機 secrets/personal.js；公開站保持空白
if (typeof applyPersonalSeed === "function") {
  applyPersonalSeed({ state, uid, today, nextMonthOf, projectPlan, STORAGE_KEY });
}
{
  const n = runRecurring();
  if (n) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setTimeout(() => Effects.toast(`已自動記錄 ${n} 筆固定收支`), 500);
  }
}

// 必須登入後才啟動，避免 showModal／畫布在登入畫面擋住點擊與輸入
Auth.onReady(() => {
  Effects.init();
  initPlan();
  initTime();
  renderEngineLine();
  tick();
  render();
  route();
  renderBackupStatus();
  setTimeout(checkBackup, 2500);
});
