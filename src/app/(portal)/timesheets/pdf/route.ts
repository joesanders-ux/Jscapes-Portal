import { getSessionUser } from "@/lib/auth";
import { fmtShort, isYmd } from "@/lib/dates";
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
  const generatedAt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date());
  const bytes = await buildTimesheetPdf({
    sheet, from, to, generatedBy: user.name, generatedAt,
    title: from === to ? fmtShort(from) : `${from} to ${to}`,
  });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="timesheets-${from}-to-${to}.pdf"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
