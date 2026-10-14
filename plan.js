// 現金流計劃：於 app.js 之前載入，只定義函數，由 app.js 初始化及渲染
const PLAN_ORDER = { income: 0, fixed: 1, budget: 1, bill: 2, plan: 3 };
const PLAN_KIND = { transfer: "轉帳", expense: "支出", income: "收入" };
const PLAN_COLORS = ["#2a8f86", "#d48a14", "#7d55a8", "#3a6fb0", "#c0436d", "#4e8f2c"];

const monthLabel = (m) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const planAdd = (bal, g, v) => (bal[g] = round2((bal[g] || 0) + v));

function planGroupOfId(id) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return "日常";
  if (isDebt(a)) return null;
  return a.purpose || "日常";
}
const planToGroup = (e) => (e.to ? planGroupOfId(e.to) : e.toNew?.purpose || e.toNew?.name || null);
const planToName = (e) => (e.to ? accName(e.to) : e.toNew ? `${e.toNew.name}（新開）` : "—");

function planRoute(e) {
  if (e.kind === "transfer") return `${accName(e.from)} → ${planToName(e)}`;
  if (e.kind === "expense") return `${e.category || "其他"} · ${accName(e.from)}`;
  return `${e.category || "其他"} · 存入 ${planToName(e)}`;
}

function planEndMonth() {
  return [
    thisMonth(),
    ...state.plan.map((e) => e.date.slice(0, 7)),
    ...state.bills.filter((b) => !b.paid).map((b) => b.due.slice(0, 7)),
    ...Object.keys(state.planBaseline),
  ].sort().at(-1);
}

function balancesAt(date) {
  const byId = {};
  state.accounts.filter((a) => !isDebt(a)).forEach((a) => (byId[a.id] = a.balance));
  const undo = (id, flow) => id in byId && (byId[id] -= flow);
  for (const t of state.transactions) {
    if (t.date <= date) continue;
    if (t.type === "transfer") {
      undo(t.accountId, -t.amount);
      undo(t.toAccountId, t.amount);
    } else undo(t.accountId, t.type === "income" ? t.amount : -t.amount);
  }
  const bal = {};
  for (const [id, v] of Object.entries(byId)) planAdd(bal, planGroupOfId(id), v);
  return bal;
}

