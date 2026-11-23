import "server-only";
import { db } from "./db";

export type VanStatus = { id: string; registration: string; description: string; checked: boolean };

/**
 * Every active van and whether it has had a check this calendar month (UK time).
 * This is the monthly reminder: a van with `checked = false` is due.
 */
export async function monthlyVanStatus(): Promise<{ vans: VanStatus[]; due: VanStatus[]; monthLabel: string }> {
  const { rows } = await db().query<VanStatus>(
    `SELECT v.id, v.registration, v.description,
            EXISTS (
              SELECT 1 FROM van_checks c
               WHERE c.van_id = v.id
                 AND (c.checked_at AT TIME ZONE 'Europe/London') >= date_trunc('month', now() AT TIME ZONE 'Europe/London')
            ) AS checked
       FROM vans v
      WHERE v.active
      ORDER BY v.registration`
  );
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());
  return { vans: rows, due: rows.filter((v) => !v.checked), monthLabel };
}
