// 操作音效：以 Web Audio 即時合成柔和的紙、木、音樂盒聲，毋須音檔；不播放背景音樂
const Sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, sfxBus, verb;
  const N = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const prefs = () => Effects.prefs;

  function makeVerb() {
    const len = ctx.sampleRate * 1.6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver(), wet = ctx.createGain();
    conv.buffer = buf;
    wet.gain.value = 0.18;
    conv.connect(wet).connect(master);
    return conv;
  }

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6000;
      master.connect(lp).connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      verb = makeVerb();
      sfxBus.connect(verb);
      apply();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function apply() {
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(prefs().sfx ? prefs().sfxVol : 0, ctx.currentTime, 0.05);
  }

  // 柔和撥音：正弦基音加少量泛音，快起慢收，似音樂盒或木琴
  function bell({ f, at = ctx.currentTime, dur = 0.8, vol = 0.08, partials = [[1, 1], [2, 0.25], [3, 0.08]] }) {
    for (const [mul, amp] of partials) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f * mul, at);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol * amp, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur / mul ** 0.5);
      o.connect(g).connect(sfxBus);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  let noiseBuf = null;
  function noise({ at = ctx.currentTime, dur, vol = 0.05, freq = 3000, q = 0.8, type = "bandpass", sweep, attack = 0.004 }) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, at);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  const arp = (notes, step, opts = {}) => {
    const t = ctx.currentTime;
    notes.forEach((m, i) => bell({ f: N(m), at: t + i * step, ...opts }));
  };

  const SFX = {
    // 鉛筆輕點紙面
    click: () => {
      noise({ dur: 0.035, vol: 0.06, freq: 2600, q: 1.2 });
      bell({ f: N(79), dur: 0.12, vol: 0.02, partials: [[1, 1]] });
    },
    hover: () => noise({ dur: 0.02, vol: 0.015, freq: 4200, q: 2 }),
    // 翻頁：紙張掃過的沙沙聲
    page: () => {
      const t = ctx.currentTime;
      noise({ at: t, dur: 0.22, vol: 0.05, freq: 1200, sweep: 5200, q: 0.6, attack: 0.06 });
      noise({ at: t + 0.12, dur: 0.12, vol: 0.025, freq: 3500, q: 1 });
    },
    // 柔和雙音，似風鈴
    chime: () => arp([84, 91], 0.09, { dur: 1.1, vol: 0.05 }),
    success: () => arp([72, 76, 79], 0.08, { dur: 1, vol: 0.05 }),
    // 音樂盒短句
    fanfare: () => {
      arp([72, 76, 79, 84, 88], 0.11, { dur: 1.4, vol: 0.05 });
      bell({ f: N(48), at: ctx.currentTime, dur: 1.6, vol: 0.05, partials: [[1, 1], [2, 0.15]] });
    },
    // 木珠輕敲
    coin: () => bell({ f: N(81), dur: 0.25, vol: 0.05, partials: [[1, 1], [2.76, 0.3]] }),
    warn: () => arp([76, 72], 0.14, { dur: 0.6, vol: 0.05 }),
    error: () => {
      bell({ f: N(57), dur: 0.5, vol: 0.06, partials: [[1, 1], [2.4, 0.2]] });
      noise({ dur: 0.08, vol: 0.03, freq: 600, q: 1 });
    },
    // 擦去鉛筆字
    delete: () => noise({ dur: 0.28, vol: 0.05, freq: 1800, sweep: 700, q: 0.7, attack: 0.03 }),
  };

  let lastHover = 0;
  function play(name) {
    if (!prefs().sfx || !ctx || ctx.state !== "running") return;
    if (name === "hover") {
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
    }
    try { SFX[name]?.(); } catch {}
  }

  const unlock = () => ensure();

  return { play, unlock, apply };
})();
