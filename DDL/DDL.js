import { manualAssignments } from "./data.js";
import { $, make, putText } from "../main/utils.js";

const storageKey = "ranqi.assignments.v1";
const doneStorageKey = "ranqi.doneAssignments.v1";
const overrideKey = "ranqi.fileAssignmentOverrides.v1";
const removedKey = "ranqi.fileAssignmentsRemoved.v1";
let localAssignments = [];
let doneIds = new Set();
let editingId = null;
let editingSource = null;
// 对 data.js 条目的本地修改 / 删除（不改源文件）
let fileOverrides = {};
let fileRemoved = new Set();

function parseShanghaiTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return NaN;
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return NaN;
  return Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+08:00`);
}

function fileAssignments() {
  return manualAssignments.flatMap((item, index) => {
    if (!item || typeof item.course !== "string" || typeof item.content !== "string") return [];
    const id = `file-${index}`;
    if (fileRemoved.has(id)) return [];
    const deadline = parseShanghaiTime(item.deadline);
    if (!Number.isFinite(deadline)) return [];
    const base = {
      id,
      source: "file",
      course: item.course,
      deadline,
      content: item.content,
      address: typeof item.address === "string" ? item.address : ""
    };
    // 有本地修改则覆盖
    const patch = fileOverrides[id];
    return [patch ? { ...base, ...patch, id, source: "file" } : base];
  });
}

function readLocalAssignments() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(item =>
      item && typeof item.id === "string" &&
      typeof item.course === "string" && typeof item.content === "string" &&
      typeof item.address === "string" && Number.isFinite(item.deadline)
    );
  } catch { return []; }
}

function saveLocalAssignments() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(localAssignments));
    putText("ddl-status", "已保存到当前浏览器。");
  } catch {
    putText("ddl-status", "当前浏览器无法保存，关闭页面后可能丢失。");
  }
}

function readDoneIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(doneStorageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []);
  } catch { return new Set(); }
}

function saveDoneIds() {
  try {
    localStorage.setItem(doneStorageKey, JSON.stringify([...doneIds]));
  } catch {}
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

function deadlineLabel(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(timestamp));
}

function remainingLabel(timestamp) {
  const hours = Math.ceil((timestamp - Date.now()) / 3600000);
  return hours <= 0 ? "已截止" : `剩余 ${Math.floor(hours / 24)}天${hours % 24}小时`;
}

function dateInputValue(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function resetForm() {
  $("ddl-form").reset();
  $("ddl-form").classList.add("hidden");
  editingId = null;
  editingSource = null;
  $("ddl-delete").classList.add("hidden");
  putText("ddl-submit", "添加作业");
  putText("ddl-status", "");
}

function openEdit(item) {
  editingId = item.id;
  editingSource = item.source;
  $("ddl-course").value = item.course;
  $("ddl-deadline").value = dateInputValue(item.deadline);
  $("ddl-content").value = item.content;
  $("ddl-address").value = item.address;
  $("ddl-delete").classList.remove("hidden");
  putText("ddl-submit", "保存修改");
  $("ddl-form").classList.remove("hidden");
  $("ddl-course").focus();
  $("ddl-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

export function renderDDL() {
  const list = $("ddl-list");
  list.replaceChildren();
  const all = [...fileAssignments(), ...localAssignments];
  // 未完成在前（按截止时间），已完成统一排到最后
  const pending = all.filter(item => !doneIds.has(item.id))
    .sort((a, b) => a.deadline - b.deadline || a.course.localeCompare(b.course, "zh-CN"));
  const done = all.filter(item => doneIds.has(item.id))
    .sort((a, b) => a.deadline - b.deadline || a.course.localeCompare(b.course, "zh-CN"));
  const sorted = [...pending, ...done];

  putText("ddl-count", `${pending.length} 项待完成${done.length ? ` · ${done.length} 项已完成` : ""}`);
  if (!sorted.length) {
    list.append(make("div", "ddl-empty", "还没有作业。可编辑 DDL/data.js，或点击“添加作业”。"));
    return;
  }

  for (const item of sorted) {
    const isDone = doneIds.has(item.id);
    const card = make("article", "ddl-item");
    if (isDone) card.classList.add("is-done");
    else if (item.deadline <= Date.now()) card.classList.add("overdue");

    const head = make("div", "ddl-item-head");
    const heading = make("div");
    heading.append(make("h3", "", item.course));
    // 右侧：截止时间（黄色框）在上，剩余时间在下
    const rightSide = make("div", "ddl-head-right");
    rightSide.append(
      make("span", "ddl-deadline-box", `${deadlineLabel(item.deadline)}`),
      make("span", "ddl-remaining", remainingLabel(item.deadline))
    );
    head.append(heading, rightSide);
    card.append(head, make("p", "ddl-content", item.content));

    if (item.address) {
      const address = make("div", "ddl-address", "提交地址：");
      let url = null;
      try { url = new URL(item.address); } catch {}
      if (url && ["http:", "https:"].includes(url.protocol)) {
        const link = make("a", "", item.address);
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        address.append(link);
      } else {
        address.append(document.createTextNode(item.address));
      }
      card.append(address);
    }

    const actions = make("div", "ddl-item-actions");

    // 右下角完成圆圈：点击切换完成状态
    const toggle = make("button", "ddl-done-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", isDone ? "true" : "false");
    toggle.title = isDone ? "标记为未完成" : "标记为已完成";
    toggle.addEventListener("click", event => {
      event.stopPropagation();
      if (doneIds.has(item.id)) doneIds.delete(item.id);
      else doneIds.add(item.id);
      saveDoneIds();
      renderDDL();
    });

    // 点击整张卡片打开编辑界面
    card.addEventListener("click", event => {
      if (event.target.closest("button") || event.target.closest("a")) return;
      openEdit(item);
    });
    card.title = "点击编辑";

    actions.append(toggle);
    card.append(actions);
    list.append(card);
  }
}

// 删除当前正在编辑的条目
function deleteEditing() {
  if (!editingId) return;
  const label = $("ddl-course").value.trim() || "这项作业";
  if (!confirm(`确定删除「${label}」吗？`)) return;
  const id = editingId;
  const source = editingSource;
  if (source === "file") {
    fileRemoved.add(id);
    delete fileOverrides[id];
    saveFileRemoved();
    saveFileOverrides();
  } else {
    localAssignments = localAssignments.filter(value => value.id !== id);
    saveLocalAssignments();
  }
  doneIds.delete(id);
  saveDoneIds();
  resetForm();
  renderDDL();
}

export function initDDL() {
  localAssignments = readLocalAssignments();
  doneIds = readDoneIds();
  fileOverrides = readFileOverrides();
  fileRemoved = readFileRemoved();
  $("ddl-add-button").addEventListener("click", () => {
    resetForm();
    $("ddl-form").classList.remove("hidden");
    $("ddl-course").focus();
  });
  $("ddl-form").addEventListener("submit", event => {
    event.preventDefault();
    const course = $("ddl-course").value.trim();
    const content = $("ddl-content").value.trim();
    const address = $("ddl-address").value.trim();
    const deadline = parseShanghaiTime($("ddl-deadline").value);
    if (!course || !content || !Number.isFinite(deadline)) {
      putText("ddl-status", "请填写课程、作业内容和有效的结束时间。");
      return;
    }
    if (editingId && editingSource === "file") {
      // 编辑 data.js 里的条目：存为本地覆盖，不改源文件
      fileOverrides[editingId] = { course, content, address, deadline };
      saveFileOverrides();
      putText("ddl-status", "已保存修改（仅当前浏览器）。");
    } else {
      const item = { id: editingId || crypto.randomUUID(), course, content, address, deadline };
      if (editingId) localAssignments = localAssignments.map(value => value.id === editingId ? item : value);
      else localAssignments.push(item);
      saveLocalAssignments();
    }
    resetForm();
    renderDDL();
  });
  $("ddl-cancel").addEventListener("click", resetForm);
  $("ddl-delete").addEventListener("click", deleteEditing);
  setInterval(() => {
    if (!$("ddl-root").classList.contains("hidden")) renderDDL();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("ddl-root").classList.contains("hidden")) renderDDL();
  });
  renderDDL();
}

export function clearDDL() {
  resetForm();
}
