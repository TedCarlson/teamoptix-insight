"use client";

type TimelineEvent = {
  id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

type Props = {
  events: TimelineEvent[];
  loading?: boolean;
};

function formatEventType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function PersonTimelineSection({ events, loading = false }: Props) {
  return (
    <section
      style={{
        borderTop: "1px solid #e6edf5",
        padding: "14px 0 0",
        display: "grid",
        gap: 10,
      }}
    >
      <p className="workspace-eyebrow">Change Log</p>
      <h3 className="workspace-card-title">Timeline</h3>

      {loading ? (
        <p className="workspace-card-body">Loading timeline...</p>
      ) : events.length === 0 ? (
        <p className="workspace-card-body">No timeline events yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {events.map((event) => (
            <article
              key={event.id}
              style={{
                border: "1px solid #e6edf5",
                borderRadius: 14,
                padding: "10px 12px",
                background: "#fbfdff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "baseline",
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {formatEventType(event.event_type)}
                </strong>
                <span className="workspace-eyebrow" style={{ whiteSpace: "nowrap" }}>
                  {formatDate(event.occurred_at ?? event.created_at)}
                </span>
              </div>

              {event.event_detail ? (
                <p className="workspace-card-body" style={{ marginTop: 4 }}>
                  {event.event_detail}
                </p>
              ) : null}

              <p className="workspace-card-body" style={{ marginTop: 4 }}>
                {event.event_category}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
