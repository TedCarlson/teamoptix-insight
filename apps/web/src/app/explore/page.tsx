import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";
import ExploreClock from "@/features/foyer/explore/ExploreClock";
import ExploreJourneyCards from "@/features/foyer/explore/ExploreJourneyCards";

export default function ExplorePage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="explore-hero">
        <div>
          <p className="foyer-kicker">A Day with Insight</p>
          <h1>Watch the operation come together.</h1>
          <p>
            Insight is not a collection of disconnected tools. It follows the
            business through the day and turns activity into operational context.
          </p>
        </div>

        <ExploreClock />
      </section>

      <section className="explore-narrative">
        <p className="foyer-kicker">One day. One system.</p>
        <h2>Every part of the operation contributes to one connected story.</h2>
        <p>
          Planning becomes dispatch. Dispatch becomes operations.
          Operations become payroll. Every day becomes intelligence for tomorrow.
        </p>
      </section>

      <ExploreJourneyCards />

      <FoyerWorkspaceRequestCard />
    </main>
  );
}
