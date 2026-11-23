import "server-only";
import { db } from "./db";

export type TimesheetPerson = { id: string; name: string; active: boolean };
export type Timesheet = {
  people: TimesheetPerson[];
  /** `${userId}|${day}` -> hours */
  hours: Map<string, number>;
};

/**
 * Everyone who should appear on a timesheet for the period: all active people, plus anyone now deactivated
 * who has hours in it (so an old period still adds up for payroll).
 */
export async function listTimesheetPeople(from: string, to: string): Promise<TimesheetPerson[]> {
  const { rows } = await db().query<TimesheetPerson>(
    `SELECT id, name, active FROM users
      WHERE active OR id IN (SELECT user_id FROM timesheet_entries WHERE day BETWEEN $1::date AND $2::date)
      ORDER BY lower(name)`,
    [from, to]
  );
  return rows;
}

export async function loadTimesheet(from: string, to: string): Promise<Timesheet> {
  const [people, entries] = await Promise.all([
    listTimesheetPeople(from, to),
    db().query<{ user_id: string; day: string; hours: string | number }>(
      "SELECT user_id, day, hours FROM timesheet_entries WHERE day BETWEEN $1::date AND $2::date",
      [from, to]
    ),
  ]);
  const hours = new Map<string, number>();
  for (const e of entries.rows) hours.set(`${e.user_id}|${e.day}`, Number(e.hours)); // numeric arrives as text
  return { people, hours };
}

/** Totals used by both the page and the PDF. */
export function totals(sheet: Timesheet, days: string[]) {
  const perPerson = new Map<string, { hours: number; daysWorked: number }>();
  const perDay = new Map<string, number>();
  let grand = 0;
  for (const p of sheet.people) {
    let h = 0;
    let worked = 0;
    for (const d of days) {
      const v = sheet.hours.get(`${p.id}|${d}`);
      if (v === undefined) continue;
      h += v;
      if (v > 0) worked++;
      perDay.set(d, (perDay.get(d) ?? 0) + v);
    }
    perPerson.set(p.id, { hours: h, daysWorked: worked });
    grand += h;
  }
  return { perPerson, perDay, grand };
}
