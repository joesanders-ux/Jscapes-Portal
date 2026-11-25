import { getSessionUser } from "@/lib/auth";
import { fmtDmy, isYmd } from "@/lib/dates";
import { buildTimesheetPdf } from "@/lib/timesheet-pdf";
import { loadTimesheet } from "@/lib/timesheets";
import { MAX_SPAN_DAYS, listDays } from "@/lib/timesheets-shared";

export const dynamic = "force-dynamic";

// Payroll PDF for a chosen period. Administrators only: anyone else, signed in or not, gets a plain 404
// so the page does not even reveal that it exists.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isYmd(from) || !isYmd(to) || to < from) return new Response("Choose a valid period.", { status: 400 });
  if (listDays(from, to).length > MAX_SPAN_DAYS) return new Response(`Choose a period of up to ${MAX_SPAN_DAYS} days.`, { status: 400 });

  const sheet = await loadTimesheet(from, to);
  // 25/11/2026 21:45, London time
  const generatedAt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" })
    .format(new Date()).replace(", ", " ");
  const bytes = await buildTimesheetPdf({
    sheet, from, to, generatedBy: user.name, generatedAt,
    title: from === to ? fmtDmy(from) : `${fmtDmy(from)} to ${fmtDmy(to)}`,
  });
  // A copy typed as a plain ArrayBuffer-backed Uint8Array, which is what Response accepts as a body.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="timesheets-${from}-to-${to}.pdf"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
