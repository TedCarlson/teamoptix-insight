import FoyerHeader from "@/features/foyer/components/FoyerHeader";

const moments = [
  ["5:00 AM", "Planning", "Tomorrow is no longer a guess."],
  ["6:00 AM", "Dispatch", "Routes fill, assignments move, and the operation takes shape."],
  ["9:30 AM", "Operations", "The work is moving and Insight keeps context close."],
  ["2:00 PM", "Payroll", "Attendance and activity are already building."],
  ["5:30 PM", "Collection Center", "Reports arrive and history protects itself."],
  ["6:00 PM", "Intelligence", "Tomorrow begins before today ends."],
];

export default function ExplorePage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">A Day with Insight</p>
        <h1>Watch the operation come together.</h1>
        <p>
          Insight is not a collection of disconnected tools. It follows the business
          through the day and turns activity into operational context.
        </p>
      </section>

      <section className="foyer-timeline">
        {moments.map(([time, title, body]) => (
          <article key={time}>
            <span>{time}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
