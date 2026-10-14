// 時間管理（月曆）：於 app.js 之前載入，只定義函數，由 app.js 初始化及渲染
const TIME_CATS = { 工作: "#3a6fb0", 學習: "#7d55a8", 運動: "#4e8f2c", 生活: "#d48a14", 社交: "#c0436d", 其他: "#9a8466" };
const REPEAT_LABEL = { none: "不重複", daily: "每日", weekdays: "逢星期一至五", weekly: "每週", monthly: "每月" };
const WEEK = "日一二三四五六";
let calView = null;
let evCat = "工作";

const parseDay = (s) => new Date(`${s}T00:00`);
const dayLabel = (s) => {
  const d = parseDay(s);
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
};

function occursOn(e, date) {
  if (date < e.date || (e.until && date > e.until)) return false;
  const a = parseDay(e.date), b = parseDay(date);
  switch (e.repeat) {
    case "daily": return true;
    case "weekdays": return b.getDay() % 6 !== 0;
    case "weekly": return a.getDay() === b.getDay();
    case "monthly": return b.getDate() === Math.min(a.getDate(), lastDayOf(b.getFullYear(), b.getMonth() + 1));
    default: return date === e.date;
  }
}
const isDoneOn = (e, date) => (e.doneDates || []).includes(date);
const eventsOn = (date) =>
  state.events.filter((e) => occursOn(e, date)).sort((a, b) => (a.start || "").localeCompare(b.start || "") || a.title.localeCompare(b.title));

function systemOn(date) {
  return [
    ...state.bills.filter((b) => !b.paid && b.due === date).map((b) => ({ title: `付款：${b.name} ${moneyShort(b.amount)}`, color: C.red })),
    ...state.plan.filter((e) => !e.done && e.date === date).map((e) => ({ title: `計劃：${e.note}`, color: C.cyan })),
    ...state.projects.filter((p) => p.deadline === date && projectStatus(p) !== "done").map((p) => ({ title: `截止：${p.name}`, color: C.violet })),
  ];
}

const timeText = (e) => (e.start ? `${e.start}${e.end ? `–${e.end}` : ""}` : "全日");

function renderTime() {
  calView ||= { month: thisMonth(), selected: today() };
  const { month, selected } = calView;
  const [y, m] = month.split("-").map(Number);
  $("#cal-label").textContent = `${y}年${m}月`;

  const t = today();
  const todayEvs = eventsOn(t);
  const weekStart = parseDay(t);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => ymd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)));
  const weekOcc = weekDays.flatMap((d) => eventsOn(d).map((e) => isDoneOn(e, d)));
  const weekDone = weekOcc.filter(Boolean).length;
  $("#time-cards").innerHTML =
    card("今日事項", `${todayEvs.length} 項`, todayEvs.length ? `已完成 ${todayEvs.filter((e) => isDoneOn(e, t)).length} 項` : "今日沒有安排", C.cyan) +
    card("本週事項", `${weekOcc.length} 項`, `${dayLabel(weekDays[0]).split(" ")[0]} 至 ${dayLabel(weekDays[6]).split(" ")[0]}`, C.violet) +
    card("本週完成率", weekOcc.length ? `${Math.round((weekDone / weekOcc.length) * 100)}%` : "—", `${weekDone} / ${weekOcc.length}`, C.green) +
    card("下一項", (() => {
      const now = new Date().toTimeString().slice(0, 5);
      const n = todayEvs.find((e) => !isDoneOn(e, t) && (!e.start || e.start >= now));
      return n ? esc(n.title) : "—";
    })(), "今日尚未完成的事項", C.amber);

  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  $("#cal-grid").innerHTML =
    [...WEEK].map((w, i) => `<div class="cal-head ${i % 6 === 0 ? "weekend" : ""}">${w}</div>`).join("") +
    cells
      .map((d) => {
        const evs = eventsOn(d);
        const sys = systemOn(d);
        const items = [
          ...sys.map((s) => `<div class="cal-ev sys" style="--c:${s.color}">${esc(s.title)}</div>`),
          ...evs.map((e) => `<div class="cal-ev ${isDoneOn(e, d) ? "done" : ""}" style="--c:${TIME_CATS[e.cat] || TIME_CATS.其他}">${e.start ? `<b>${e.start}</b> ` : ""}${esc(e.title)}</div>`),
        ];
        const cls = [d.slice(0, 7) !== month && "other", d === t && "today", d === selected && "selected", parseDay(d).getDay() % 6 === 0 && "weekend"].filter(Boolean).join(" ");
        return `<div class="cal-day ${cls}" data-cal-day="${d}">
          <span class="cal-num">${Number(d.slice(8))}</span>
          ${items.slice(0, 3).join("")}
          ${items.length > 3 ? `<div class="cal-more">另有 ${items.length - 3} 項</div>` : ""}
        </div>`;
      })
      .join("");

  $("#day-title").textContent = `${dayLabel(selected)}${selected === t ? "（今天）" : ""}`;
  const evs = eventsOn(selected);
  const sys = systemOn(selected);
  $("#day-list").innerHTML =
    sys.map((s) => `<li class="sys" style="--c:${s.color}"><span class="day-time">提醒</span><span class="day-title">${esc(s.title)}</span></li>`).join("") +
    (evs.length
      ? evs
          .map((e) => {
            const done = isDoneOn(e, selected);
            return `<li class="${done ? "done" : ""}" style="--c:${TIME_CATS[e.cat] || TIME_CATS.其他}">
              <input type="checkbox" ${done ? "checked" : ""} data-ev-done="${e.id}" title="完成" />
              <span class="day-time">${timeText(e)}</span>
              <span class="day-title">${esc(e.title)}${e.note ? `<small class="muted">${esc(e.note)}</small>` : ""}</span>
              <span class="day-tags"><em>${esc(e.cat)}</em>${e.repeat && e.repeat !== "none" ? `<em>${REPEAT_LABEL[e.repeat]}</em>` : ""}</span>
              <button class="link" data-ev-del="${e.id}" title="刪除">✕</button>
            </li>`;
          })
          .join("")
      : sys.length ? "" : `<li class="muted empty">這天沒有事項</li>`);

  const f = $("#ev-form");
  if (f.dataset.day !== selected) {
    f.elements.date.value = selected;
    f.dataset.day = selected;
  }
  $("#ev-cats").innerHTML = Object.entries(TIME_CATS)
    .map(([c, col]) => `<button type="button" class="chip ${c === evCat ? "on" : ""}" style="--c:${col}" data-ev-cat="${c}">${c}</button>`)
    .join("");

  const agenda = Array.from({ length: 7 }, (_, i) => {
    const d = parseDay(t);
    d.setDate(d.getDate() + i);
    const ds = ymd(d);
    return [ds, eventsOn(ds), systemOn(ds)];
  }).filter(([, e, s]) => e.length || s.length);
  $("#agenda").innerHTML = agenda.length
    ? agenda
        .map(
          ([d, evs, sys]) => `<div class="agenda-day">
            <div class="agenda-date"><b>${Number(d.slice(8))}</b><span>${d === t ? "今天" : `星期${WEEK[parseDay(d).getDay()]}`}</span></div>
            <ul>${[
              ...sys.map((s) => `<li class="sys" style="--c:${s.color}"><span>提醒</span>${esc(s.title)}</li>`),
              ...evs.map((e) => `<li class="${isDoneOn(e, d) ? "done" : ""}" style="--c:${TIME_CATS[e.cat] || TIME_CATS.其他}"><span>${timeText(e)}</span>${esc(e.title)}</li>`),
            ].join("")}</ul>
          </div>`
        )
        .join("")
    : `<div class="chart-empty">未來 7 天沒有安排</div>`;
}

