import { manualAssignments } from "./data.js";
import { $, make, putText } from "../main/utils.js";

const storageKey = "ranqi.assignments.v1";
let localAssignments = [];
let editingId = null;

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
    const deadline = parseShanghaiTime(item.deadline);
    if (!Number.isFinite(deadline)) return [];
    return [{
      id: `file-${index}`,
      source: "file",
      course: item.course,
      deadline,
      content: item.content,
      address: typeof item.address === "string" ? item.address : ""
    }];
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
  putText("ddl-submit", "添加作业");
  putText("ddl-status", "");
}

export function renderDDL() {
  const list = $("ddl-list");
  list.replaceChildren();
  const sorted = [...fileAssignments(), ...localAssignments].sort((a, b) =>
    a.deadline - b.deadline || a.course.localeCompare(b.course, "zh-CN")
  );
  putText("ddl-count", `${sorted.length} 项作业`);
  if (!sorted.length) {
    list.append(make("div", "ddl-empty", "还没有作业。可编辑 DDL/data.js，或点击“添加作业”。"));
    return;
  }

  for (const item of sorted) {
    const card = make("article", "ddl-item");
    if (item.deadline <= Date.now()) card.classList.add("overdue");
    const head = make("div", "ddl-item-head");
    const heading = make("div");
    heading.append(make("h3", "", item.course),
      make("div", "ddl-item-meta", `截止：${deadlineLabel(item.deadline)}`));
    head.append(heading, make("span", "ddl-remaining", remainingLabel(item.deadline)));
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
    if (item.source === "file") {
      actions.append(make("span", "file-note", "文件中维护：DDL/data.js"));
    } else {
      const edit = make("button", "", "编辑");
      edit.type = "button";
      edit.addEventListener("click", () => {
        editingId = item.id;
        $("ddl-course").value = item.course;
        $("ddl-deadline").value = dateInputValue(item.deadline);
        $("ddl-content").value = item.content;
        $("ddl-address").value = item.address;
        putText("ddl-submit", "保存修改");
        $("ddl-form").classList.remove("hidden");
        $("ddl-course").focus();
        $("ddl-form").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const remove = make("button", "", "删除");
      remove.type = "button";
      remove.addEventListener("click", () => {
        if (!confirm(`确定删除「${item.course}」这项作业吗？`)) return;
        localAssignments = localAssignments.filter(value => value.id !== item.id);
        if (editingId === item.id) resetForm();
        saveLocalAssignments();
        renderDDL();
      });
      actions.append(edit, remove);
    }
    card.append(actions);
    list.append(card);
  }
}

export function initDDL() {
  localAssignments = readLocalAssignments();
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
    const item = { id: editingId || crypto.randomUUID(), course, content, address, deadline };
    if (editingId) localAssignments = localAssignments.map(value => value.id === editingId ? item : value);
    else localAssignments.push(item);
    saveLocalAssignments();
    resetForm();
    renderDDL();
  });
  $("ddl-cancel").addEventListener("click", resetForm);
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
