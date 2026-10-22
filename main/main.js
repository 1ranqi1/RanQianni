import { encrypted, quickEncrypted } from "../class/data.js";
import { initClass, renderClass, clearClass } from "../class/class.js";
import { initDDL, renderDDL, clearDDL } from "../DDL/DDL.js";
import { initWebsite, renderWebsite, clearWebsite } from "../website/website.js";
import { $, putText } from "./utils.js";

const themeStorageKey = "ranqi.theme.v1";

const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6L6 18M18 6l1.6-1.6"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.7 8.7 0 1 0 10.6 10.6Z"/></svg>';

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  for (const button of document.querySelectorAll("[data-theme-toggle]")) {
    // 当前是夜间 → 显示太阳（点击切回白天）；当前是白天 → 显示月亮
    const isDark = theme === "dark";
    button.innerHTML = isDark ? SUN_ICON : MOON_ICON;
    button.setAttribute("aria-label", isDark ? "切换到白天模式" : "切换到夜间模式");
    button.setAttribute("title", isDark ? "切换到白天模式" : "切换到夜间模式");
    button.classList.add("theme-icon-button");
  }
  try { localStorage.setItem(themeStorageKey, theme); } catch {}
}

function showView(view) {
  $("class-root").classList.toggle("hidden", view !== "class");
  $("ddl-root").classList.toggle("hidden", view !== "ddl");
  $("website-root").classList.toggle("hidden", view !== "website");

  if (view === "ddl") renderDDL();
  if (view === "website") renderWebsite();

  const placeholder = ["one", "two", "three"].includes(view);
  $("placeholder-view").classList.toggle("hidden", !placeholder);
  if (placeholder) {
    const number = { one: 1, two: 2, three: 3 }[view];
    putText("placeholder-title", `板块${["", "一", "二", "三"][number]}`);
    putText("placeholder-badge", String(number).padStart(2, "0"));
  }

  for (const button of document.querySelectorAll(".nav-button")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function unlock(password, payload = encrypted) {
  const bytes = new TextEncoder().encode(password);
  const source = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: decode(payload.salt), iterations: payload.iterations, hash: "SHA-256" },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(payload.iv) },
    key,
    decode(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function updateLoginMode() {
  const quick = $("username").value.trim() === "1";
  $("password-field").classList.toggle("hidden", quick);
  $("password").required = !quick;
  if (quick) $("password").value = "";
  $("login-button").textContent = quick ? "快速进入" : "进入学习空间";
}

async function loadSection(root, path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`无法加载 ${path}`);
  $(root).innerHTML = await response.text();
}

async function start() {
  let savedTheme = "light";
  try { if (localStorage.getItem(themeStorageKey) === "dark") savedTheme = "dark"; } catch {}
  setTheme(savedTheme);

  await Promise.all([
    loadSection("class-root", "../class/class.html"),
    loadSection("ddl-root", "../DDL/DDL.html"),
    loadSection("website-root", "../website/website.html")
  ]);

  initClass();
  initDDL();
  initWebsite();

  for (const button of document.querySelectorAll("[data-theme-toggle]")) {
    button.addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  $("username").addEventListener("input", updateLoginMode);
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    putText("login-error", "");
    const button = $("login-button");
    button.disabled = true;
    button.textContent = "正在验证…";
    try {
      const username = $("username").value.trim();
      let data;
      if (username === "1") data = await unlock("1", quickEncrypted);
      else if (username === "ranqi") data = await unlock($("password").value);
      else throw new Error("invalid");

      renderClass(data);
      putText("term", data.term);
      putText("student", data.student);
      showView("class");
      $("login").classList.add("hidden");
      $("app").classList.remove("hidden");
      $("app").removeAttribute("aria-hidden");
      $("password").value = "";
    } catch {
      putText("login-error", "用户名或密码不正确");
      $("password").value = "";
      ( $("username").value.trim() === "1" ? $("username") : $("password") ).focus();
    } finally {
      button.disabled = false;
      updateLoginMode();
    }
  });

  for (const button of document.querySelectorAll(".nav-button")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }

  $("logout").addEventListener("click", () => {
    clearClass();
    clearDDL();
    clearWebsite();
    $("app").classList.add("hidden");
    $("app").setAttribute("aria-hidden", "true");
    $("login").classList.remove("hidden");
    $("login-form").reset();
    updateLoginMode();
    $("username").focus();
  });
}

start().catch(error => {
  console.error(error);
  putText("login-error", "页面文件加载失败。请确认 main、class、DDL、website 文件夹都已上传。");
  $("login-button").disabled = true;
});
