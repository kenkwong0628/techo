// 登入閘：記住此裝置（localStorage），唔使每次開 App 都輸入密碼
const Auth = (() => {
  const SESSION_KEY = "techo-auth-ok"; // 舊版 sessionStorage，會清走
  const STORE_KEY = "techo-auth";
  const DAYS = 90; // 記住約 3 個月；按「登出」即失效
  const readyCallbacks = [];
  let booted = false;

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function unlocked() {
    const s = readStore();
    if (!s || !s.until) return false;
    if (Date.now() > s.until) {
      localStorage.removeItem(STORE_KEY);
      return false;
    }
    return true;
  }

  function remember(days = DAYS) {
    localStorage.setItem(STORE_KEY, JSON.stringify({ until: Date.now() + days * 86400000 }));
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  function forget() {
    localStorage.removeItem(STORE_KEY);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function closeBlockingUi() {
    document.querySelectorAll("dialog[open]").forEach((d) => {
      try { d.close(); } catch {}
    });
  }

  function setShellLocked(locked) {
    const root = document.getElementById("app-root");
    if (root) {
      if (locked) root.setAttribute("inert", "");
      else root.removeAttribute("inert");
    }
  }

  function flushReady() {
    if (booted) return;
    booted = true;
    const fns = readyCallbacks.splice(0);
    for (const fn of fns) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  function showApp() {
    closeBlockingUi();
    setShellLocked(false);
    document.documentElement.classList.add("authed");
    document.getElementById("auth-gate")?.setAttribute("hidden", "");
    flushReady();
  }

  function lockApp() {
    closeBlockingUi();
    setShellLocked(true);
    document.documentElement.classList.remove("authed");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.removeAttribute("hidden");
    const input = document.getElementById("auth-password") || document.querySelector("#auth-form [name=password]");
    if (input) {
      input.value = "";
      setTimeout(() => {
        try { input.focus({ preventScroll: false }); } catch { input.focus(); }
      }, 100);
    }
  }

  async function tryUnlock(password, keep = true) {
    const expected = window.AUTH_CONFIG?.passwordHash;
    if (!expected) throw new Error("未設定密碼雜湊");
    const got = await sha256(password);
    if (got !== expected.toLowerCase()) return false;
    if (keep) remember(DAYS);
    else {
      // 只記今次瀏覽階段
      sessionStorage.setItem(SESSION_KEY, "1");
      localStorage.removeItem(STORE_KEY);
    }
    showApp();
    return true;
  }

  function logout() {
    forget();
    location.reload();
  }

  function onReady(fn) {
    if (typeof fn !== "function") return;
    if (document.documentElement.classList.contains("authed") || booted) fn();
    else readyCallbacks.push(fn);
  }

  function init() {
    // 兼容舊版：曾用 sessionStorage 登入過，今次仍放行並改為記住
    if (!unlocked() && sessionStorage.getItem(SESSION_KEY) === "1") remember(DAYS);

    if (!window.AUTH_CONFIG?.passwordHash) {
      console.warn("AUTH_CONFIG.passwordHash 未設定，已略過登入閘");
      showApp();
      return;
    }
    if (unlocked() || sessionStorage.getItem(SESSION_KEY) === "1") showApp();
    else lockApp();

    const form = document.getElementById("auth-form");
    const err = document.getElementById("auth-error");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (err) err.textContent = "";
        const password = form.elements.password.value;
        const keep = form.elements.remember ? form.elements.remember.checked : true;
        try {
          const ok = await tryUnlock(password, keep);
          if (!ok) {
            if (err) err.textContent = "密碼不正確";
            form.elements.password.focus();
            form.elements.password.select();
          }
        } catch (e) {
          if (err) err.textContent = "無法驗證密碼";
        }
      });
      form.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("button, input, a, label")) return;
        const input = form.elements.password;
        if (input) input.focus();
      });
    }
    const logoutBtn = document.getElementById("auth-logout");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", () => logout());
    }
  }

  return { init, logout, unlocked, onReady, showApp, lockApp };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Auth.init());
} else {
  Auth.init();
}
