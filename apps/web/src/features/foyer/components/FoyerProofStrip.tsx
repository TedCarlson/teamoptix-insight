const proofItems = [
  {
    title: "Built for Contractors",
    body: "We understand the work because we have lived it.",
  },
  {
    title: "Operator First",
    body: "Tools should respect your time, your people, and your standards.",
  },
  {
    title: "Your Data. Your Business.",
    body: "Operational truth should be protected, not scattered.",
  },
];

export default function FoyerProofStrip() {
  return (
    <section className="foyer-proof" aria-label="Team Optix principles">
      {proofItems.map((item) => (
        <article key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </section>
  );
}
