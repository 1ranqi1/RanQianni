import { manualWebsites } from "./data.js";
import { $, make, putText } from "../main/utils.js";

const storageKey = "ranqi.websites.v1";
const orderStorageKey = "ranqi.websiteOrder.v1";
const overrideKey = "ranqi.fileWebsiteOverrides.v1";
const removedKey = "ranqi.fileWebsitesRemoved.v1";
let localWebsites = [];
let editingId = null;
let editingSource = null;
let manualOrder = [];
let dragRow = null;
let justDragged = false;
// 对 data.js 条目的本地修改 / 删除（不改源文件）
let fileOverrides = {};
let fileRemoved = new Set();

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
    const id = `file-${index}`;
    if (fileRemoved.has(id)) return [];
    const url = normalizeUrl(item.url);
    if (!url) return [];
    const base = {
      id,
      source: "file",
      name: item.name,
      url,
      note: typeof item.note === "string" ? item.note : ""
    };
    const patch = fileOverrides[id];
    return [patch ? { ...base, ...patch, id, source: "file" } : base];
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

function readOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(orderStorageKey) || "[]");
    return Array.isArray(saved) ? saved.filter(id => typeof id === "string") : [];
  } catch { return []; }
}

function saveOrder() {
  try { localStorage.setItem(orderStorageKey, JSON.stringify(manualOrder)); } catch {}
}

function readFileOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(overrideKey) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return saved;
  } catch { return {}; }
}

function saveFileOverrides() {
  try { localStorage.setItem(overrideKey, JSON.stringify(fileOverrides)); } catch {}
}

function readFileRemoved() {
  try {
    const saved = JSON.parse(localStorage.getItem(removedKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []);
  } catch { return new Set(); }
}

function saveFileRemoved() {
  try { localStorage.setItem(removedKey, JSON.stringify([...fileRemoved])); } catch {}
}

// 按保存的顺序排列；没在新顺序里的项追加到末尾
function applyOrder(items) {
  if (!manualOrder.length) return items;
  const rank = new Map(manualOrder.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

function resetForm() {
  $("website-form").reset();
  $("website-form").classList.add("hidden");
  editingId = null;
  editingSource = null;
  $("website-delete").classList.add("hidden");
  putText("website-submit", "保存网址");
  putText("website-status", "");
}

function openEdit(item) {
  editingId = item.id;
  editingSource = item.source;
  $("website-name").value = item.name;
  $("website-url").value = item.url;
  $("website-note").value = item.note;
  $("website-delete").classList.remove("hidden");
  putText("website-submit", "保存修改");
  $("website-form").classList.remove("hidden");
  $("website-name").focus();
  $("website-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function renderWebsite() {
  const list = $("website-list");
  list.replaceChildren();
  const all = applyOrder([...fileWebsites(), ...localWebsites]);
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
    row.dataset.id = item.id;
    row.draggable = true;

    // 拖拽手柄
    const handleCell = make("td", "drag-cell");
    const handle = make("span", "drag-handle", "⠿");
    handle.title = "拖动调整顺序";
    handle.setAttribute("aria-hidden", "true");
    handleCell.append(handle);
    handleCell.title = "拖动调整顺序";

    const name = make("td", "", item.name);
    const urlCell = document.createElement("td");
    const link = make("a", "", item.url);
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    urlCell.append(link);
    const note = make("td", "", item.note);
    const actions = make("td", "site-actions");

    // 点击整行（不含链接和拖拽手柄）打开编辑
    row.addEventListener("click", event => {
      if (justDragged) return;
      if (event.target.closest("a")) return;
      if (event.target.closest(".drag-cell")) return;
      openEdit(item);
    });
    row.title = "点击编辑";
    row.append(handleCell, name, urlCell, note, actions);
    list.append(row);
  }
}

// 删除当前正在编辑的网址
function deleteEditing() {
  if (!editingId) return;
  const label = $("website-name").value.trim() || "这个网址";
  if (!confirm(`确定删除「${label}」吗？`)) return;
  const id = editingId;
  const source = editingSource;
  if (source === "file") {
    fileRemoved.add(id);
    delete fileOverrides[id];
    saveFileRemoved();
    saveFileOverrides();
  } else {
    localWebsites = localWebsites.filter(value => value.id !== id);
    saveLocalWebsites();
  }
  manualOrder = manualOrder.filter(value => value !== id);
  saveOrder();
  resetForm();
  renderWebsite();
}

export function initWebsite() {
  localWebsites = readLocalWebsites();
  manualOrder = readOrder();
  fileOverrides = readFileOverrides();
  fileRemoved = readFileRemoved();
  setupDragAndDrop();
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
    if (editingId && editingSource === "file") {
      // 编辑 data.js 里的条目：存为本地覆盖，不改源文件
      fileOverrides[editingId] = { name, url, note };
      saveFileOverrides();
      putText("website-status", "已保存修改（仅当前浏览器）。");
    } else {
      const item = { id: editingId || crypto.randomUUID(), name, url, note };
      if (editingId) localWebsites = localWebsites.map(value => value.id === editingId ? item : value);
      else localWebsites.push(item);
      saveLocalWebsites();
    }
    resetForm();
    renderWebsite();
  });
  $("website-cancel").addEventListener("click", resetForm);
  $("website-delete").addEventListener("click", deleteEditing);
  renderWebsite();
}

function setupDragAndDrop() {
  const list = $("website-list");

  list.addEventListener("dragstart", event => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    dragRow = row;
    justDragged = true;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", row.dataset.id); } catch {}
  });

  list.addEventListener("dragover", event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const target = event.target.closest("tr[data-id]");
    if (!target || target === dragRow) return;
    const rect = target.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    target.parentNode.insertBefore(dragRow, after ? target.nextSibling : target);
  });

  list.addEventListener("drop", event => event.preventDefault());

  list.addEventListener("dragend", () => {
    if (!dragRow) return;
    dragRow.classList.remove("dragging");
    dragRow = null;
    // 按当前 DOM 顺序记录
    manualOrder = [...list.querySelectorAll("tr[data-id]")].map(row => row.dataset.id);
    saveOrder();
    // 稍后清除标记，避免拖动结束后误触发"点击编辑"
    setTimeout(() => { justDragged = false; }, 60);
  });
}

export function clearWebsite() {
  resetForm();
}
