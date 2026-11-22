import { EVENT_META, type EventType } from "@/lib/events";

export function EventBadge({ type }: { type: EventType }) {
  const m = EVENT_META[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-xs font-semibold ${m.text}`}>
      <span aria-hidden="true">{m.symbol}</span>
      {m.label}
    </span>
  );
}
