import { $, make, putText } from "../main/utils.js";

const termStart = Date.UTC(2026, 8, 14);
const timeStorageKey = "ranqi.lessonStartTimes.v1";
const lessonMinutes = 45;
const shortBreakMinutes = 5;

// 默认上课时间（第一次打开或清空设置时使用）
const defaultStartTimes = {
  1: "08:00",
  3: "09:55",
  6: "13:20",
  8: "15:15",
  11: "18:30",
};

let schedule = null;
let selectedWeek = 0;
let startTimes = {};

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function currentAcademicWeek() {
  return Math.max(1, Math.min(16, Math.floor((todayInShanghai() - termStart) / 604800000) + 1));
}

function weekDates(week) {
  const start = new Date(termStart + (week - 1) * 604800000);
  const end = new Date(termStart + week * 604800000 - 86400000);
  const label = date => `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
  return `${label(start)}—${label(end)}`;
}

function readStartTimes() {
  try {
    const raw = localStorage.getItem(timeStorageKey);
    // 从未保存过 → 使用默认时间
    if (raw === null) return { ...defaultStartTimes };
    const saved = JSON.parse(raw || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaultStartTimes };
    return Object.fromEntries(Object.entries(saved).filter(([lesson, time]) =>
      [1, 3, 6, 8, 11].includes(Number(lesson)) &&
      typeof time === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
    ));
  } catch { return { ...defaultStartTimes }; }
}

function saveStartTimes() {
  try {
    localStorage.setItem(timeStorageKey, JSON.stringify(startTimes));
    putText("settings-status", "已自动保存到当前浏览器。");
  } catch {
    putText("settings-status", "当前浏览器无法保存设置；本次打开期间仍可使用。");
  }
}

function slotTimeRange(groupFirst, first, last) {
  const start = startTimes[groupFirst];
  if (!start) return "";
  const [hours, minutes] = start.split(":").map(Number);
  const base = hours * 60 + minutes;
  const format = value =>
    `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const lessonStart = base + (first - groupFirst) * (lessonMinutes + shortBreakMinutes);
  const lessonEnd = base + (last - groupFirst) * (lessonMinutes + shortBreakMinutes) + lessonMinutes;
  return `${format(lessonStart)}—${format(lessonEnd)}`;
}

function buildSettings() {
  const grid = $("settings-grid");
  grid.replaceChildren();

  for (const slot of schedule.slots) {
    const first = Number(slot.id.split("-")[0]);
    const last = Number(slot.id.split("-")[1]);
    const setting = make("div", "time-setting");
    setting.append(make("span", "", slot.label));

    const entry = make("div", "manual-time");
    const hour = document.createElement("input");
    const minute = document.createElement("input");
    for (const input of [hour, minute]) {
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 2;
      input.autocomplete = "off";
    }
    hour.placeholder = "时";
    minute.placeholder = "分";
    hour.setAttribute("aria-label", `${slot.label}起始时间的小时`);
    minute.setAttribute("aria-label", `${slot.label}起始时间的分钟`);
    if (startTimes[first]) [hour.value, minute.value] = startTimes[first].split(":");
    entry.append(hour, make("b", "", ":"), minute);

    const preview = make("small", "time-preview",
      slotTimeRange(first, first, last) || "尚未设置起始时间");

    const save = () => {
      const h = hour.value.trim();
      const m = minute.value.trim();
      if (!h && !m) delete startTimes[first];
      else if (/^\d{1,2}$/.test(h) && /^\d{1,2}$/.test(m) && Number(h) < 24 && Number(m) < 60) {
        startTimes[first] = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
        hour.value = h.padStart(2, "0");
        minute.value = m.padStart(2, "0");
      } else {
        putText("settings-status", "请填写有效的小时（0–23）和分钟（0–59）。");
        return;
      }
      saveStartTimes();
      preview.textContent = slotTimeRange(first, first, last) || "尚未设置起始时间";
      drawCourses(selectedWeek);
    };
    hour.addEventListener("change", save);
    minute.addEventListener("change", save);
    setting.append(entry, preview);
    grid.append(setting);
  }
}

function icon(kind) {
  const path = kind === "pin"
    ? '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'
    : kind === "clock"
      ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
      : '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function addMeta(parent, kind, label) {
  const row = make("div", "course-meta");
  row.innerHTML = icon(kind);
  row.append(document.createTextNode(label));
  parent.append(row);
}

function drawHeader(week) {
  const head = $("table-head");
  head.replaceChildren();
  const row = document.createElement("tr");
  row.append(make("th", "", "节次 / 星期"));

  schedule.days.forEach((dayName, index) => {
    const heading = document.createElement("th");
    heading.append(make("span", "", dayName));
    if (week > 0) {
      const date = new Date(termStart + ((week - 1) * 7 + index) * 86400000);
      heading.append(make("span", "day-date",
        `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`));
      if (date.getTime() === todayInShanghai()) heading.classList.add("is-today");
    }
    row.append(heading);
  });
  head.append(row);
}

