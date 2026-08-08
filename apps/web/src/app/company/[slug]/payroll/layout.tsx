import PayrollWorkspace from "@/features/payroll/components/PayrollWorkspace";

export default async function PayrollLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { children, params } = props;
  const { slug } = await params;

  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        {children}
        <PayrollWorkspace slug={slug} />
      </section>
    </main>
  );
}
