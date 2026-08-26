import CompanyWorkspaceGrantBoundary from "@/features/company/components/CompanyWorkspaceGrantBoundary";

export default async function AssetsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CompanyWorkspaceGrantBoundary slug={slug} grant="assets">{children}</CompanyWorkspaceGrantBoundary>;
}