function drawCourses(week) {
  drawHeader(week);
  const body = $("table-body");
  body.replaceChildren();
  let count = 0;

  for (const slot of schedule.slots) {
    const [groupFirst, groupLast] = slot.id.split("-").map(Number);
    const row = document.createElement("tr");
    const heading = make("th", "", slot.label);
    heading.append(make("span", "slot-time",
      slotTimeRange(groupFirst, groupFirst, groupLast) || "--:--—--:--"));
    row.append(heading);

    for (let day = 1; day <= 7; day++) {
      const cell = document.createElement("td");
      const items = schedule.courses.filter(course =>
        course.day === day && course.slot === slot.id &&
        (week === 0 || course.weekNumbers.includes(week))
      );
      if (!items.length) cell.className = "empty";
      const container = make("div", week === 0 ? "period-list" : "period-grid");

      if (week !== 0) {
        container.style.setProperty("--rows", String(groupLast - groupFirst + 1));
        for (let period = groupFirst; period <= groupLast; period++) {
          const guide = make("div", "period-guide");
          guide.style.gridRow = String(period - groupFirst + 1);
          container.append(guide);
        }
      }

      for (const course of items) {
        count++;
        const match = course.periods.match(/(\d+)(?:[–-](\d+))?/);
        const first = Number(match?.[1] || groupFirst);
        const last = Number(match?.[2] || match?.[1] || groupLast);
        const time = slotTimeRange(groupFirst, first, last);
        const card = make("article", "course");
        card.dataset.tone = course.tone;
        card.dataset.duration = String(last - first + 1);
        card.title = `${course.name} · ${course.weeks} · ${course.periods}${time ? ` · ${time}` : ""} · ${course.room}`;
        if (week !== 0) card.style.gridRow = `${first - groupFirst + 1} / span ${last - first + 1}`;
        card.append(make("p", "course-name", course.name));
        if (week === 0) addMeta(card, "calendar", course.weeks);
        if (week === 0 && time) addMeta(card, "clock", time);
        addMeta(card, "pin", course.room);
        card.append(make("div", "course-code", `课程代码 ${course.code}`));

        if (week === 0) {
          const rail = make("div", "period-rail");
          rail.setAttribute("aria-label", `${course.periods}，共 ${last - first + 1} 节`);
          for (let period = groupFirst; period <= groupLast; period++) {
            rail.append(make("span", period >= first && period <= last ? "active" : ""));
          }
          card.append(rail);
        }
        container.append(card);
      }

      cell.append(container);
      row.append(cell);
    }
    body.append(row);
  }
}

function setWeek(week) {
  selectedWeek = week;
  $("week").value = String(week);
  putText("schedule-heading", week === 0 ? "总课表" : `第 ${week} 周课表`);
  putText("week-dates", week === 0
    ? "显示本学期全部周次的课程 · 手机可左右滑动"
    : `${weekDates(week)} · 手机可左右滑动查看`);
  $("prev-week").disabled = week <= 1;
  $("next-week").disabled = week === 0 || week >= 16;
  putText("view-toggle", week === 0 ? "返回本周" : "查看总课表");
  drawCourses(week);
}

export function initClass() {
  $("week").addEventListener("change", event => setWeek(Number(event.target.value)));
  $("prev-week").addEventListener("click", () => { if (selectedWeek > 1) setWeek(selectedWeek - 1); });
  $("next-week").addEventListener("click", () => { if (selectedWeek > 0 && selectedWeek < 16) setWeek(selectedWeek + 1); });
  $("view-toggle").addEventListener("click", () => setWeek(selectedWeek === 0 ? currentAcademicWeek() : 0));
  $("time-settings-button").addEventListener("click", () => $("time-dialog").showModal());
  $("time-close").addEventListener("click", () => $("time-dialog").close());
  $("time-dialog").addEventListener("click", event => {
    if (event.target === $("time-dialog")) $("time-dialog").close();
  });
}

export function renderClass(data) {
  schedule = data;
  startTimes = readStartTimes();
  buildSettings();
  const picker = $("week");
  picker.replaceChildren(new Option("总课表", "0"));
  for (let week = 1; week <= 16; week++) {
    picker.append(new Option(`第 ${week} 周`, String(week)));
  }
  const pending = $("unscheduled");
  pending.replaceChildren();
  for (const note of data.unscheduled) pending.append(make("li", "", note));
  setWeek(currentAcademicWeek());
}

export function clearClass() {
  schedule = null;
  selectedWeek = 0;
  if ($("time-dialog").open) $("time-dialog").close();
  $("table-body").replaceChildren();
  $("table-head").replaceChildren();
}
