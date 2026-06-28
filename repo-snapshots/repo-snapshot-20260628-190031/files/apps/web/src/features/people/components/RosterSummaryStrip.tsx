type Props = {
  activeCount: number;
  candidateCount: number;
  formerCount: number;
  complianceAlertCount: number;
};

function SummaryCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { eyebrow, title, body } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p className="value-card__body">{body}</p>
    </article>
  );
}

export default function RosterSummaryStrip(props: Props) {
  const { activeCount, candidateCount, formerCount, complianceAlertCount } =
    props;

  return (
    <section className="value-strip">
      <div className="value-grid">
        <SummaryCard
          eyebrow="Active"
          title={String(activeCount)}
          body="Currently active workforce records."
        />
        <SummaryCard
          eyebrow="Candidates"
          title={String(candidateCount)}
          body="People in onboarding or not yet fully active."
        />
        <SummaryCard
          eyebrow="Former"
          title={String(formerCount)}
          body="Archived or separated roster records."
        />
        <SummaryCard
          eyebrow="Compliance alerts"
          title={String(complianceAlertCount)}
          body="People needing compliance review soon."
        />
      </div>
    </section>
  );
}