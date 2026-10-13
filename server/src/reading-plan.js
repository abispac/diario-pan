// ================================================================
// reading-plan.js - read a "Diario Pan" monthly plan PDF and
// return one base reading per day.
//
// Why the month table (page 2) and not the per-day pages: the day
// pages set their headings with letter-spacing, so the text comes
// out as "L E C T U R A  B A S E" with the word breaks lost. The
// month table has no tracking - each cell arrives as one clean
// item - and it carries x/y coordinates we can use to tell the
// two columns apart. That makes this positional, not guesswork.
// ================================================================

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MONTHS = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

// Strip the "L E T R A" spacing some headings use, so we can still
// read them: collapse runs of single-spaced characters.
function deSpace(s) {
  return s.replace(/\s+/g, " ").trim();
}

export async function extractPlan(bytes) {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const problems = [];

  // ---- 1. Which month is this? -------------------------------
  // The per-day pages carry a clean "DIARIO PAN OCTUBRE" header.
  let month = null;
  for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items;
    const joined = deSpace(items.map((i) => i.str).join(" "));
    const hit = joined.match(
      /DIARIO\s*PAN\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/i
    );
    if (hit) { month = hit[1].toUpperCase(); break; }
  }
  if (!month) problems.push("No se encontró el nombre del mes en el PDF.");

  // ---- 2. Find the page holding the month table --------------
  let tableItems = null;
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items;
    const joined = deSpace(items.map((i) => i.str).join(" "));
    if (/L\s*E\s*C\s*T\s*U\s*R\s*A\s*D\s*E\s*L\s*M\s*E\s*S/i.test(joined) ||
        /LECTURA DEL MES/i.test(joined)) {
      tableItems = items;
      break;
    }
  }
  if (!tableItems) {
    return { month, days: [], problems: [...problems, "No se encontró la tabla del mes."] };
  }

  // ---- 3. Read the table by position -------------------------
  // Keep only cells that look like a scripture reference, and
  // bucket them into the two columns by their x coordinate.
  const all = tableItems
    .map((i) => ({
      str: i.str.trim(),
      x: i.transform[4],
      y: Math.round(i.transform[5] * 2) / 2, // snap to half-points
    }))
    .filter((c) => c.str.length > 0);

  // Count letters, ignoring spaces and punctuation. Book names like
  // JUDAS or FILEMÓN carry no digits at all, so a cell must NOT be
  // required to have one - that would silently drop those days.
  // Column headers ("NT", "AT", "DÍA") are short, so a 4-letter
  // floor separates them from real book names.
  const letters = (s) => (s.match(/[A-ZÁÉÍÓÚÑ]/gi) || []).length;

  // Find the two reading columns using only the cells we are sure
  // about - the ones that look like "BOOK 1: 2 - 3". Those are the
  // most numerous, so the two commonest x positions are the columns.
  const anchors = all.filter((c) => letters(c.str) >= 3 && /\d/.test(c.str));
  const xCounts = new Map();
  for (const c of anchors) {
    const key = Math.round(c.x / 10) * 10;
    xCounts.set(key, (xCounts.get(key) || 0) + 1);
  }
  const [colA, colB] = [...xCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([x]) => x)
    .sort((a, b) => a - b);

  const near = (x, col) => Math.abs(x - col) <= 12;

  // Group into rows by y, then order rows top -> bottom = day 1..n
  const rows = new Map();
  for (const c of all) {
    if (letters(c.str) < 4) continue;           // "NT", "AT", "DÍA"
    if (!near(c.x, colA) && !near(c.x, colB)) continue;
    if (!rows.has(c.y)) rows.set(c.y, {});
    const row = rows.get(c.y);
    if (near(c.x, colA)) row.nt = c.str;
    else row.at = c.str;
  }

  const ordered = [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF y grows upward
    .map(([, r]) => r)
    .filter((r) => r.nt || r.at);

  const days = ordered.map((r, idx) => ({
    day: idx + 1,
    base: [r.nt, r.at].filter(Boolean).join(", "),
  }));

  // ---- 4. Sanity checks --------------------------------------
  // Days in this month. February is checked loosely (28 or 29) so a
  // leap year never trips the validation.
  const year = new Date().getFullYear();
  const expected = month ? new Date(year, MONTHS[month], 0).getDate() : null;
  const feb = month === "FEBRERO";
  const ok = feb ? days.length === 28 || days.length === 29 : days.length === expected;
  if (expected && !ok) {
    problems.push(
      `Se esperaban ${expected} días para ${month} y se encontraron ${days.length}. ` +
      `Revisa que el PDF sea el del mes completo.`
    );
  }
  for (const d of days) {
    if (!d.base || d.base.length < 5) {
      problems.push(`El día ${d.day} quedó vacío o incompleto.`);
    }
  }

  return { month, days, problems };
}
