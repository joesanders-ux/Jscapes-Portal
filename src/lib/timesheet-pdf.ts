import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtDmy, fmtWeekday } from "./dates";
import { fmtHours, listDays } from "./timesheets-shared";
import { totals, type Timesheet } from "./timesheets";

// A4 landscape, in points.
const W = 842;
const H = 595;
const M = 40; // margin
const ROW = 17;
const MAX_PEOPLE_PER_TABLE = 8;

const INK = rgb(0.16, 0.18, 0.19); // #282D30
const MUTED = rgb(0.4, 0.43, 0.45);
const LINE = rgb(0.8, 0.82, 0.83);
const HEAD = rgb(0.9, 0.96, 0.94); // brand-soft
const WEEKEND = rgb(0.96, 0.96, 0.96);

/** The built-in PDF fonts only cover Latin-1, so anything else (for example a name with a symbol) is replaced rather than crashing. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

function fit(font: PDFFont, text: string, size: number, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

export type PdfInput = { sheet: Timesheet; from: string; to: string; title: string; generatedBy: string; generatedAt: string };

/** "Mon 23/11/2026" */
const fmtDay = (d: string) => `${fmtWeekday(d)} ${fmtDmy(d)}`;
const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

/** The company logo from public/logo.png. If it cannot be read the PDF is still produced, just without it. */
async function loadLogo(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "logo.png"));
  } catch {
    return null;
  }
}