function initTime() {
  const shift = (n) => {
    const [y, m] = calView.month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    calView.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    renderTime();
  };
  $("#cal-prev").addEventListener("click", () => shift(-1));
  $("#cal-next").addEventListener("click", () => shift(1));
  $("#cal-today").addEventListener("click", () => {
    calView = { month: thisMonth(), selected: today() };
    renderTime();
  });

  document.addEventListener("click", (ev) => {
    const day = ev.target.closest("[data-cal-day]");
    if (day) {
      calView.selected = day.dataset.calDay;
      if (calView.selected.slice(0, 7) !== calView.month) calView.month = calView.selected.slice(0, 7);
      renderTime();
      if (window.innerWidth < 1100) $("#day-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const cat = ev.target.closest("[data-ev-cat]");
    if (cat) {
      evCat = cat.dataset.evCat;
      renderTime();
      return;
    }
    const del = ev.target.dataset?.evDel;
    if (del) {
      const e = state.events.find((x) => x.id === del);
      const repeat = e.repeat && e.repeat !== "none";
      if (!confirm(repeat ? `「${e.title}」是重複事項，刪除後所有日子都會移除，確定？` : `確定刪除「${e.title}」？`)) return;
      state.events = state.events.filter((x) => x.id !== del);
      save("已刪除事項");
    }
  });

  document.addEventListener("change", (ev) => {
    const id = ev.target.dataset?.evDone;
    if (!id) return;
    const e = state.events.find((x) => x.id === id);
    const set = new Set(e.doneDates || []);
    ev.target.checked ? set.add(calView.selected) : set.delete(calView.selected);
    e.doneDates = [...set];
    save(ev.target.checked ? `已完成：${e.title}` : null);
  });

  $("#ev-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = formData(ev.target);
    if (d.start && d.end && d.end < d.start) return Effects.toast("結束時間不可早於開始時間", "warn");
    state.events.push({
      id: uid(), title: d.title.trim(), date: d.date, start: d.start, end: d.end,
      cat: evCat, repeat: d.repeat, until: d.until || "", note: d.note.trim(), doneDates: [],
    });
    calView.selected = d.date;
    calView.month = d.date.slice(0, 7);
    ["title", "start", "end", "note", "until"].forEach((k) => (ev.target.elements[k].value = ""));
    ev.target.elements.repeat.value = "none";
    save("已加入事項");
  });
}
