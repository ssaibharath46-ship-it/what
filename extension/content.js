/**
 * KLU AttendIQ — ERP reader + AttendIQ auth bridge.
 *
 * ERP mode: reads only attendance data already rendered in the logged-in ERP tab.
 * Dashboard mode: receives the user's AttendIQ Supabase access token from the
 * dashboard page via window.postMessage and stores it locally for sync.
 */

const ATTENDANCE_HINTS = [
  "attendance", "conducted", "attended", "absent", "percentage", "tcbr", "course code"
];
const FIELD_ALIASES = {
  courseCode: ["course code", "coursecode", "code", "subject code", "course"],
  courseName: ["course name", "coursename", "description", "subject", "subject name", "course description"],
  ltps: ["ltps", "l/t/p/s", "ltps pattern"],
  section: ["section", "sec"],
  component: ["component", "type", "attendance type", "class type"],
  conducted: ["conducted", "total conducted", "classes conducted", "total classes"],
  attended: ["attended", "total attended", "classes attended"],
  absent: ["absent", "total absent", "classes absent", "absences"],
  tcbr: ["tcbr", "total classes before registration"],
  percentage: ["percentage", "attendance %", "attendance", "%", "percent"]
};

function normalize(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}:._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseNumber(text) {
  const cleaned = String(text ?? "").replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  const n = match ? Number(match[0]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalNumber(text) {
  const cleaned = String(text ?? "").replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function matchesAlias(header, alias) {
  const h = normalize(header);
  const a = normalize(alias);
  return h === a || h.includes(a) || a.includes(h);
}

function findFieldIndex(headers, field) {
  const aliases = FIELD_ALIASES[field] || [];
  for (let i = 0; i < headers.length; i++) {
    if (aliases.some((a) => matchesAlias(headers[i], a))) return i;
  }
  return -1;
}

function findHeaderRow(table) {
  const rows = [...table.querySelectorAll("tr")];
  let best = null;
  let bestScore = -1;
  for (const row of rows.slice(0, 8)) {
    const cells = [...row.querySelectorAll("th,td")];
    if (!cells.length) continue;
    const headers = cells.map((c) => c.textContent?.trim() || "");
    const score = headers.reduce((n, h) =>
      n + (ATTENDANCE_HINTS.some((x) => normalize(h).includes(x)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = { row, headers, cells };
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

function scoreAttendanceTable(table) {
  const text = normalize(table.textContent || "");
  const header = findHeaderRow(table);
  let score = 0;
  for (const hint of ATTENDANCE_HINTS) if (text.includes(hint)) score += 1;
  if (header) score += 8;
  if (header?.headers.some((h) => findFieldIndex(header.headers, "conducted") >= 0)) score += 3;
  if (header?.headers.some((h) => findFieldIndex(header.headers, "attended") >= 0)) score += 3;
  return score;
}

function getSelectedOrVisible(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const value = el.tagName === "SELECT"
      ? (el.selectedOptions?.[0]?.textContent || el.value)
      : el.textContent;
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function extractAcademicYearAndSemester() {
  const academicYear = getSelectedOrVisible([
    "#academicYear", "select[name*='academic' i]", "select[id*='academic' i]",
    "[data-academic-year]", ".academic-year", "[id*='year' i]"
  ]);
  const semester = getSelectedOrVisible([
    "#semester", "select[name*='semester' i]", "select[id*='semester' i]",
    "[data-semester]", ".semester", "[id*='sem' i]"
  ]);
  return {
    academicYear: academicYear || "Current Academic Year",
    semester: semester || "Current Semester",
  };
}

function normalizeComponent(value, ltps) {
  const text = normalize(value);
  if (text.includes("lecture") || text === "l") return "Lecture";
  if (text.includes("practical") || text.includes("lab") || text === "p") return "Practical";
  if (text.includes("tutorial") || text === "t") return "Tutorial";
  if (text.includes("skill") || text === "s") return "Skill";

  const code = String(ltps || "").trim().toUpperCase();
  if (/^L(?![A-Z])/.test(code)) return "Lecture";
  if (/^P(?![A-Z])/.test(code)) return "Practical";
  if (/^T(?![A-Z])/.test(code)) return "Tutorial";
  if (/^S(?![A-Z])/.test(code)) return "Skill";
  return "Other";
}

function groupIntoComponents(rawRows) {
  const byCourse = new Map();
  for (const r of rawRows) {
    const key = r.courseCode || r.courseName;
    if (!key) continue;
    if (!byCourse.has(key)) {
      byCourse.set(key, {
        courseCode: r.courseCode || key,
        courseName: r.courseName || r.courseCode || key,
        ltps: r.ltps || "",
        section: r.section || "",
        conducted: 0,
        attended: 0,
        absent: 0,
        tcbr: 0,
        components: [],
      });
    }
    const subject = byCourse.get(key);
    subject.conducted += r.conducted;
    subject.attended += r.attended;
    subject.absent += r.absent;
    subject.tcbr += r.tcbr || 0;
    subject.components.push({
      component: normalizeComponent(r.component, r.ltps),
      conducted: r.conducted,
      attended: r.attended,
    });
  }

  return [...byCourse.values()].map((s) => {
    // Remove duplicate/zero component rows while preserving real breakdowns.
    s.components = s.components.filter((c) => c.conducted > 0 || c.attended > 0);
    return s;
  });
}

function parseTable(table) {
  const headerInfo = findHeaderRow(table);
  if (!headerInfo) return [];

  const headers = headerInfo.headers;
  const index = {};
  for (const field of Object.keys(FIELD_ALIASES)) index[field] = findFieldIndex(headers, field);

  if (index.conducted < 0 || index.attended < 0) return [];
  if (index.courseCode < 0 && index.courseName < 0) return [];

  const rows = [...table.querySelectorAll("tr")];
  const rawRows = [];
  for (const row of rows) {
    if (row === headerInfo.row) continue;
    const cells = [...row.querySelectorAll("td")];
    if (!cells.length) continue;
    const get = (field) => index[field] >= 0 ? (cells[index[field]]?.textContent?.trim() || "") : "";

    const courseCode = get("courseCode");
    const courseName = get("courseName");
    const ltps = get("ltps");
    const section = get("section");
    const component = get("component");
    const conducted = parseOptionalNumber(get("conducted"));
    const attended = parseOptionalNumber(get("attended"));
    const absentRaw = index.absent >= 0 ? parseOptionalNumber(get("absent")) : null;
    const tcbr = index.tcbr >= 0 ? (parseOptionalNumber(get("tcbr")) ?? 0) : 0;

    if (!courseCode && !courseName) continue;
    if (conducted === null || attended === null) continue;
    if (conducted < 0 || attended < 0 || attended > conducted) continue;

    // ERP "Absent" can be a different/derived metric. For sync integrity,
    // always derive absent from the authoritative Conducted and Attended counts.
    const absent = Math.max(0, conducted - attended);
    rawRows.push({ courseCode, courseName, ltps, section, component, conducted, attended, absent, tcbr });
  }
  return groupIntoComponents(rawRows);
}

function extractAttendanceTable() {
  const tables = [...document.querySelectorAll("table")]
    .sort((a, b) => scoreAttendanceTable(b) - scoreAttendanceTable(a));

  for (const table of tables) {
    const subjects = parseTable(table);
    if (subjects.length) return { found: true, subjects };
  }
  return { found: false, subjects: [] };
}

function buildPayload() {
  const { academicYear, semester } = extractAcademicYearAndSemester();
  const { found, subjects } = extractAttendanceTable();
  return { found, payload: { academicYear, semester, subjects } };
}

// Dashboard auth bridge. The dashboard sends the current AttendIQ session
// token; the extension never asks for the ERP username/password.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "klu-attendiq-dashboard") return;
  if (typeof event.data.access_token !== "string" || !event.data.access_token) return;
  chrome.storage.local.set({ attendiq_access_token: event.data.access_token, attendiq_token_saved_at: Date.now() });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DETECT_ATTENDANCE") {
    sendResponse(buildPayload());
  }
  return true;
});
