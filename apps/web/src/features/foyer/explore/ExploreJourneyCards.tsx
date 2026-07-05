import { exploreMoments } from "./exploreDay.model";

export default function ExploreJourneyCards() {
  return (
    <section className="explore-journey" aria-label="Insight daily journey">
      {exploreMoments.map((moment) => (
        <article key={moment.title}>
          <h3>{moment.title}</h3>
        </article>
      ))}
    </section>
  );
}
