import CandidateFoyerPage from "@/features/candidate-entry/pages/CandidateFoyerPage";

export default async function Page(props: { params: Promise<{ entryCode: string }> }) {
  const { entryCode } = await props.params;
  return <CandidateFoyerPage entryCode={entryCode} />;
}
