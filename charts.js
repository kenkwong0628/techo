const Charts = (() => {
  const PALETTE = ["#2a8f86", "#c0436d", "#7d55a8", "#4e8f2c", "#d48a14", "#c0392b", "#3a6fb0", "#9a8466"];
  let seq = 0;
  const nextId = () => `chart${++seq}`;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const empty = (msg = "暫無數據") => `<div class="chart-empty">${msg}</div>`;
  const plain = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
    if (a >= 100 || Number.isInteger(v)) return String(Math.round(v));
    return v.toFixed(1);
  };
  const legend = (series) =>
    `<div class="chart-legend">${series
      .map((s) => `<span><i style="background:${s.color};box-shadow:0 0 8px ${s.color}"></i>${esc(s.name)}</span>`)
      .join("")}</div>`;

  // items: [{ label, value, color? }]
  function donut(items, { center = "", sub = "", fmt = plain } = {}) {
    const data = items.filter((i) => i.value > 0);
    const total = data.reduce((s, i) => s + i.value, 0);
    if (!total) return empty();
    const r = 62, C = 2 * Math.PI * r;
    let offset = 0;
    const colored = data.map((it, i) => ({ ...it, color: it.color || PALETTE[i % PALETTE.length] }));
    const segs = colored
      .map((it, i) => {
        const len = (it.value / total) * C;
        const gap = colored.length > 1 ? 2 : 0;
        const seg = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${it.color}" stroke-width="16"
          stroke-dasharray="${Math.max(len - gap, 0.1)} ${C}" stroke-dashoffset="${-offset}"
          transform="rotate(-90 80 80)" class="arc" style="--i:${i}">
          <title>${esc(it.label)}：${fmt(it.value)}（${((it.value / total) * 100).toFixed(1)}%）</title></circle>`;
        offset += len;
        return seg;
      })
      .join("");

    return `<div class="donut">
      <svg viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="${r}" class="track" stroke-width="16" />
        <circle cx="80" cy="80" r="${r - 18}" class="inner-ring" />
        <circle cx="80" cy="80" r="${r + 13}" class="outer-ring" />
        ${segs}
        <text x="80" y="${sub ? 80 : 86}" text-anchor="middle" class="donut-center">${esc(center)}</text>
        ${sub ? `<text x="80" y="98" text-anchor="middle" class="donut-sub">${esc(sub)}</text>` : ""}
      </svg>
      <ul class="legend">${colored
        .map(
          (it) => `<li>
          <i style="background:${it.color};box-shadow:0 0 8px ${it.color}"></i>
          <span>${esc(it.label)}</span>
          <b>${fmt(it.value)}</b>
          <em>${((it.value / total) * 100).toFixed(0)}%</em>
        </li>`
        )
        .join("")}</ul>
    </div>`;
  }

  function ring(pct, { label = "", text, sub = "", color = PALETTE[0] } = {}) {
    const r = 40, C = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(pct || 0, 100));
    return `<div class="ring">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="47" class="ring-deco" />
        <circle cx="50" cy="50" r="${r}" class="track" stroke-width="8" />
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-linecap="${p > 0 ? "round" : "butt"}" stroke-dasharray="${(C * p) / 100} ${C}"
          transform="rotate(-90 50 50)" class="arc" />
        <text x="50" y="${sub ? 51 : 56}" text-anchor="middle" class="ring-text">${esc(text ?? Math.round(pct || 0) + "%")}</text>
        ${sub ? `<text x="50" y="66" text-anchor="middle" class="ring-sub">${esc(sub)}</text>` : ""}
      </svg>
      ${label ? `<div class="ring-label" title="${esc(label)}">${esc(label)}</div>` : ""}
    </div>`;
  }

  // series: [{ name, color, values: number[] }]
  function bars(labels, series, { width = 600, height = 220, fmt = plain, colorFn, labelEvery } = {}) {
    const all = series.flatMap((s) => s.values);
    if (!labels.length || !all.some((v) => v)) return empty();
    const W = width, H = height, P = { l: 46, r: 10, t: 14, b: 26 };
    let max = Math.max(0, ...all), min = Math.min(0, ...all);
    const span = max - min || 1;
    if (max > 0) max += span * 0.08;
    if (min < 0) min -= span * 0.08;
    const y = (v) => P.t + ((max - v) / (max - min)) * (H - P.t - P.b);
    const gw = (W - P.l - P.r) / labels.length;
    const bw = Math.min(26, (gw * 0.72) / series.length);
    const id = nextId();

    const defs = series
      .map(
        (s, j) => `<linearGradient id="${id}-${j}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${s.color}" stop-opacity="1" />
        <stop offset="1" stop-color="${s.color}" stop-opacity="0.2" />
      </linearGradient>`
      )
      .join("");

    const grid = [0, 1, 2, 3, 4]
      .map((k) => {
        const v = min + ((max - min) * k) / 4;
        return `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid-line" />
          <text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${compact(v)}</text>`;
      })
      .join("");
    const zero = min < 0 ? `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="zero-line" />` : "";

    const rects = labels
      .map((label, i) =>
        series
          .map((s, j) => {
            const v = s.values[i] || 0;
            if (!v) return "";
            const top = y(Math.max(v, 0)), bottom = y(Math.min(v, 0));
            const x = P.l + gw * i + (gw - bw * series.length) / 2 + j * bw;
            const fill = colorFn ? colorFn(v) : `url(#${id}-${j})`;
            return `<rect x="${x + 1}" y="${top}" width="${Math.max(bw - 2, 1)}" height="${Math.max(bottom - top, 1)}"
              rx="3" fill="${fill}" class="bar-rect"
              style="--i:${i};transform-origin:${v >= 0 ? "bottom" : "top"}">
              <title>${esc(label)} ${esc(s.name)}：${fmt(v)}</title></rect>`;
          })
          .join("")
      )
      .join("");

    const step = labelEvery || Math.ceil(labels.length / 12);
    const xLabels = labels
      .map((l, i) =>
        i % step === 0
          ? `<text x="${P.l + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(l)}</text>`
          : ""
      )
      .join("");

    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">
      <defs>${defs}</defs>${grid}${zero}${rects}${xLabels}
    </svg>${series.length > 1 ? legend(series) : ""}`;
  }

  // series: [{ name, color, points: [{ x, y, label }], area?, dashed?, dots? }]
  function line(series, { width = 600, height = 240, target = null, targetLabel = "目標", fmt = plain, band = null } = {}) {
    if (!series.length || series[0].points.length < 2) return empty("至少需要兩個數據點才能繪圖");
    const W = width, H = height, P = { l: 46, r: 14, t: 16, b: 26 };
    const pts = series.flatMap((s) => s.points);
    let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    if (x0 === x1) x1 = x0 + 1;
    const ys = pts.map((p) => p.y).concat(target != null ? [target] : [], band || []);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
    const pad = (y1 - y0) * 0.12;
    y0 = y0 >= 0 ? Math.max(0, y0 - pad) : y0 - pad;
    y1 += pad;
    const X = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
    const Y = (v) => P.t + ((y1 - v) / (y1 - y0)) * (H - P.t - P.b);
    const id = nextId();

    const grid = [0, 1, 2, 3, 4]
      .map((k) => {
        const v = y0 + ((y1 - y0) * k) / 4;
        return `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid-line" />
          <text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${compact(v)}</text>`;
      })
      .join("");

    const bandRect = band
      ? `<rect x="${P.l}" y="${Y(band[1])}" width="${W - P.l - P.r}" height="${Y(band[0]) - Y(band[1])}" class="std-band" />
         <text x="${P.l + 6}" y="${Y(band[1]) + 13}" class="std-band-text">標準範圍</text>`
      : "";

    const paths = series
      .map((s, j) => {
        if (s.points.length < 2) return "";
        const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
        const first = s.points[0], last = s.points.at(-1);
        const area = s.area
          ? `<linearGradient id="${id}-a${j}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${s.color}" stop-opacity="0.35" />
              <stop offset="1" stop-color="${s.color}" stop-opacity="0" />
            </linearGradient>
            <path d="${d} L${X(last.x)},${H - P.b} L${X(first.x)},${H - P.b} Z" fill="url(#${id}-a${j})" class="fade-in" />`
          : "";
        const dots = s.dots
          ? s.points
              .map(
                (p, i) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5" fill="#fbf2da" stroke="${s.color}" stroke-width="2"
                  class="dot" style="--i:${i}"><title>${esc(p.label)}：${fmt(p.y)}</title></circle>`
              )
              .join("")
          : "";
        const lastDot = s.dots
          ? `<circle cx="${X(last.x)}" cy="${Y(last.y)}" r="6" fill="none" stroke="${s.color}" class="ping" />`
          : "";
        const pathAttrs = s.dashed ? 'stroke-dasharray="6 5" class="fade-in"' : 'pathLength="1" class="line-draw"';
        return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"
          ${pathAttrs} />${dots}${lastDot}`;
      })
      .join("");

    const targetLine =
      target != null
        ? `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(target)}" y2="${Y(target)}" class="target-line" />
           <text x="${W - P.r}" y="${Y(target) - 6}" text-anchor="end" class="target-text">${esc(targetLabel)} ${fmt(target)}</text>`
        : "";

    const base = series[0].points;
    const labelIdx = [...new Set([0, Math.floor((base.length - 1) / 2), base.length - 1])];
    const xLabels = labelIdx
      .map((i) => {
        const anchor = i === 0 ? "start" : i === base.length - 1 ? "end" : "middle";
        return `<text x="${X(base[i].x)}" y="${H - 6}" text-anchor="${anchor}" class="axis">${esc(base[i].label)}</text>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${grid}${bandRect}${targetLine}${paths}${xLabels}</svg>${
      series.length > 1 ? legend(series) : ""
    }`;
  }

  // axes: [{ label, value (0–100), display }]
  function radar(axes, { color = PALETTE[0] } = {}) {
    if (axes.length < 3) return empty("至少需要 3 項指標才能繪製雷達圖");
    const W = 320, H = 290, cx = 160, cy = 145, R = 95, n = axes.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
    const poly = (r) => axes.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");

    const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${poly(R * k)}" class="radar-grid" />`).join("");
    const spokes = axes.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-grid" />`; }).join("");
    const shape = axes.map((a, i) => pt(i, (R * a.value) / 100).map((v) => v.toFixed(1)).join(",")).join(" ");
    const dots = axes
      .map((a, i) => {
        const [x, y] = pt(i, (R * a.value) / 100);
        const c = a.value >= 99 ? "#4e8f2c" : a.value >= 60 ? "#d48a14" : "#c0392b";
        return `<circle cx="${x}" cy="${y}" r="4" fill="${c}" class="dot" style="--i:${i}">
          <title>${esc(a.label)}：${esc(a.display)}</title></circle>`;
      })
      .join("");
    const labels = axes
      .map((a, i) => {
        const [x, y] = pt(i, R + 22);
        const cos = Math.cos(ang(i));
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label">${esc(a.label)}
          <tspan x="${x}" dy="13" class="radar-value">${esc(a.display)}</tspan></text>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg radar">
      ${rings}${spokes}
      <g class="radar-sweep" style="transform-origin:${cx}px ${cy}px">
        <path d="M${cx},${cy} L${cx},${cy - R} A${R},${R} 0 0,1 ${pt(1, R)[0]},${pt(1, R)[1]} Z" class="sweep" />
      </g>
      <polygon points="${shape}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2"
        class="radar-shape" style="transform-origin:${cx}px ${cy}px" />
      ${dots}${labels}
    </svg>`;
  }

  return { donut, ring, bars, line, radar, PALETTE };
})();
