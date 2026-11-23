import "server-only";
import { db } from "./db";
import type { CategoryKey } from "./equipment-shared";

export type EquipmentStatus = { id: string; name: string; category: CategoryKey; model_serial: string; checked: boolean };

/**
 * Every active item of equipment and whether it has had a check this calendar month (UK time).
 * This is the monthly reminder: an item with `checked = false` is due.
 */
export async function monthlyEquipmentStatus(): Promise<{ items: EquipmentStatus[]; due: EquipmentStatus[]; monthLabel: string }> {
  const { rows } = await db().query<EquipmentStatus>(
    `SELECT e.id, e.name, e.category, e.model_serial,
            EXISTS (
              SELECT 1 FROM equipment_checks c
               WHERE c.equipment_id = e.id
                 AND (c.checked_at AT TIME ZONE 'Europe/London') >= date_trunc('month', now() AT TIME ZONE 'Europe/London')
            ) AS checked
       FROM equipment e
      WHERE e.active
      ORDER BY e.category, lower(e.name)`
  );
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());
  return { items: rows, due: rows.filter((e) => !e.checked), monthLabel };
}
