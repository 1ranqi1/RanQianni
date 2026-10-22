import { manualWebsites } from "./data.js";
import { $, make, putText } from "../main/utils.js";

const storageKey = "ranqi.websites.v1";
let localWebsites = [];
let editingId = null;

function normalizeUrl(value) {
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

function fileWebsites() {
  return manualWebsites.flatMap((item, index) => {
    if (!item || typeof item.name !== "string" || typeof item.url !== "string") return [];
    const url = normalizeUrl(item.url);
    if (!url) return [];
    return [{
      id: `file-${index}`,
      source: "file",
      name: item.name,
      url,
      note: typeof item.note === "string" ? item.note : ""
    }];
  });
}

function readLocalWebsites() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(item =>
      item && typeof item.id === "string" && typeof item.name === "string" &&
      typeof item.url === "string" && typeof item.note === "string" &&
      /^https?:\/\//.test(item.url)
    );
  } catch { return []; }
}

function saveLocalWebsites() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(localWebsites));
    putText("website-status", "已保存到当前浏览器。");
  } catch {
    putText("website-status", "当前浏览器无法保存，关闭页面后可能丢失。");
  }
}

function resetForm() {
  $("website-form").reset();
  $("website-form").classList.add("hidden");
  editingId = null;
  putText("website-submit", "保存网址");
  putText("website-status", "");
}

export function renderWebsite() {
  const list = $("website-list");
  list.replaceChildren();
  const all = [...fileWebsites(), ...localWebsites];
  if (!all.length) {
    const row = document.createElement("tr");
    const cell = make("td", "website-empty", "还没有常用网站。可编辑 website/data.js，或点击下方“新增网址”。");
    cell.colSpan = 4;
    row.append(cell);
    list.append(row);
    return;
  }

  for (const item of all) {
    const row = document.createElement("tr");
    const name = make("td", "", item.name);
    const urlCell = document.createElement("td");
    const link = make("a", "", item.url);
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    urlCell.append(link);
    const note = make("td", "", item.note);
    const actions = make("td", "site-actions");

    if (item.source === "file") {
      actions.append(make("span", "file-note", "文件中维护"));
    } else {
      const edit = make("button", "", "编辑");
      edit.type = "button";
      edit.addEventListener("click", () => {
        editingId = item.id;
        $("website-name").value = item.name;
        $("website-url").value = item.url;
        $("website-note").value = item.note;
        putText("website-submit", "保存修改");
        $("website-form").classList.remove("hidden");
        $("website-name").focus();
      });
      const remove = make("button", "", "删除");
      remove.type = "button";
      remove.addEventListener("click", () => {
        if (!confirm(`确定删除「${item.name}」吗？`)) return;
        localWebsites = localWebsites.filter(value => value.id !== item.id);
        if (editingId === item.id) resetForm();
        saveLocalWebsites();
        renderWebsite();
      });
      actions.append(edit, remove);
    }
    row.append(name, urlCell, note, actions);
    list.append(row);
  }
}

export function initWebsite() {
  localWebsites = readLocalWebsites();
  $("website-add-button").addEventListener("click", () => {
    resetForm();
    $("website-form").classList.remove("hidden");
    $("website-name").focus();
  });
  $("website-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("website-name").value.trim();
    const url = normalizeUrl($("website-url").value.trim());
    const note = $("website-note").value.trim();
    if (!name || !url) {
      putText("website-status", "请填写名称和有效的 http/https 网址。");
      return;
    }
    const item = { id: editingId || crypto.randomUUID(), name, url, note };
    if (editingId) localWebsites = localWebsites.map(value => value.id === editingId ? item : value);
    else localWebsites.push(item);
    saveLocalWebsites();
    resetForm();
    renderWebsite();
  });
  $("website-cancel").addEventListener("click", resetForm);
  renderWebsite();
}

export function clearWebsite() {
  resetForm();
}
