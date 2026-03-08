export default function ValueCard(props: {
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
