export const EVENT_TYPES = ["management", "social", "meeting", "birthday"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Each type has a text label AND a distinct symbol, so colour is never the only cue.
export const EVENT_META: Record<EventType, { label: string; symbol: string; bg: string; text: string }> = {
  management: { label: "Management", symbol: "■", bg: "bg-ev-management", text: "text-ev-management" },
  social: { label: "Social", symbol: "●", bg: "bg-ev-social", text: "text-ev-social" },
  meeting: { label: "Meeting", symbol: "▲", bg: "bg-ev-meeting", text: "text-ev-meeting" },
  birthday: { label: "Birthday", symbol: "◆", bg: "bg-ev-birthday", text: "text-ev-birthday" },
};

export type CalendarEvent = {
  id: string;
  title: string;
  type: EventType;
  event_date: string;
  start_time: string | null;
  meeting_url: string | null;
  notes: string;
};

export const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : "All day");