/** Builds the payroll PDF: totals by person, a full day-by-day breakdown for each person, then the daily grid. Returns the file bytes. */
export async function buildTimesheetPdf(input: PdfInput): Promise<Uint8Array> {
  const { sheet, from, to } = input;
  const days = listDays(from, to);
  const sum = totals(sheet, days);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Jscapes timesheets ${from} to ${to}`);
  pdf.setProducer("Jscapes Staff Portal");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await loadLogo();
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null; // embedded once, drawn on every page
  const LOGO_H = 36;

  let page!: PDFPage;
  let y = 0;
  const text = (t: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: number } = {}) => {
    const f = o.bold ? bold : font;
    const size = o.size ?? 9;
    const s = safe(t);
    const px = o.right !== undefined ? o.right - f.widthOfTextAtSize(s, size) : x;
    page.drawText(s, { x: px, y: yy, size, font: f, color: o.color ?? INK });
  };

  const newPage = (heading: string) => {
    page = pdf.addPage([W, H]);
    text("Jscapes Timesheets", M, H - M, { size: 16, bold: true });
    text(input.title, M, H - M - 18, { size: 11 });
    text(`Generated ${input.generatedAt} by ${input.generatedBy}`, M, H - M - 32, { size: 8, color: MUTED });
    if (logo) {
      const w = (logo.width / logo.height) * LOGO_H;
      page.drawImage(logo, { x: W - M - w, y: H - M - LOGO_H + 14, width: w, height: LOGO_H });
    }
    text("Confidential: for payroll use. Administrators only.", M, M - 20, { size: 8, color: MUTED });
    text(heading, M, H - M - 56, { size: 12, bold: true });
    y = H - M - 72;
  };

  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.5, color: LINE });

  const personName = (p: (typeof sheet.people)[number]) =>
    p.name + (p.account ? "" : " (no account)") + (p.active ? "" : p.account ? " (inactive)" : " (removed)");

  // ---- Page 1: totals by person
  newPage("Totals by person");
  const cols = [{ x: M, w: 300, label: "Person" }, { x: M + 300, w: 120, label: "Days worked" }, { x: M + 420, w: 120, label: "Total hours" }];
  const header = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: ROW, color: HEAD });
    text(cols[0].label, cols[0].x + 4, y, { bold: true });
    text(cols[1].label, 0, y, { bold: true, right: cols[1].x + cols[1].w - 4 });
    text(cols[2].label, 0, y, { bold: true, right: cols[2].x + cols[2].w - 4 });
    y -= ROW;
  };
  header();
  for (const p of sheet.people) {
    if (y < M + ROW * 2) { newPage("Totals by person (continued)"); header(); }
    const t = sum.perPerson.get(p.id)!;
    text(fit(font, personName(p), 9, cols[0].w - 8), cols[0].x + 4, y);
    text(String(t.daysWorked), 0, y, { right: cols[1].x + cols[1].w - 4 });
    text(fmtHours(t.hours), 0, y, { right: cols[2].x + cols[2].w - 4 });
    rule(y - 4);
    y -= ROW;
  }
  if (y < M + ROW * 2) { newPage("Totals by person (continued)"); header(); }
  text("Total", cols[0].x + 4, y, { bold: true });
  text(fmtHours(sum.grand), 0, y, { bold: true, right: cols[2].x + cols[2].w - 4 });
  y -= ROW * 2;
  if (sheet.people.length === 0) text("There are no people to list for this period.", M, y, { color: MUTED });

  // ---- Full breakdown for each person: every day with hours recorded, and the hours worked on it
  const bcols = [{ x: M, w: 300 }, { x: M + 300, w: 120 }];
  if (sheet.people.length > 0) {
    newPage("Breakdown by person");
    for (const p of sheet.people) {
      const entries = days.flatMap((d) => { const v = sheet.hours.get(`${p.id}|${d}`); return v === undefined ? [] : [{ d, v }]; });
      const t = sum.perPerson.get(p.id)!;
      // Keep a person's name with at least their first rows: start a new page rather than leave it alone at the bottom.
      if (y < M + ROW * 7) { newPage("Breakdown by person (continued)"); }
      y -= 6;
      text(fit(bold, personName(p), 11, W - 2 * M), M, y, { size: 11, bold: true });
      y -= 13;
      text(`${t.daysWorked} ${t.daysWorked === 1 ? "day" : "days"} worked, ${fmtHours(t.hours)} hours in total`, M, y, { size: 9, color: MUTED });
      y -= ROW;
      const bhead = () => {
        page.drawRectangle({ x: M, y: y - 4, width: bcols[0].w + bcols[1].w, height: ROW, color: HEAD });
        text("Date", bcols[0].x + 4, y, { bold: true });
        text("Hours worked", 0, y, { bold: true, right: bcols[1].x + bcols[1].w - 4 });
        y -= ROW;
      };
      bhead();
      if (entries.length === 0) {
        text("No hours recorded in this period.", bcols[0].x + 4, y, { color: MUTED });
        y -= ROW;
      }
      for (const e of entries) {
        if (y < M + ROW * 2) { newPage("Breakdown by person (continued)"); text(`${personName(p)} (continued)`, M, y, { size: 11, bold: true }); y -= ROW + 2; bhead(); }
        if (isWeekend(e.d)) page.drawRectangle({ x: M, y: y - 4, width: bcols[0].w + bcols[1].w, height: ROW, color: WEEKEND });
        text(fmtDay(e.d), bcols[0].x + 4, y);
        text(fmtHours(e.v), 0, y, { right: bcols[1].x + bcols[1].w - 4 });
        page.drawLine({ start: { x: M, y: y - 4 }, end: { x: M + bcols[0].w + bcols[1].w, y: y - 4 }, thickness: 0.5, color: LINE });
        y -= ROW;
      }
      if (y < M + ROW * 2) { newPage("Breakdown by person (continued)"); text(`${personName(p)} (continued)`, M, y, { size: 11, bold: true }); y -= ROW + 2; }
      text("Total", bcols[0].x + 4, y, { bold: true });
      text(fmtHours(t.hours), 0, y, { bold: true, right: bcols[1].x + bcols[1].w - 4 });
      y -= ROW * 1.5;
    }
  }

  // ---- Daily hours: dates down the side, people across (in groups, so columns stay readable)
  const groups: (typeof sheet.people)[] = [];
  for (let i = 0; i < sheet.people.length; i += MAX_PEOPLE_PER_TABLE) groups.push(sheet.people.slice(i, i + MAX_PEOPLE_PER_TABLE));
  groups.forEach((group, gi) => {
    const heading = groups.length > 1 ? `Daily hours (people ${gi * MAX_PEOPLE_PER_TABLE + 1} to ${gi * MAX_PEOPLE_PER_TABLE + group.length})` : "Daily hours";
    const dateW = 90;
    const showTotal = groups.length === 1;
    const colW = (W - 2 * M - dateW - (showTotal ? 70 : 0)) / group.length;
    const head = () => {
      page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: ROW, color: HEAD });
      text("Date", M + 4, y, { bold: true });
      group.forEach((p, i) => text(fit(bold, p.name, 8, colW - 6), 0, y, { bold: true, size: 8, right: M + dateW + colW * (i + 1) - 4 }));
      if (showTotal) text("Total", 0, y, { bold: true, right: W - M - 4 });
      y -= ROW;
    };
    newPage(heading);
    head();
    for (const d of days) {
      if (y < M + ROW * 2) { newPage(`${heading} (continued)`); head(); }
      if (isWeekend(d)) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: ROW, color: WEEKEND });
      text(fmtDay(d), M + 4, y);
      let dayTotal = 0;
      group.forEach((p, i) => {
        const v = sheet.hours.get(`${p.id}|${d}`);
        if (v === undefined) return;
        dayTotal += v;
        text(fmtHours(v), 0, y, { right: M + dateW + colW * (i + 1) - 4 });
      });
      if (showTotal && dayTotal > 0) text(fmtHours(dayTotal), 0, y, { right: W - M - 4 });
      rule(y - 4);
      y -= ROW;
    }
    if (y < M + ROW * 2) { newPage(`${heading} (continued)`); head(); }
    text("Total", M + 4, y, { bold: true });
    group.forEach((p, i) => text(fmtHours(sum.perPerson.get(p.id)!.hours), 0, y, { bold: true, right: M + dateW + colW * (i + 1) - 4 }));
    if (showTotal) text(fmtHours(sum.grand), 0, y, { bold: true, right: W - M - 4 });
  });

  // Page numbers, now that the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 8), y: M - 20, size: 8, font, color: MUTED });
  });

  return pdf.save();
}
