// 登入閘：擋隨便入場；個人帳目仍只在本機 localStorage
const Auth = (() => {
  const SESSION_KEY = "techo-auth-ok";
  const readyCallbacks = [];
  let booted = false;

  const unlocked = () => sessionStorage.getItem(SESSION_KEY) === "1";

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
      // 延遲 focus，等手機瀏覽器完成 layout
      setTimeout(() => {
        try { input.focus({ preventScroll: false }); } catch { input.focus(); }
      }, 100);
    }
  }

  async function tryUnlock(password) {
    const expected = window.AUTH_CONFIG?.passwordHash;
    if (!expected) throw new Error("未設定密碼雜湊");
    const got = await sha256(password);
    if (got !== expected.toLowerCase()) return false;
    sessionStorage.setItem(SESSION_KEY, "1");
    showApp();
    return true;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    // 重新載入最乾淨，避免殘留 modal／canvas 擋住下一次登入
    location.reload();
  }

  /** 登入成功後才執行（已登入則立即執行） */
  function onReady(fn) {
    if (typeof fn !== "function") return;
    if (document.documentElement.classList.contains("authed") || booted) fn();
    else readyCallbacks.push(fn);
  }

  function init() {
    if (!window.AUTH_CONFIG?.passwordHash) {
      console.warn("AUTH_CONFIG.passwordHash 未設定，已略過登入閘");
      showApp();
      return;
    }
    if (unlocked()) showApp();
    else lockApp();

    const form = document.getElementById("auth-form");
    const err = document.getElementById("auth-error");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (err) err.textContent = "";
        const password = form.elements.password.value;
        try {
          const ok = await tryUnlock(password);
          if (!ok) {
            if (err) err.textContent = "密碼不正確";
            form.elements.password.focus();
            form.elements.password.select();
          }
        } catch (e) {
          if (err) err.textContent = "無法驗證密碼";
        }
      });
      // 點整張卡都聚焦密碼欄（方便手機）
      form.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("button, input, a")) return;
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
