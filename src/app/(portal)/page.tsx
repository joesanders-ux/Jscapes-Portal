import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createPost, deletePost, togglePin } from "@/app/actions";

type Post = { id: string; title: string; body: string; pinned: boolean; created_at: Date; author: string | null };

export default async function DashboardPage() {
  const user = await requireUser();
  const { rows } = await db().query<Post>(
    `SELECT b.id, b.title, b.body, b.pinned, b.created_at, u.name AS author
       FROM bulletin_posts b LEFT JOIN users u ON u.id = b.author_id
      ORDER BY b.pinned DESC, b.created_at DESC LIMIT 20`
  );
  const isAdmin = user.role === "admin";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section aria-labelledby="metrics" className="grid gap-4 sm:grid-cols-2">
        <h2 id="metrics" className="sr-only">This week</h2>
        {/* Both tiles stay placeholders until the ServiceM8 data source is confirmed. */}
        <div className="rounded-lg border border-dashed border-line bg-surface-raised p-4">
          <p className="text-sm text-ink-muted">Visits scheduled this week (whole team)</p>
          <p className="mt-1 text-lg font-medium">Not connected</p>
          <p className="text-sm text-ink-muted">Waiting for the ServiceM8 data decision.</p>
        </div>
        <div className="rounded-lg border border-dashed border-line bg-surface-raised p-4">
          <p className="text-sm text-ink-muted">Job tickets</p>
          <p className="mt-1 text-lg font-medium">Not connected</p>
          <p className="text-sm text-ink-muted">Waiting for the ServiceM8 data decision.</p>
        </div>
      </section>

      <section aria-labelledby="bulletin" className="flex flex-col gap-4">
        <h2 id="bulletin" className="text-xl font-semibold">Team bulletin</h2>

        {isAdmin && (
          <form action={createPost} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
            <label className="text-sm font-medium" htmlFor="title">Title</label>
            <input id="title" name="title" required maxLength={120} className="rounded border border-line px-3 py-2" />
            <label className="text-sm font-medium" htmlFor="body">Message</label>
            <textarea id="body" name="body" rows={3} maxLength={2000} className="rounded border border-line px-3 py-2" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pinned" /> Pin to the top
            </label>
            <button className="self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Post message</button>
          </form>
        )}

        {rows.length === 0 ? (
          <p className="text-ink-muted">No messages yet.{isAdmin ? " Post one above." : ""}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((p) => (
              <li key={p.id} className={`rounded-lg border bg-surface-raised p-4 ${p.pinned ? "border-brand" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {p.pinned && <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text">Pinned</span>}
                  <h3 className="font-semibold">{p.title}</h3>
                </div>
                {p.body && <p className="mt-2 whitespace-pre-line">{p.body}</p>}
                <p className="mt-2 text-xs text-ink-muted">
                  {p.author ?? "Admin"} on {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(p.created_at)}
                </p>
                {isAdmin && (
                  <div className="mt-3 flex gap-2">
                    <form action={togglePin.bind(null, p.id)}>
                      <button className="rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft">{p.pinned ? "Unpin" : "Pin"}</button>
                    </form>
                    <form action={deletePost.bind(null, p.id)}>
                      <button className="rounded border border-line px-3 py-1.5 text-sm text-danger hover:bg-brand-soft">Delete</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
