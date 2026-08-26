import Boundary from "@/features/company/components/CompanyWorkspaceGrantBoundary";
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) { const { slug } = await params; return <Boundary slug={slug} grant="planning">{children}</Boundary>; }
