import CandidateFoyerPage from "@/features/candidate-entry/pages/CandidateFoyerPage";

export default async function Page(props: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await props.params;
  return <CandidateFoyerPage companySlug={companySlug} />;
}
