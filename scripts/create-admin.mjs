// Creates the FIRST administrator (there is no public sign-up) and prints a one-time invite link.
// Usage: npm run create-admin -- you@example.com "Your Name"
// Run it with DATABASE_URL pointing at the target database. Never commit that URL.
import pg from "pg";
import { connect, createInvite, INVITE_DAYS } from "./_invites.mjs";

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = (emailArg || "").trim().toLowerCase();
const name = nameParts.join(" ").trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
  console.error('Usage: npm run create-admin -- you@example.com "Your Name"');
  process.exit(1);
}

const client = connect(pg);
await client.connect();
try {
  const existing = await client.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  let id = existing.rows[0]?.id;
  if (id) {
    await client.query("UPDATE users SET role = 'admin', active = true WHERE id = $1", [id]);
  } else {
    id = (await client.query("INSERT INTO users (email, name, role) VALUES ($1, $2, 'admin') RETURNING id", [email, name])).rows[0].id;
  }
  console.log(`\nAdmin ready: ${name} <${email}>`);
  console.log(`Invite link (works once, expires in ${INVITE_DAYS} days):\n${await createInvite(client, id)}\n`);
} finally {
  await client.end();
}
