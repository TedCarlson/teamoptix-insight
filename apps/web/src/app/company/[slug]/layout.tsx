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
      <div className="company-workspace-frame">
        <CompanyBranchNav slug={slug} />
        <div className="company-workspace-stage">{children}</div>
      </div>
    </LobProvider>
  );
}
