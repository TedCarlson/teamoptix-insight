type CompanyAssetsPageShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export default function CompanyAssetsPageShell(props: CompanyAssetsPageShellProps) {
  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section style={{ display: "grid", gap: 10 }}>
          <article className="app-card" style={{ padding: 14 }}>
            <p className="value-card__eyebrow">Asset management</p>
            <h1 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h1>
            <p className="app-card__body" style={{ marginTop: 8 }}>{props.description}</p>
          </article>

          {props.children}
        </section>
      </section>
    </main>
  );
}
