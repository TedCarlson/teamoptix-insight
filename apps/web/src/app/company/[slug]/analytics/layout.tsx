import { AnalyticsDataProvider } from "@/features/company/analytics/AnalyticsDataProvider";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function AnalyticsLayout({
  children,
  params,
}: Props) {
  const { slug } = await params;

  return (
    <AnalyticsDataProvider slug={slug}>
      {children}
    </AnalyticsDataProvider>
  );
}
