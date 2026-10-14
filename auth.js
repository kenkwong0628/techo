// 登入閘：擋隨便入場；個人帳目仍只在本機 localStorage
const Auth = (() => {
  const SESSION_KEY = "techo-auth-ok";

  const unlocked = () => sessionStorage.getItem(SESSION_KEY) === "1";

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function showApp() {
    document.documentElement.classList.add("authed");
    document.getElementById("auth-gate")?.setAttribute("hidden", "");
  }

  function lockApp() {
    document.documentElement.classList.remove("authed");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.removeAttribute("hidden");
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
    lockApp();
    const input = document.querySelector("#auth-form [name=password]");
    if (input) input.value = "";
  }

  function init() {
    if (!window.AUTH_CONFIG?.passwordHash) {
      console.warn("AUTH_CONFIG.passwordHash 未設定，已略過登入閘");
      showApp();
      return;
    }
    if (unlocked()) {
      showApp();
      return;
    }
    lockApp();
    const form = document.getElementById("auth-form");
    const err = document.getElementById("auth-error");
    form?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.textContent = "";
      const password = form.elements.password.value;
      try {
        const ok = await tryUnlock(password);
        if (!ok) {
          err.textContent = "密碼不正確";
          Sound?.play?.("warn");
          form.elements.password.select();
        } else {
          Sound?.play?.("chime");
        }
      } catch (e) {
        err.textContent = "無法驗證密碼";
      }
    });
    document.getElementById("auth-logout")?.addEventListener("click", () => {
      logout();
      Sound?.play?.("page");
    });
  }

  return { init, logout, unlocked };
})();

document.addEventListener("DOMContentLoaded", () => Auth.init());
