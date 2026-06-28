type ApiEventRow = {
  id: string;
  company_id: string;
  roster_id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

function TimelineRow(props: {
  label: string;
  detail: string;
  timestamp: string;
}) {
  const { label, detail, timestamp } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: "1px solid #e6edf5",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#5c6b84",
        }}
      >
        {timestamp}
      </div>

      <div>
        <div style={{ fontWeight: 700, color: "#17213a" }}>{label}</div>
        <div style={{ marginTop: 4, color: "#5c6b84", fontSize: 14 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case "candidate_imported":
      return "Candidate imported";
    case "invite_sent":
      return "Invite sent";
    case "invite_reset":
      return "Invite reset";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function CandidateTimelinePanel(props: {
  events: ApiEventRow[];
  loading: boolean;
}) {
  const { events, loading } = props;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Lifecycle</p>
      <h3 className="value-card__title">Timeline</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Live lifecycle events from <code>company_roster_event</code>.
      </p>

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading timeline...</div>
      ) : events.length === 0 ? (
        <div style={{ paddingTop: 16 }}>No lifecycle events found.</div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {events.map((event) => (
            <TimelineRow
              key={event.id}
              label={formatEventLabel(event.event_type)}
              detail={event.event_detail ?? "No detail provided."}
              timestamp={formatTimestamp(event.occurred_at)}
            />
          ))}
        </div>
      )}
    </article>
  );
}