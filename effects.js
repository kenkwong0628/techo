const Effects = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PREFS_KEY = "ai-secretary-prefs";
  const prefs = {
    sfx: true, sfxVol: 0.6, particles: !reduce,
    remindDays: 7, lastExport: null, snoozeUntil: null,
    ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"),
  };
  prefs.bgm = false;
  const setPref = (k, v) => {
    prefs[k] = v;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  };

  function countUp(root) {
    if (reduce) return;
    root.querySelectorAll(".card .value, .count-up").forEach((el) => {
      const text = el.textContent;
      const m = text.match(/-?\d[\d,]*(\.\d+)?/);
      if (!m) return;
      const target = parseFloat(m[0].replace(/,/g, ""));
      const dec = m[1] ? m[1].length - 1 : 0;
      const comma = m[0].includes(",");
      const pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length);
      const start = performance.now(), dur = 800;
      const step = (now) => {
        if (!el.isConnected) return;
        const t = Math.min((now - start) / dur, 1);
        const v = target * (1 - Math.pow(1 - t, 3));
        const num = comma
          ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
          : v.toFixed(dec);
        el.textContent = pre + num + post;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function enterView(view) {
    if (!view) return;
    view.classList.remove("animate");
    void view.offsetWidth;
    view.classList.add("animate");
    clearTimeout(view._animTimer);
    view._animTimer = setTimeout(() => view.classList.remove("animate"), 2200);
    countUp(view);
  }

  // ---------- 粒子（淡墨塵） ----------
  const GOLD = ["#c4b49a", "#a89878", "#d8c8aa"];
  const MAGIC = ["#a89878", "#8a9a8e", "#b8a888", "#9a8a70", "#8a8070"];
  const DUST = ["#d8c8aa", "#c4b49a", "#e8dcc8", "#b8a888"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let bg, fx, bgc, fxc, W = 0, H = 0, dpr = 1;
  let motes = [], sparks = [], rings = [], running = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    for (const [c, x] of [[bg, bgc], [fx, fxc]]) {
      c.width = W * dpr; c.height = H * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    motes = Array.from({ length: Math.round((W * H) / 40000) }, () => newMote(true));
  }
  function newMote(anywhere) {
    return {
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 10,
      r: Math.random() * 3 + 2.5, vy: -(Math.random() * 0.3 + 0.1), drift: Math.random() * 6.28,
      c: pick(DUST), p: Math.random() * 6.28,
    };
  }
  function star4(ctx, x, y, r, color, alpha, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.28 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    bgc.clearRect(0, 0, W, H);
    if (prefs.particles) {
      for (const m of motes) {
        m.y += m.vy;
        m.x += Math.sin(t * 0.6 + m.drift) * 0.3;
        if (m.y < -10) Object.assign(m, newMote(false));
        star4(bgc, m.x, m.y, m.r * (0.7 + 0.3 * Math.sin(t * 3 + m.p)), m.c, 0.55 + 0.35 * Math.sin(t * 2 + m.p), t + m.p);
      }
      bgc.globalAlpha = 1;
    }

    fxc.clearRect(0, 0, W, H);
    if (sparks.length || rings.length) {
      for (const r of rings) {
        r.life -= r.decay;
        const k = 1 - r.life;
        fxc.globalAlpha = Math.max(r.life, 0);
        fxc.strokeStyle = r.c;
        fxc.lineWidth = 2 * r.life + 0.5;
        fxc.beginPath();
        fxc.arc(r.x, r.y, r.r * k, 0, 6.283);
        fxc.stroke();
        if (r.rune) {
          fxc.setLineDash([4, 6]);
          fxc.beginPath();
          fxc.arc(r.x, r.y, r.r * k * 0.75, k * 3, k * 3 + 6.283);
          fxc.stroke();
          fxc.setLineDash([]);
        }
      }
      rings = rings.filter((r) => r.life > 0);
      for (const p of sparks) {
        p.x += p.vx; p.y += p.vy;
        p.vx *= p.f; p.vy = p.vy * p.f + p.g;
        p.life -= p.decay;
        p.rot += p.vr;
        if (p.shape === "star") star4(fxc, p.x, p.y, p.r * (0.8 + p.life), p.c, Math.max(p.life, 0), p.rot);
        else {
          fxc.globalAlpha = Math.max(p.life, 0);
          fxc.fillStyle = p.c;
          fxc.beginPath();
          fxc.arc(p.x, p.y, p.r * (0.5 + p.life * 0.6), 0, 6.283);
          fxc.fill();
        }
      }
      sparks = sparks.filter((p) => p.life > 0);
      fxc.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  function spark(x, y, o = {}) {
    const a = o.angle ?? Math.random() * 6.283, sp = (o.speed ?? 3) * (0.4 + Math.random());
    sparks.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? 0.04, f: o.f ?? 0.95,
      r: o.r ?? Math.random() * 2.5 + 1.5, c: o.c ?? pick(GOLD), life: 1, decay: o.decay ?? 0.02 + Math.random() * 0.02,
      shape: o.shape ?? (Math.random() < 0.4 ? "star" : "dot"), rot: Math.random() * 3, vr: (Math.random() - 0.5) * 0.2,
    });
  }
  function burst(x, y, n = 14, colors = GOLD) {
    if (!prefs.particles) return;
    for (let i = 0; i < n; i++) spark(x, y, { c: pick(colors), shape: "dot" });
    rings.push({ x, y, r: 28, c: "#8a9a8e", life: 1, decay: 0.05 });
  }
  function celebrate(x = W / 2, y = H / 2) {
    if (!prefs.particles) return;
    for (let i = 0; i < 60; i++) spark(x, y, { speed: 5, c: pick(MAGIC), r: Math.random() * 3 + 1.5, decay: 0.01 + Math.random() * 0.012, g: 0.05, f: 0.97, shape: "dot" });
    rings.push({ x, y, r: 140, c: "#6b7f78", life: 1, decay: 0.018 });
    rings.push({ x, y, r: 200, c: "#5a7a78", life: 1, decay: 0.014 });
  }

  let lastTrail = 0;
  function trail(e) {
    if (!prefs.particles || reduce) return;
    const now = performance.now();
    if (now - lastTrail < 28) return;
    lastTrail = now;
    spark(e.clientX, e.clientY, { speed: 0.6, g: 0.02, r: Math.random() * 1.8 + 1, decay: 0.035, c: pick(MAGIC), shape: Math.random() < 0.3 ? "star" : "dot" });
  }

  // ---------- 通知 ----------
  function toast(msg, type = "ok") {
    let box = document.getElementById("toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${type === "ok" ? "·" : type === "warn" ? "！" : "✕"}</span>${msg}`;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3100);

    if (type === "warn") return Sound.play("warn");
    if (type === "error") return Sound.play("error");
    if (/刪除|移除|清除/.test(msg)) return Sound.play("delete");
    if (/完成|達成|恭喜|匯出/.test(msg)) {
      Sound.play("fanfare");
      return celebrate();
    }
    Sound.play("success");
  }

  // ---------- 偏好設定介面 ----------
  function syncControls() {
    const sfxBtn = document.getElementById("sfx-toggle");
    if (sfxBtn) {
      sfxBtn.classList.toggle("on", prefs.sfx);
      sfxBtn.textContent = prefs.sfx ? "音" : "靜";
      sfxBtn.title = prefs.sfx ? "音效：開" : "音效：關";
    }
    const set = (id, prop, v) => { const el = document.getElementById(id); if (el) el[prop] = v; };
    set("pref-sfx", "checked", prefs.sfx);
    set("pref-sfx-vol", "value", Math.round(prefs.sfxVol * 100));
    set("pref-particles", "checked", prefs.particles);
  }
  function setSfx(on) {
    setPref("sfx", on);
    Sound.apply();
    if (on) Sound.play("chime");
    syncControls();
  }

  function init() {
    bg = document.createElement("canvas");
    bg.id = "magic-canvas";
    fx = document.createElement("canvas");
    fx.id = "fx-canvas";
    document.body.prepend(bg);
    document.body.append(fx);
    bgc = bg.getContext("2d");
    fxc = fx.getContext("2d");
    resize();
    addEventListener("resize", resize);
    running = true;
    requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });

    const unlock = () => {
      Sound.unlock();
      syncControls();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    document.addEventListener("pointermove", trail, { passive: true });
    document.addEventListener("pointerdown", (e) => {
      const el = e.target.closest("button, a, .chip, [data-cal-day], label, summary, select, input[type=checkbox], input[type=range]");
      if (!el) return;
      if (el.matches(".sidebar a")) {
        Sound.play("page");
        burst(e.clientX, e.clientY, 14, MAGIC);
      } else {
        if (!el.matches("input[type=checkbox]")) Sound.play("click");
        burst(e.clientX, e.clientY, 8);
      }
    });
    let hovered = null;
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest(".sidebar a, button.chip, .cal-day");
      if (el && el !== hovered) Sound.play("hover");
      hovered = el;
    });
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (el.matches("input[type=checkbox]") && el.checked && !el.id.startsWith("pref-")) {
        Sound.play("chime");
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 16, MAGIC);
      }
      if (el.matches("input[type=range]") && !el.id.startsWith("pref-")) Sound.play("coin");
    });

    document.getElementById("sfx-toggle")?.addEventListener("click", () => setSfx(!prefs.sfx));
    document.getElementById("pref-sfx")?.addEventListener("change", (e) => setSfx(e.target.checked));
    document.getElementById("pref-sfx-vol")?.addEventListener("input", (e) => { setPref("sfxVol", e.target.value / 100); Sound.apply(); });
    document.getElementById("pref-sfx-vol")?.addEventListener("change", () => Sound.play("chime"));
    document.getElementById("pref-particles")?.addEventListener("change", (e) => { setPref("particles", e.target.checked); syncControls(); });
    syncControls();
  }

  return { init, enterView, countUp, toast, burst, celebrate, prefs, setPref, syncControls };
})();
