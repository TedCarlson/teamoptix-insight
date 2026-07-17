type FleetSeamPageProps = {
  children?: React.ReactNode;
};

export default function FleetSeamPage(props: FleetSeamPageProps) {
  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section style={{ display: "grid", gap: 10 }}>
          {props.children}
        </section>
      </section>
    </main>
  );
}
