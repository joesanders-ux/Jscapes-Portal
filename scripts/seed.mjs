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
} finally {
  await client.end();
}
