type AnalyticsStubSurfaceProps = {
  eyebrow: string;
  title: string;
  purpose: string;
  expected: string[];
  foundation?: string;
};

export default function AnalyticsStubSurface(
  props: AnalyticsStubSurfaceProps
) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <article className="app-card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <p className="value-card__eyebrow">{props.eyebrow}</p>
            <h2 className="app-card__title">{props.title}</h2>
          </div>

          <span
            className="pill"
            style={{
              background: "#f1f5f9",
              borderColor: "#dbe4ee",
              color: "#475569",
            }}
          >
            Coming soon
          </span>
        </div>

        <p
          className="app-card__body"
          style={{ marginTop: 12, maxWidth: 900 }}
        >
          {props.purpose}
        </p>
      </article>

      <article className="app-card" style={{ padding: 16 }}>
        <p className="value-card__eyebrow">What to expect</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>
          Planned capabilities
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {props.expected.map((item) => (
            <div
              key={item}
              className="context-stat"
              style={{ padding: "11px 12px" }}
            >
              <strong>{item}</strong>
            </div>
          ))}
        </div>

        <p className="app-card__body" style={{ marginTop: 12 }}>
          {props.foundation ??
            "This surface will be activated after its governed analytics payload and evidence definitions are approved."}
        </p>
      </article>
    </section>
  );
}
