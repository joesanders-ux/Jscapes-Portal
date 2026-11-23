// Demo data only. All names and emails are fictional (example.test).
// Refuses to run in production.
import pg from "pg";
import { connect, createInvite } from "./_invites.mjs";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data when NODE_ENV=production.");
  process.exit(1);
}
const client = connect(pg);
await client.connect();

const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const addDays = (n) => ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n)));

try {
  const existing = await client.query("SELECT count(*)::int AS n FROM users");
  if (existing.rows[0].n > 0) {
    console.log("Users already exist; skipping seed.");
  } else {
    const users = [
      ["admin@example.test", "Demo Admin", "admin"],
      ["staff1@example.test", "Sam Example", "staff"],
      ["staff2@example.test", "Alex Example", "staff"],
    ];
    const ids = {};
    for (const [email, name, role] of users) {
      const r = await client.query("INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id", [email, name, role]);
      ids[email] = r.rows[0].id;
    }
    const admin = ids["admin@example.test"];

    await client.query(
      "INSERT INTO bulletin_posts (title, body, pinned, author_id) VALUES ($1,$2,true,$3), ($4,$5,false,$3)",
      [
        "Welcome to the staff portal",
        "This is demo content. Pinned messages stay at the top of the dashboard.",
        admin,
        "Reminder: check equipment before each shift",
        "Report any defects to your team lead (demo message).",
      ]
    );

    const events = [
      ["Monthly management review", "management", addDays(1), "10:00", "https://meet.example.test/management", "Demo event."],
      ["Team social: lunch", "social", addDays(3), "12:30", null, "Venue to be confirmed (demo)."],
      ["Weekly team meeting", "meeting", addDays(2), "08:00", "https://meet.example.test/weekly", "Agenda in the bulletin (demo)."],
      ["Sam's birthday", "birthday", addDays(4), null, null, ""],
      ["Quarterly planning", "management", addDays(14), "09:30", null, ""],
    ];
    for (const [title, type, date, time, url, notes] of events) {
      await client.query(
        "INSERT INTO events (title, type, event_date, start_time, meeting_url, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [title, type, date, time, url, notes, admin]
      );
    }
    console.log("Demo data inserted. Invite links (demo users, each works once):");
    for (const [email] of users) console.log(`  ${email}: ${await createInvite(client, ids[email])}`);
  }

  // Demo vans and checks (fictional registrations). Seeded separately so an existing demo database gets them too.
  const vanCount = (await client.query("SELECT count(*)::int AS n FROM vans")).rows[0].n;
  const people = (await client.query("SELECT id, role FROM users ORDER BY created_at")).rows;
  const checker = people.find((p) => p.role === "staff") ?? people[0];
  if (vanCount === 0 && checker) {
    const vans = {};
    for (const [reg, desc] of [["AB21 DEM", "Demo Transit"], ["CD22 DEM", "Demo Berlingo"], ["EF23 DEM", "Demo Caddy"]]) {
      vans[reg] = (await client.query("INSERT INTO vans (registration, description) VALUES ($1,$2) RETURNING id", [reg, desc])).rows[0].id;
    }
    // [van, days ago, oil, tyres, lights, dashboard, clean (true = OK), notes per item, condition, notes]
    const checks = [
      ["AB21 DEM", 0, [true, true, true, true, true], {}, "compliant", ""],
      ["CD22 DEM", 40, [true, false, true, true, false], { tyres: "Rear nearside tyre looks worn (demo).", clean: "Load area needs cleaning (demo)." }, "moderate", "Book a tyre check this week (demo)."],
    ];
    for (const [reg, daysAgo, ok, notes, condition, extra] of checks) {
      const keys = ["oil", "tyres", "lights", "dashboard", "clean"];
      await client.query(
        `INSERT INTO van_checks (van_id, checked_by, checked_at, oil_ok, oil_note, tyres_ok, tyres_note, lights_ok, lights_note,
                                 dashboard_ok, dashboard_note, clean_ok, clean_note, condition, notes)
         VALUES ($1,$2, now() - make_interval(days => $3::int), $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [vans[reg], checker.id, daysAgo, ...keys.flatMap((k, i) => [ok[i], notes[k] ?? ""]), condition, extra]
      );
    }
    console.log("Demo vans and checks inserted.");
  }

  // Demo equipment and checks (fictional items). Seeded separately so an existing demo database gets them too.
  const equipmentCount = (await client.query("SELECT count(*)::int AS n FROM equipment")).rows[0].n;
  if (equipmentCount === 0 && checker) {
    const items = {};
    for (const [name, category, serial, parts] of [
      ["Demo hedge shears", "hand_tools", "DEMO-HS-01", "Spare blade set, pivot bolt"],
      ["Demo rotary mower", "lawn_mower", "DM-5000 / SN DEMO001", "Blade, air filter, spark plug"],
      ["Demo cylinder mower", "lawn_mower", "DC-300 / SN DEMO002", "Cutting cylinder, grass bag"],
      ["Demo chainsaw", "petrol", "DS-450 / SN DEMO003", "Chain, bar, spark plug, air filter"],
    ]) {
      items[name] = (await client.query("INSERT INTO equipment (name, category, model_serial, spare_parts) VALUES ($1,$2,$3,$4) RETURNING id", [name, category, serial, parts])).rows[0].id;
    }
    // [item, days ago, [[key, result, note]], notes]
    const eqChecks = [
      ["Demo rotary mower", 0, [["deck", "yes", ""], ["air_filter", "yes", ""], ["oil", "yes", ""], ["fuel", "yes", ""], ["pull_cord", "yes", ""]], ""],
      ["Demo chainsaw", 40, [["grease", "yes", ""], ["sharpening", "no", "Chain is blunt (demo)."], ["defects", "yes", ""], ["cleaning", "yes", ""], ["fuel_mix", "yes", ""], ["oil_attachments", "yes", ""]], "Sharpen before next use (demo)."],
    ];
    for (const [name, daysAgo, answers, notes] of eqChecks) {
      const chk = await client.query("INSERT INTO equipment_checks (equipment_id, checked_by, checked_at, notes) VALUES ($1,$2, now() - make_interval(days => $3::int), $4) RETURNING id", [items[name], checker.id, daysAgo, notes]);
      for (const [key, result, note] of answers) {
        await client.query("INSERT INTO equipment_check_items (check_id, item_key, result, note) VALUES ($1,$2,$3,$4)", [chk.rows[0].id, key, result, note]);
      }
    }
    console.log("Demo equipment and checks inserted.");
  }

  // Demo availability: two staff members have submitted this month and next; Alex has not entered next month.
  const availCount = (await client.query("SELECT count(*)::int AS n FROM availability_days")).rows[0].n;
  const staffList = (await client.query("SELECT id, email FROM users WHERE role = 'staff' ORDER BY email")).rows;
  if (availCount === 0 && staffList.length > 0) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const todayYmd = ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));
    const monthDays = (offset) => {
      const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1));
      const out = [];
      for (let d = start; d.getUTCMonth() === start.getUTCMonth(); d = new Date(d.getTime() + 86400000)) out.push(ymd(d));
      return out;
    };
    const fill = async (userId, days, rule) => {
      for (const day of days) {
        if (day < todayYmd) continue;
        const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
        await client.query("INSERT INTO availability_days (user_id, day, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, day, rule(dow)]);
      }
    };
    const weekdays = (dow) => (dow === 0 || dow === 6 ? "not_available" : "available");
    // First staff member: weekdays available, every Friday of this and next month not available.
    await fill(staffList[0].id, [...monthDays(0), ...monthDays(1)], (dow) => (dow === 5 ? "not_available" : weekdays(dow)));
    // Second staff member: this month only, so the "enter next month" reminder shows for them.
    if (staffList[1]) await fill(staffList[1].id, monthDays(0), weekdays);
    // One pending change request for the admin to review.
    await client.query(
      "INSERT INTO availability_change_requests (user_id, from_day, to_day, requested_status, reason) VALUES ($1, $2, $2, 'not_available', $3)",
      [staffList[0].id, ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 3))), "Dentist appointment (demo)."]
    );
    console.log("Demo availability inserted.");
  }

  // Demo shifts for the current week and next: this week is published, next week is saved but still hidden.
  const shiftCount = (await client.query("SELECT count(*)::int AS n FROM shifts")).rows[0].n;
  const shiftPeople = (await client.query("SELECT id, role FROM users WHERE active ORDER BY created_at")).rows;
  if (shiftCount === 0 && shiftPeople.length > 0) {
    const adminRow = shiftPeople.find((p) => p.role === "admin") ?? shiftPeople[0];
    const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
    for (let i = 0; i < shiftPeople.length; i++) {
      const person = shiftPeople[i];
      if (person.role === "admin") continue;
      for (let offset = 0; offset < 10; offset++) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dow + offset));
        const weekday = (d.getUTCDay() + 6) % 7;
        if (weekday > 4) continue; // Monday to Friday only
        const thisWeek = offset < 7;
        await client.query(
          "INSERT INTO shifts (user_id, day, start_time, end_time, published_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
          [person.id, ymd(d), i % 2 === 0 ? "08:00" : "09:00", i % 2 === 0 ? "16:00" : "17:00", thisWeek ? new Date() : null, adminRow.id]
        );
      }
      await client.query("INSERT INTO notifications (user_id, message, link) VALUES ($1,$2,$3)", [person.id, "New shifts published for this week (5 shifts). Times are approximate. (demo)", "/shifts"]);
    }
    console.log("Demo shifts inserted (this week published, next week hidden).");
  }

  // Demo timesheet hours: the last three weeks, Monday to Friday, for staff only (fictional figures).
  const tsCount = (await client.query("SELECT count(*)::int AS n FROM timesheet_entries")).rows[0].n;
  const tsPeople = (await client.query("SELECT id FROM users WHERE role = 'staff' AND active ORDER BY created_at")).rows;
  if (tsCount === 0 && tsPeople.length > 0) {
    const dow = (today.getUTCDay() + 6) % 7;
    for (let pi = 0; pi < tsPeople.length; pi++) {
      for (let offset = -21; offset <= 7; offset++) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dow + offset));
        if ((d.getUTCDay() + 6) % 7 > 4 || ymd(d) > ymd(today)) continue; // weekdays up to today
        const hours = [8, 7.5, 8, 7.75, 8][(offset + 21 + pi) % 5];
        await client.query("INSERT INTO timesheet_entries (user_id, day, hours) VALUES ($1,$2,$3)", [tsPeople[pi].id, ymd(d), hours]);
      }
    }
    console.log("Demo timesheet hours inserted.");
  }
} finally {
  await client.end();
}
