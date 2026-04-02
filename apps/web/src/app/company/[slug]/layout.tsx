import { LobProvider } from "@/features/lob/providers/LobProvider";
import CompanyBranchNav from "@/features/company/components/CompanyBranchNav";

export default async function CompanyLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { children, params } = props;
  const { slug } = await params;

  return (
    <LobProvider>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          background: "#f8fafc",
        }}
      >
        <CompanyBranchNav slug={slug} />
        {children}
      </div>
    </LobProvider>
  );
}