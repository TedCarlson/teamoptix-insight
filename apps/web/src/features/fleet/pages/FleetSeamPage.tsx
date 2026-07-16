import Link from "next/link";

type FleetSeamPageProps = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
};

const fleetSurfaces = [
  { label: "Vehicles", path: "vehicles", description: "Vehicle inventory, status, and assignment." },
  { label: "Maintenance", path: "maintenance", description: "Service needs, work, and maintenance history." },
  { label: "Inspections", path: "inspections", description: "Inspection readiness, findings, and follow-up." },
];

export default function FleetSeamPage(props: FleetSeamPageProps) {
  const fleetBase = `/company/${props.slug}/fleet`;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section style={{ display: "grid", gap: 10 }}>
          <article className="app-card" style={{ padding: 14 }}>
            <p className="value-card__eyebrow">{props.eyebrow}</p>
            <h1 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h1>
            <p className="app-card__body" style={{ marginTop: 8 }}>{props.description}</p>
          </article>

          {props.children}

          {!props.children ? <section
            aria-label="Fleet surfaces"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}
          >
            {fleetSurfaces.map((surface) => (
              <Link
                key={surface.path}
                href={`${fleetBase}/${surface.path}`}
                className="app-card"
                style={{ padding: 14, color: "inherit", textDecoration: "none" }}
              >
                <p className="value-card__eyebrow">Fleet</p>
                <h2 className="app-card__title" style={{ fontSize: 16 }}>{surface.label}</h2>
                <p className="app-card__body" style={{ marginTop: 8 }}>{surface.description}</p>
              </Link>
            ))}
          </section> : null}
        </section>
      </section>
    </main>
  );
}
