const Body = (() => {
  const FIELDS = [
    { key: "weight", label: "體重", unit: "kg", aliases: ["體重", "体重", "weight", "body weight"] },
    { key: "bodyFat", label: "體脂率", unit: "%", aliases: ["體脂率", "体脂率", "體脂肪率", "体脂肪率", "body fat", "bodyfat", "fat%"] },
    { key: "fatMass", label: "脂肪量", unit: "kg", aliases: ["脂肪量", "體脂肪量", "体脂肪量", "fat mass"] },
    { key: "muscle", label: "肌肉量", unit: "kg", aliases: ["肌肉量", "muscle mass"] },
    { key: "muscleRate", label: "肌肉率", unit: "%", aliases: ["肌肉率", "muscle rate", "muscle%"] },
    { key: "skeletalMuscle", label: "骨骼肌量", unit: "kg", aliases: ["骨骼肌量", "骨骼肌", "skeletal muscle"] },
    { key: "water", label: "水分率", unit: "%", aliases: ["身體水分率", "身体水分率", "體水分率", "体水分率", "水分率", "body water", "water%"] },
    { key: "protein", label: "蛋白質率", unit: "%", aliases: ["蛋白質率", "蛋白质率", "protein"] },
    { key: "bone", label: "骨鹽量", unit: "kg", aliases: ["骨鹽量", "骨盐量", "骨量", "bone mass"] },
    { key: "visceral", label: "內臟脂肪等級", unit: "級", aliases: ["內臟脂肪等級", "内脏脂肪等级", "內臟脂肪", "内脏脂肪", "visceral fat", "visceral"] },
    { key: "bmr", label: "基礎代謝", unit: "kcal", aliases: ["基礎代謝率", "基础代谢率", "基礎代謝", "基础代谢", "bmr"] },
    { key: "fatFree", label: "去脂體重", unit: "kg", aliases: ["去脂體重", "去脂体重", "fat-free mass", "fat free mass", "lean body mass"] },
    { key: "whr", label: "腰臀比", unit: "", aliases: ["腰臀比", "whr", "waist-hip ratio"] },
    { key: "bodyAge", label: "身體年齡", unit: "歲", aliases: ["身體年齡", "身体年龄", "body age", "metabolic age"] },
    { key: "heartRate", label: "心率", unit: "bpm", aliases: ["心率", "heart rate"] },
    { key: "score", label: "身體得分", unit: "分", aliases: ["身體得分", "身体得分", "身體評分", "body score", "score"] },
  ];
  const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  const DATE_ALIASES = ["日期", "測量日期", "测量日期", "測量時間", "测量时间", "時間", "时间", "date", "time", "datetime"];

  // 越細越好(down) / 越大越好(up)
  const BETTER = {
    bodyFat: "down", fatMass: "down", visceral: "down", whr: "down", bodyAge: "down",
    muscle: "up", muscleRate: "up", skeletalMuscle: "up", water: "up", protein: "up", bone: "up", bmr: "up", fatFree: "up", score: "up",
  };

  const ACTIVITY = [
    { value: 1.2, label: "久坐（幾乎不運動）" },
    { value: 1.375, label: "輕度（每星期運動 1–3 次）" },
    { value: 1.55, label: "中度（每星期運動 3–5 次）" },
    { value: 1.725, label: "高度（每星期運動 6–7 次）" },
  ];

  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => new Date().toLocaleDateString("sv-SE");
  const dayMs = (d) => new Date(d).getTime();
  const r1 = (v) => Number(Number(v).toFixed(1));
  const signed = (v, d = 1) => `${v > 0 ? "+" : ""}${Number(v.toFixed(d))}`;

  function standards(gender) {
    const male = gender !== "female";
    return {
      bmi: { lo: 18.5, hi: 23, bad: 25, min: 15, max: 35, lowLabel: "過輕", highLabel: "過重", badLabel: "肥胖" },
      bodyFat: male
        ? { lo: 10, hi: 20, bad: 25, min: 5, max: 40, lowLabel: "偏低", highLabel: "偏高", badLabel: "肥胖" }
        : { lo: 20, hi: 30, bad: 35, min: 10, max: 45, lowLabel: "偏低", highLabel: "偏高", badLabel: "肥胖" },
      muscleRate: male
        ? { lo: 65, hi: 85, min: 50, max: 90, lowLabel: "不足", highGood: true, highLabel: "優秀" }
        : { lo: 55, hi: 75, min: 40, max: 85, lowLabel: "不足", highGood: true, highLabel: "優秀" },
      water: male
        ? { lo: 50, hi: 65, min: 40, max: 75, lowLabel: "偏低", highGood: true, highLabel: "充足" }
        : { lo: 45, hi: 60, min: 35, max: 70, lowLabel: "偏低", highGood: true, highLabel: "充足" },
      protein: { lo: 16, hi: 20, min: 10, max: 25, lowLabel: "不足", highGood: true, highLabel: "充足" },
      bone: male
        ? { lo: 2.5, hi: 4, min: 1.5, max: 5, lowLabel: "偏低", highGood: true, highLabel: "良好" }
        : { lo: 1.8, hi: 3, min: 1, max: 4, lowLabel: "偏低", highGood: true, highLabel: "良好" },
      visceral: { lo: 0, hi: 9, bad: 14, min: 1, max: 20, highLabel: "偏高", badLabel: "過高" },
      whr: male
        ? { lo: 0, hi: 0.9, bad: 1.0, min: 0.6, max: 1.1, highLabel: "偏高", badLabel: "中央肥胖" }
        : { lo: 0, hi: 0.85, bad: 0.9, min: 0.6, max: 1.1, highLabel: "偏高", badLabel: "中央肥胖" },
      heartRate: { lo: 60, hi: 100, min: 40, max: 130, lowLabel: "偏慢", highLabel: "偏快" },
    };
  }

  function status(key, v, gender) {
    const s = standards(gender)[key];
    if (!s || v == null) return null;
    if (v < s.lo) return { label: s.lowLabel || "偏低", level: s.lowGood ? "good" : "warn" };
    if (v > s.hi) {
      if (s.highGood) return { label: s.highLabel, level: "good" };
      if (s.bad != null && v >= s.bad) return { label: s.badLabel, level: "bad" };
      return { label: s.highLabel, level: "warn" };
    }
    return { label: "標準", level: "good" };
  }

  function score(key, v, gender) {
    const s = standards(gender)[key];
    if (!s || v == null) return null;
    if ((v >= s.lo && v <= s.hi) || (v > s.hi && s.highGood)) return 100;
    const d = v < s.lo ? s.lo - v : v - s.hi;
    return Math.max(10, 100 - (d / (s.hi - s.lo || 1)) * 100);
  }

  function derive(r, height) {
    const d = { ...r };
    if (d.bodyFat == null && d.fatMass != null) d.bodyFat = (d.fatMass / d.weight) * 100;
    if (d.fatMass == null && d.bodyFat != null) d.fatMass = (d.weight * d.bodyFat) / 100;
    if (d.fatFree == null && d.fatMass != null) d.fatFree = d.weight - d.fatMass;
    if (d.muscleRate == null && d.muscle != null) d.muscleRate = (d.muscle / d.weight) * 100;
    if (d.muscle == null && d.muscleRate != null) d.muscle = (d.weight * d.muscleRate) / 100;
    if (d.water != null) d.waterKg = (d.weight * d.water) / 100;
    if (d.protein != null) d.proteinKg = (d.weight * d.protein) / 100;
    if (height) d.bmi = d.weight / (height / 100) ** 2;
    return d;
  }

  const TYPES = {
    "high-low": ["健美肌肉型", "BMI 偏高但體脂低，重量主要來自肌肉，屬運動員體格。"],
    "high-mid": ["肌肉型偏胖", "肌肉量不錯，但整體體重偏重。適度減脂便會相當理想。"],
    "high-high": ["肥胖型", "體重及體脂均超標。應優先減脂，同時進行阻力訓練以保持肌肉。"],
    "mid-low": ["標準肌肉型", "體重標準而體脂低，肌肉發達，是最理想的類型之一。"],
    "mid-mid": ["標準型", "體重及體脂均在標準範圍內，請繼續保持。"],
    "mid-high": ["隱性肥胖型", "體重看似正常，但體脂偏高、肌肉偏少。需要增肌減脂，切勿只靠節食。"],
    "low-low": ["偏瘦肌肉型", "身形偏瘦但肌肉比例不錯，可適度增重增肌。"],
    "low-mid": ["偏瘦型", "體重偏輕，建議增加熱量及蛋白質攝取，配合重量訓練。"],
    "low-high": ["偏瘦脂肪型", "體重輕但體脂比例偏高，肌肉嚴重不足，最需要增肌。"],
  };

  function bodyType(cur, gender) {
    if (cur.bmi == null || cur.bodyFat == null) return null;
    const fs = standards(gender).bodyFat;
    const b = cur.bmi < 18.5 ? "low" : cur.bmi < 25 ? "mid" : "high";
    const f = cur.bodyFat < fs.lo ? "low" : cur.bodyFat <= fs.hi ? "mid" : "high";
    const [name, desc] = TYPES[`${b}-${f}`];
    return { key: `${b}-${f}`, name, desc };
  }

  function analyze(list, profile, targetWeight) {
    const height = profile.height;
    const g = profile.gender;
    const all = list.map((r) => derive(r, height));
    const withBody = all.filter((r) => r.bodyFat != null);
    const cur = withBody.at(-1) || all.at(-1);
    if (!cur) return null;
    const prev = withBody.length >= 2 ? withBody.at(-2) : all.length >= 2 && cur === all.at(-1) ? all.at(-2) : null;
    const std = standards(g);
    const h2 = (height / 100) ** 2;
    const insights = [];
    const add = (level, title, text) => insights.push({ level, title, text });

    if (cur.bmi != null) {
      const st = status("bmi", cur.bmi, g);
      const lo = 18.5 * h2, hi = 23 * h2;
      add(
        st.level,
        `BMI ${cur.bmi.toFixed(1)}（${st.label}）`,
        `以你 ${height} cm 計算，亞洲標準健康體重為 ${lo.toFixed(1)}–${hi.toFixed(1)} kg。` +
          (cur.weight > hi
            ? `目前高出上限 ${(cur.weight - hi).toFixed(1)} kg。`
            : cur.weight < lo
              ? `目前低於下限 ${(lo - cur.weight).toFixed(1)} kg。`
              : "目前處於健康範圍內。")
      );
    }

    if (cur.bodyFat != null) {
      const s = std.bodyFat;
      const st = status("bodyFat", cur.bodyFat, g);
      const excess = cur.weight - cur.fatFree / (1 - s.hi / 100);
      add(
        st.level,
        `體脂率 ${r1(cur.bodyFat)}%（${st.label}）`,
        `脂肪量約 ${cur.fatMass.toFixed(1)} kg，去脂體重 ${cur.fatFree.toFixed(1)} kg。` +
          (cur.bodyFat > s.hi
            ? `若要將體脂率降至標準上限 ${s.hi}%，在保持肌肉的前提下約需減去 ${excess.toFixed(1)} kg 脂肪。`
            : cur.bodyFat < s.lo
              ? "體脂偏低，請留意荷爾蒙及免疫力，切勿再過度節食。"
              : `處於標準範圍（${s.lo}–${s.hi}%），請繼續保持。`)
      );
    }

    if (cur.visceral != null) {
      const st = status("visceral", cur.visceral, g);
      add(
        st.level,
        `內臟脂肪 ${cur.visceral} 級（${st.label}）`,
        cur.visceral >= 10
          ? "內臟脂肪包圍肝臟及腸道，與三高、脂肪肝關係最密切。它對帶氧運動、減少糖分、酒精及精製澱粉的反應最快，通常是減脂初期最先下降的部分。目標是降至 9 級或以下。"
          : "內臟脂肪處於安全範圍（9 級或以下），請繼續保持。"
      );
    }

    if (cur.muscleRate != null) {
      const st = status("muscleRate", cur.muscleRate, g);
      add(
        st.level,
        `肌肉率 ${r1(cur.muscleRate)}%（${st.label}）`,
        st.level === "good"
          ? `肌肉量 ${cur.muscle.toFixed(1)} kg${cur.skeletalMuscle ? `，骨骼肌 ${cur.skeletalMuscle} kg` : ""}，基礎良好。減重期間須保持肌肉，基礎代謝才不會下降。`
          : "肌肉比例偏低，建議每星期做 2–3 次阻力訓練（例如深蹲、掌上壓、器械訓練），配合足夠蛋白質。"
      );
    }

    if (cur.water != null) {
      const st = status("water", cur.water, g);
      if (st.level !== "good")
        add("warn", `水分率 ${cur.water}%（${st.label}）`, `建議每日飲用約 ${(cur.weight * 0.035).toFixed(1)} 公升水。體脂較高的人水分率通常偏低，減脂後會自然改善。`);
    }

    if (cur.protein != null && cur.protein < std.protein.lo)
      add("warn", `蛋白質率 ${cur.protein}%（不足）`, "蛋白質不足會令肌肉流失、免疫力下降。每餐增加一份手掌大小的蛋白質（雞胸、魚、蛋、豆腐）。");

    if (cur.whr != null) {
      const st = status("whr", cur.whr, g);
      if (st.level !== "good") add(st.level, `腰臀比 ${cur.whr}（${st.label}）`, "腰臀比高代表脂肪集中於腹部（中央肥胖），心血管風險較高。");
    }

    if (cur.bodyAge != null && profile.age) {
      const diff = cur.bodyAge - profile.age;
      add(
        diff <= 0 ? "good" : "warn",
        `身體年齡 ${cur.bodyAge} 歲`,
        diff < 0
          ? `比實際年齡年輕 ${-diff} 歲，代謝狀態良好。`
          : diff === 0
            ? "與實際年齡相同。"
            : `比實際年齡大 ${diff} 歲。增加肌肉量及降低體脂可降低身體年齡。`
      );
    }

    if (prev) {
      const days = Math.max(1, Math.round((dayMs(cur.date) - dayMs(prev.date)) / 86400000));
      const dw = cur.weight - prev.weight;
      const dFat = cur.fatMass != null && prev.fatMass != null ? cur.fatMass - prev.fatMass : null;
      const dLean = cur.fatFree != null && prev.fatFree != null ? cur.fatFree - prev.fatFree : null;
      const note = days <= 3 ? "（短時間內的變化多為水分，觀察一至兩星期的趨勢會更準確。）" : "";
      if (dw < -0.05) {
        if (dFat != null && dLean != null && dLean < 0 && -dLean > -dFat) {
          add("warn", `${days} 天內減少 ${(-dw).toFixed(1)} kg，但去脂體重下降多於脂肪`,
            `脂肪 ${signed(dFat)} kg、去脂體重（肌肉及水分）${signed(dLean)} kg。可能是水分流失，或熱量赤字過大。建議提高蛋白質攝取，並加入阻力訓練。${note}`);
        } else {
          add("good", `${days} 天內減少 ${(-dw).toFixed(1)} kg`,
            (dFat != null ? `其中脂肪 ${signed(dFat)} kg` : "方向正確") +
              (dLean != null ? `，去脂體重 ${signed(dLean)} kg` : "") + `，屬於優質減重。${note}`);
        }
        const weekly = (dw / days) * 7;
        if (days >= 7 && weekly < -1)
          add("warn", "減重速度偏快", `平均每星期減 ${(-weekly).toFixed(1)} kg，超過建議的 0.5–1 kg。減得太快容易流失肌肉及反彈。`);
      } else if (dw > 0.05) {
        add(dFat != null && dFat <= 0 ? "good" : "warn", `${days} 天內增加 ${dw.toFixed(1)} kg`,
          dFat != null
            ? dFat > 0
              ? `脂肪增加 ${dFat.toFixed(1)} kg，請留意飲食及運動量。${note}`
              : `脂肪沒有增加，增重主要來自肌肉或水分。${note}`
            : `請留意飲食及運動量。${note}`);
      } else {
        add("info", "體重持平", "與上次相若，請留意體脂及肌肉的變化。");
      }
    }

    const type = bodyType(cur, g);
    if (type) add("info", `身體類型：${type.name}`, type.desc);

    return { cur, prev, insights, plan: plan(cur, profile, targetWeight), type };
  }

  function plan(cur, profile, targetWeight) {
    const h = profile.height / 100;
    const g = profile.gender;
    const age = profile.age || 30;
    const ideal = 22 * h * h;
    const bmr = cur.bmr || Math.round(10 * cur.weight + 6.25 * profile.height - 5 * age + (g === "female" ? -161 : 5));
    const activity = ACTIVITY.find((a) => a.value === Number(profile.activity)) || ACTIVITY[1];
    const tdee = Math.round(bmr * activity.value);
    const goalFat = g === "female" ? 25 : 15;
    const fatTargetWeight = cur.fatFree != null ? cur.fatFree / (1 - goalFat / 100) : null;
    const target = targetWeight || fatTargetWeight || ideal;
    const toLose = cur.weight - target;
    const needLose = toLose > 0.5;
    const intake = Math.round(needLose ? Math.max(bmr, tdee - 500) : tdee);
    const perWeek = ((tdee - intake) * 7) / 7700;
    const weeks = needLose && perWeek > 0 ? Math.ceil(toLose / perWeek) : null;
    const protein = Math.round((cur.fatFree || cur.weight * 0.8) * 1.6);
    const eta = weeks ? new Date(Date.now() + weeks * 7 * 86400000).toLocaleDateString("sv-SE") : null;

    return [
      { label: "理想體重（BMI 22）", value: `${ideal.toFixed(1)} kg` },
      fatTargetWeight && { label: `體脂 ${goalFat}% 時體重`, value: `${fatTargetWeight.toFixed(1)} kg`, note: "保持現有肌肉量計" },
      { label: "目標體重", value: `${target.toFixed(1)} kg`, note: targetWeight ? "你設定的目標" : "自動建議", hl: true },
      { label: "基礎代謝", value: `${bmr} kcal`, note: cur.bmr ? "體脂磅數據" : "公式估算" },
      { label: "每日總消耗", value: `${tdee} kcal`, note: activity.label },
      { label: "建議每日攝取", value: `${intake} kcal`, note: needLose ? "每日赤字約 500 kcal，切勿低於基礎代謝" : "維持體重", hl: true },
      { label: "每日蛋白質", value: `${protein} g`, note: "每公斤去脂體重 1.6 g" },
      { label: "每日飲水", value: `${(cur.weight * 0.035).toFixed(1)} L` },
      weeks && { label: "預計達標", value: `約 ${weeks} 星期`, note: `${eta} 左右（每星期約 −${perWeek.toFixed(2)} kg）`, hl: true },
    ].filter(Boolean);
  }

  // ---------- 匯入解析 ----------
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function normDate(s) {
    const str = String(s);
    let m = str.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
  }

  const ALL_ALIASES = FIELDS.flatMap((f) => f.aliases.map((a) => ({ a: a.toLowerCase(), key: f.key }))).sort(
    (x, y) => y.a.length - x.a.length
  );

  function matchHeader(h) {
    const clean = h.toLowerCase().replace(/[（(][^)）]*[)）]/g, "").replace(/["']/g, "").trim();
    if (DATE_ALIASES.some((a) => clean === a || clean.includes(a))) return "date";
    const exact = ALL_ALIASES.find(({ a }) => clean === a);
    if (exact) return exact.key;
    return ALL_ALIASES.find(({ a }) => clean.includes(a))?.key || null;
  }

  function splitLine(line, sep) {
    const out = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const head = lines[0];
    const count = (c) => head.split(c).length - 1;
    const sep = count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
    if (count(sep) < 1) return null;
    const map = splitLine(head, sep).map(matchHeader);
    if (!map.includes("weight")) return null;
    return lines.slice(1).map((line) => {
      const cells = splitLine(line, sep);
      const rec = {};
      map.forEach((key, i) => {
        if (!key || cells[i] == null || cells[i] === "") return;
        if (key === "date") rec.date = normDate(cells[i]);
        else {
          const n = parseFloat(cells[i].replace(/[^\d.\-]/g, ""));
          if (!isNaN(n)) rec[key] = n;
        }
      });
      rec.date = rec.date || todayStr();
      return rec;
    }).filter((r) => r.weight > 0);
  }

  function parseText(text) {
    let t = text;
    const rec = {};
    for (const { a, key } of ALL_ALIASES) {
      if (rec[key] != null) continue;
      const m = t.match(new RegExp(escRe(a) + "[^\\d\\-\\n]{0,8}?(-?\\d+(?:\\.\\d+)?)", "i"));
      if (m) {
        rec[key] = parseFloat(m[1]);
        t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length);
      }
    }
    if (!(rec.weight > 0)) return [];
    return [{ date: normDate(text) || todayStr(), ...rec }];
  }

  function parse(text) {
    return parseCSV(text) || parseText(text);
  }

  function csvTemplate() {
    return "\uFEFF" + ["日期", ...FIELDS.map((f) => f.label)].join(",") + "\n";
  }

  return { FIELDS, FIELD, BETTER, ACTIVITY, standards, status, score, derive, bodyType, analyze, parse, csvTemplate, TYPES };
})();