function planItems(endMonth) {
  const now = today(), cur = thisMonth();
  const items = [];
  for (const r of state.recurring) {
    const g = planGroupOfId(r.accountId);
    if (!g) continue;
    for (let m = r.lastRun ? nextMonthOf(r.lastRun) : r.start.slice(0, 7); m <= endMonth; m = nextMonthOf(m)) {
      const date = recurDate(r, m);
      if (date < r.start) continue;
      const inc = r.type === "income";
      items.push({ date, kind: inc ? "income" : "fixed", amount: r.amount, flows: [[g, inc ? r.amount : -r.amount]] });
    }
  }
  const [y, mo, d] = now.split("-").map(Number);
  const leftShare = (lastDayOf(y, mo) - d + 1) / lastDayOf(y, mo);
  for (let m = cur; m <= endMonth; m = nextMonthOf(m)) {
    for (const [cat, budget] of Object.entries(state.catBudgets)) {
      const spent = m === cur
        ? state.transactions.filter((t) => t.type === "expense" && t.category === cat && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0)
        : 0;
      const amount = m === cur ? Math.max(0, Math.min(budget - spent, budget * leftShare)) : budget;
      if (amount) items.push({ date: m === cur ? now : `${m}-15`, kind: "budget", amount, flows: [["日常", -amount]] });
    }
  }
  for (const b of state.bills.filter((x) => !x.paid)) {
    const date = b.due < now ? now : b.due;
    if (date.slice(0, 7) > endMonth) continue;
    items.push({
      date, kind: "bill", label: b.name, amount: b.amount,
      apply(bal) {
        const take = Math.min(b.amount, Math.max(0, bal[b.fund] || 0));
        planAdd(bal, b.fund, -take);
        planAdd(bal, "日常", take - b.amount);
        return take < b.amount ? `${b.name}：專戶不足，差 ${money(b.amount - take)} 需由日常支付` : "";
      },
    });
  }
  for (const e of state.plan.filter((x) => !x.done)) {
    const from = e.kind === "income" ? null : planGroupOfId(e.from);
    const to = e.kind === "expense" ? null : planToGroup(e);
    items.push({
      date: e.date < now ? now : e.date, kind: "plan", event: e, label: e.note, amount: e.amount,
      flows: [[from, -e.amount], [to, e.amount]].filter(([g]) => g),
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || PLAN_ORDER[a.kind] - PLAN_ORDER[b.kind]);
}

function projectPlan() {
  const cur = thisMonth(), end = planEndMonth();
  const start = [cur, ...Object.keys(state.planBaseline)].sort()[0];
  const items = planItems(end);
  const bal = {};
  state.accounts.filter((a) => !isDebt(a)).forEach((a) => planAdd(bal, a.purpose || "日常", a.balance));
  const rows = [];
  let low = null;
  for (let m = start; m <= end; m = nextMonthOf(m)) {
    if (m < cur) {
      const { income, expense } = monthTotals(m);
      const actions = state.plan.filter((e) => e.done && (e.doneDate || e.date).startsWith(m)).map((e) => ({ label: e.note, amount: e.amount, done: true }));
      rows.push({ month: m, actual: true, bal: balancesAt(`${m}-31`), income, spend: expense, actions, warn: [] });
      continue;
    }
    const row = { month: m, actual: false, income: 0, spend: 0, actions: [], warn: [] };
    for (const it of items.filter((i) => i.date.startsWith(m))) {
      if (it.apply) {
        const w = it.apply(bal);
        if (w) row.warn.push(w);
      } else it.flows.forEach(([g, v]) => planAdd(bal, g, v));
      const k = it.kind === "plan" ? it.event.kind : it.kind;
      if (k === "income") row.income += it.amount;
      else if (k !== "transfer") row.spend += it.amount;
      if (it.kind === "plan" || it.kind === "bill") row.actions.push({ label: it.label, amount: it.amount, bill: it.kind === "bill" });
      for (const [g, v] of Object.entries(bal))
        if (v < -0.005 && !row.warn.some((w) => w.startsWith(g))) row.warn.push(`${g}於 ${it.date.slice(5)} 不足（${money(v)}）`);
      const d = bal["日常"] ?? 0;
      if (!low || d < low.value) low = { value: d, date: it.date };
    }
    row.bal = { ...bal };
    rows.push(row);
  }
  const seen = new Set(["日常"]);
  for (const r of rows) Object.keys(r.bal).forEach((g) => seen.add(g));
  Object.values(state.planBaseline).forEach((b) => Object.keys(b).forEach((g) => seen.add(g)));
  return { rows, groups: [...seen], low };
}

function renderPlan() {
  const { rows, groups, low } = projectPlan();
  const base = state.planBaseline;
  const events = [...state.plan].sort((a, b) => a.date.localeCompare(b.date));
  const pending = events.filter((e) => !e.done);
  const next = pending[0];
  const last = rows.at(-1);
  const total = last ? Object.values(last.bal).reduce((s, v) => s + v, 0) : 0;

  $("#plan-cards").innerHTML =
    card("下一步", next ? money(next.amount) : "全部完成", next ? `${next.date}（${daysText(daysUntil(next.date))}）${esc(next.note)}` : "", C.cyan) +
    card("日常戶口預測最低點", low ? money(low.value) : "—", low ? `約於 ${low.date}` : "", low && low.value < 0 ? C.red : C.green) +
    card("計劃進度", `${events.length - pending.length} / ${events.length}`, "已完成的計劃動作", C.violet) +
    card("期末資金合計", money(total), last ? `${monthLabel(last.month)}底（不含信用卡）` : "", C.amber);

  const cell = (r, g) => {
    const v = r.bal[g] ?? 0;
    const b = base[r.month]?.[g];
    const diff = b != null ? v - b : 0;
    return `<td class="num">
      <b class="${v < -0.005 ? "expense" : ""}">${money(v)}</b>
      ${b != null ? `<small class="muted">計劃 ${moneyShort(b)}${Math.abs(diff) >= 1 ? ` <em class="${diff >= 0 ? "good" : "bad"}">${diff > 0 ? "+" : ""}${moneyShort(diff)}</em>` : ""}</small>` : ""}
    </td>`;
  };
  $("#plan-table").innerHTML = rows.length
    ? `<thead><tr><th>月份</th><th class="num">收入</th><th class="num">支出</th><th>主要動作</th>${groups.map((g) => `<th class="num">${esc(g)}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr class="${r.month === thisMonth() ? "current" : ""}">
          <td><b>${monthLabel(r.month)}</b><br /><small class="muted">${r.actual ? "實際" : r.month === thisMonth() ? "本月（預測）" : "預測"}</small></td>
          <td class="num income">${money(r.income)}</td>
          <td class="num expense">${money(r.spend)}</td>
          <td class="plan-acts">${r.actions.map((a) => `<span class="${a.bill ? "bill" : ""}">${esc(a.label)} ${moneyShort(a.amount)}</span>`).join("")}
            ${r.warn.map((w) => `<span class="warn">⚠ ${esc(w)}</span>`).join("")}</td>
          ${groups.map((g) => cell(r, g)).join("")}
        </tr>`
        )
        .join("")}</tbody>`
    : `<tbody><tr><td class="muted">暫無計劃</td></tr></tbody>`;

  $("#plan-chart").innerHTML = rows.length
    ? Charts.line(
        groups.map((g, i) => ({
          name: g, color: PLAN_COLORS[i % PLAN_COLORS.length], area: i === 0, dots: true,
          points: rows.map((r, x) => ({ x, y: r.bal[g] ?? 0, label: `${Number(r.month.slice(5))}月` })),
        })),
        { width: 1000, height: 260, fmt: money }
      )
    : `<div class="chart-empty">暫無計劃</div>`;

  $("#plan-list").innerHTML = events.length
    ? events
        .map((e) => {
          const overdue = !e.done && e.date < today();
          return `<li class="${e.done ? "done" : ""} ${overdue ? "overdue" : ""}">
            ${e.done ? `<span class="plan-date">${e.date}</span>` : `<input type="date" class="plan-date" value="${e.date}" data-plan-date="${e.id}" />`}
            <div class="plan-body"><b>${esc(e.note)}</b><small class="muted">${PLAN_KIND[e.kind]} · ${esc(planRoute(e))}${overdue ? " · <em class=\"bad\">已過期</em>" : ""}</small></div>
            <input type="number" class="cell-input num" step="0.01" min="0" value="${e.amount}" data-plan-amount="${e.id}" ${e.done ? "disabled" : ""} />
            ${e.done
              ? `<span class="muted tiny">已於 ${e.doneDate} 完成</span><button class="link" data-plan-undo="${e.id}">撤銷</button>`
              : `<button type="button" class="small" data-plan-do="${e.id}">完成</button>`}
            <button class="link" data-plan-del="${e.id}">✕</button>
          </li>`;
        })
        .join("")
    : `<li class="muted">暫無計劃動作</li>`;

  const f = $("#plan-form");
  const keep = (name) => f.elements[name].value;
  const from = keep("from"), to = keep("to");
  f.elements.from.innerHTML = accountOptions(from, "轉出／支付帳戶");
  f.elements.to.innerHTML = accountOptions(to, "轉入／收款帳戶");
}

function completePlan(e) {
  if (e.kind !== "income" && !e.from) return Effects.toast("請先設定轉出帳戶", "warn");
  const src = state.accounts.find((a) => a.id === e.from);
  if (src && !isDebt(src) && src.balance < e.amount && !confirm(`${src.name} 目前只有 ${money(src.balance)}，不足 ${money(e.amount)}。仍要記錄？`)) return;
  let to = e.to;
  if (e.kind !== "expense" && !to) {
    if (!e.toNew) return Effects.toast("請先設定轉入帳戶", "warn");
    let acc = state.accounts.find((a) => a.name === e.toNew.name);
    if (!acc) {
      acc = { id: uid(), name: e.toNew.name, type: e.toNew.type || "銀行", balance: 0, purpose: e.toNew.purpose || "", updated: today() };
      state.accounts.push(acc);
    }
    to = e.to = acc.id;
  }
  const base = { amount: e.amount, date: today(), note: e.note };
  const tx =
    e.kind === "transfer" ? addTx({ ...base, type: "transfer", category: "轉帳", accountId: e.from, toAccountId: to })
    : e.kind === "expense" ? addTx({ ...base, type: "expense", category: e.category || "其他", accountId: e.from })
    : addTx({ ...base, type: "income", category: e.category || "其他", accountId: to });
  Object.assign(e, { done: true, doneDate: today(), txId: tx.id });
  save(`已完成：${e.note}`);
}

function undoPlan(e) {
  const tx = state.transactions.find((t) => t.id === e.txId);
  if (tx) {
    applyTx(tx, -1);
    state.transactions = state.transactions.filter((t) => t !== tx);
  }
  Object.assign(e, { done: false, doneDate: null, txId: null });
  save("已撤銷，相關帳目已刪除");
}

function initPlan() {
  const find = (id) => state.plan.find((e) => e.id === id);
  document.addEventListener("click", (ev) => {
    const ds = ev.target.dataset || {};
    if (ds.planDo) completePlan(find(ds.planDo));
    else if (ds.planUndo && confirm("撤銷後會刪除相關的記帳記錄，確定？")) undoPlan(find(ds.planUndo));
    else if (ds.planDel && confirm("確定刪除此計劃動作？（已記入的帳目不受影響）")) {
      state.plan = state.plan.filter((e) => e.id !== ds.planDel);
      save("已刪除");
    }
  });
  document.addEventListener("change", (ev) => {
    const ds = ev.target.dataset || {};
    if (ds.planAmount) find(ds.planAmount).amount = parseFloat(ev.target.value) || 0;
    else if (ds.planDate && ev.target.value) find(ds.planDate).date = ev.target.value;
    else return;
    save();
  });
  $("#plan-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = formData(ev.target);
    if (d.kind !== "income" && !d.from) return Effects.toast("請選擇轉出／支付帳戶", "warn");
    if (d.kind !== "expense" && !d.to) return Effects.toast("請選擇轉入／收款帳戶", "warn");
    if (d.kind === "transfer" && d.from === d.to) return Effects.toast("轉出與轉入帳戶不可相同", "warn");
    state.plan.push({
      id: uid(), kind: d.kind, date: d.date, amount: parseFloat(d.amount), note: d.note.trim(),
      from: d.kind === "income" ? "" : d.from, to: d.kind === "expense" ? "" : d.to,
      category: d.kind === "transfer" ? "" : d.category.trim() || "其他", done: false,
    });
    ev.target.reset();
    save("已加入計劃");
  });
  $("#plan-rebase").addEventListener("click", () => {
    if (!confirm("以目前的預測取代原定計劃作比較基準？")) return;
    state.planBaseline = { ...state.planBaseline, ...Object.fromEntries(projectPlan().rows.filter((r) => !r.actual).map((r) => [r.month, r.bal])) };
    save("已更新計劃基準");
  });
}
