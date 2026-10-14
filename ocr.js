const ScaleOCR = (() => {
  const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const NUM = /-?\d+(?:[.,·]\d+)?/;
  const RANGE = {
    weight: [20, 300], bodyFat: [2, 70], fatMass: [1, 200], muscle: [10, 150], muscleRate: [20, 95],
    skeletalMuscle: [5, 100], water: [25, 85], protein: [5, 30], bone: [0.5, 8], visceral: [1, 30],
    bmr: [700, 4500], fatFree: [15, 200], whr: [0.5, 1.5], bodyAge: [10, 100],
    heartRate: [30, 220], score: [1, 100],
  };
  // 這些是建議值／目標值，不是量度結果
  const IGNORE = ["標準體重", "标准体重", "理想體重", "目標", "目标", "控制", "建議", "建议"];

  let loading = null;
  let worker = null;
  let progressCb = null;

  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    if (!loading)
      loading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = CDN;
        s.onload = resolve;
        s.onerror = () => {
          loading = null;
          reject(new Error("載入文字辨識引擎失敗，請檢查網絡連線"));
        };
        document.head.appendChild(s);
      });
    return loading;
  }

  async function getWorker() {
    await loadLib();
    if (!worker) worker = await Tesseract.createWorker(["chi_tra", "eng"], 1, { logger: (m) => progressCb?.(m) });
    return worker;
  }

  async function prepare(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 1400 / img.width));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const v = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] || 0;
  };
  const toNum = (s) => parseFloat(String(s).replace(/[,·]/g, "."));
  const plausible = (key, v) => v != null && !isNaN(v) && (!RANGE[key] || (v >= RANGE[key][0] && v <= RANGE[key][1]));

  // 將同一行內距離相近的字合併成一段
  function segments(data) {
    const segs = [];
    for (const line of data.lines || []) {
      const words = (line.words || []).filter((w) => w.text.trim());
      if (!words.length) continue;
      const h = median(words.map((w) => w.bbox.y1 - w.bbox.y0)) || 10;
      let cur = null;
      for (const w of words) {
        const b = w.bbox;
        if (cur && b.x0 - cur.x1 < h * 1.8) {
          cur.text += w.text;
          cur.x1 = b.x1;
          cur.y0 = Math.min(cur.y0, b.y0);
          cur.y1 = Math.max(cur.y1, b.y1);
          cur.h = Math.max(cur.h, b.y1 - b.y0);
        } else {
          if (cur) segs.push(cur);
          cur = { text: w.text, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, h: b.y1 - b.y0 };
        }
      }
      segs.push(cur);
    }
    return segs.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ""), cy: (s.y0 + s.y1) / 2 }));
  }

  function nearestValue(label, numSegs, key) {
    const cands = [];
    for (const n of numSegs) {
      if (n === label) continue;
      const overlapX = Math.min(n.x1, label.x1) - Math.max(n.x0, label.x0) > -label.h * 0.5;
      const sameLine = Math.abs(n.cy - label.cy) < label.h * 0.7 && n.x0 >= label.x1 - 2;
      const above = label.y0 - n.y1;
      const below = n.y0 - label.y1;
      let score = null;
      if (sameLine && n.x0 - label.x1 < label.h * 8) score = ((n.x0 - label.x1) / label.h) * 0.4;
      else if (overlapX && above > -label.h * 0.3 && above < label.h * 3) score = above / label.h;
      else if (overlapX && below > -label.h * 0.3 && below < label.h * 3) score = (below / label.h) * 1.3 + 0.2;
      if (score != null) cands.push({ n, score });
    }
    cands.sort((a, b) => a.score - b.score);
    for (const { n } of cands) {
      const m = n.text.match(NUM);
      const v = m ? toNum(m[0]) : null;
      if (plausible(key, v)) return v;
    }
    return null;
  }

  function biggestWeight(segs) {
    const numeric = segs.filter((s) => /\d/.test(s.text)).sort((a, b) => b.h - a.h);
    for (const s of numeric.slice(0, 3)) {
      const m = s.text.match(/(\d{2,3})(?:[.,·](\d))?/);
      if (!m) continue;
      let v = m[2] ? toNum(`${m[1]}.${m[2]}`) : parseInt(m[1]);
      if (!m[2]) {
        const next = segs.find((t) => t !== s && Math.abs(t.cy - s.cy) < s.h && t.x0 >= s.x1 - 2 && t.x0 - s.x1 < s.h);
        const dm = next?.text.match(/^[.,·]?(\d)/);
        if (dm) v = toNum(`${m[1]}.${dm[1]}`);
        else if (v > 300) v = v / 10;
      }
      if (plausible("weight", v)) return v;
    }
    return null;
  }

  function extract(data) {
    const segs = segments(data);
    const numSegs = segs.filter((s) => NUM.test(s.text));
    const aliases = Body.FIELDS.flatMap((f) => f.aliases.map((a) => ({ a: a.toLowerCase().replace(/\s+/g, ""), key: f.key }))).sort(
      (x, y) => y.a.length - x.a.length
    );
    const found = {};

    for (const seg of segs) {
      const norm = seg.text.toLowerCase();
      if (IGNORE.some((w) => norm.includes(w))) continue;
      const hit = aliases.find(({ a }) => norm.includes(a));
      if (!hit || found[hit.key] != null) continue;
      const after = seg.text.slice(norm.indexOf(hit.a) + hit.a.length).match(NUM);
      let v = after ? toNum(after[0]) : null;
      if (!plausible(hit.key, v)) v = nearestValue(seg, numSegs, hit.key);
      if (v != null) found[hit.key] = v;
    }

    const big = biggestWeight(segs);
    if (found.weight == null && big != null) found.weight = big;

    const dm = (data.text || "").match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    const date = dm ? sensibleDate(`${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`) : null;
    return { values: found, date };
  }

  // 小字日期容易讀錯年份，一年以前或未來的日期不採用
  function sensibleDate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return null;
    const age = (Date.now() - new Date(d).getTime()) / 86400000;
    return age >= -1 && age <= 366 ? d : null;
  }

  // ---------- Gemini AI 辨識 ----------
  const GEMINI_KEY = "ai-secretary-gemini";
  const getGemini = () => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(GEMINI_KEY)) || {};
    } catch {}
    return { ...stored, key: stored.key || window.SECRET_KEYS?.gemini || "" };
  };
  const setGemini = (cfg) => localStorage.setItem(GEMINI_KEY, JSON.stringify(cfg));

  async function toBase64Jpeg(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / img.width);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.92).split(",")[1];
  }

  function geminiPrompt() {
    const fields = Body.FIELDS.map((f) => `- ${f.key}: ${f.label}${f.unit ? `（${f.unit}）` : ""}`).join("\n");
    return `這是體脂磅 App 的測量結果截圖。請讀出以下指標的「測量數值」，只回傳 JSON。
規則：
- 只使用以下 key，數值用純數字（不含單位），截圖中沒有的 key 不要包括。
- 不要讀取「標準體重」「體重控制」「脂肪控制」這類建議值或目標值。
- 不要讀取「↑0.4」「↓0.7」這類與上次比較的變化值。
- water 是水分「百分比」，不是身體水分公斤數；protein 是蛋白質「百分比」，不是公斤數。
- 如果截圖有測量日期，加一個 "date"，格式 YYYY-MM-DD。
指標：
${fields}`;
  }

  async function scanGemini(file, cfg, onProgress) {
    onProgress?.({ status: "gemini upload", progress: 0.2 });
    const data = await toBase64Jpeg(file);
    onProgress?.({ status: "gemini thinking", progress: 0.5 });
    const model = cfg.model && !/pro/i.test(cfg.model) ? cfg.model : "gemini-flash-latest";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": cfg.key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data } }, { text: geminiPrompt() }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini 出錯：${json.error?.message || res.status}`);
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
    const raw = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    const values = {};
    for (const f of Body.FIELDS) {
      const v = toNum(raw[f.key]);
      if (plausible(f.key, v)) values[f.key] = v;
    }
    return { values, date: sensibleDate(raw.date), engine: "gemini" };
  }

  async function scanLocal(file, onProgress) {
    progressCb = onProgress;
    onProgress?.({ status: "loading engine", progress: 0 });
    const w = await getWorker();
    const canvas = await prepare(file);
    const { data } = await w.recognize(canvas);
    return { ...extract(data), text: data.text, engine: "local" };
  }

  async function scan(file, onProgress) {
    const cfg = getGemini();
    return cfg.key ? scanGemini(file, cfg, onProgress) : scanLocal(file, onProgress);
  }

  return { scan, getGemini, setGemini };
})();
