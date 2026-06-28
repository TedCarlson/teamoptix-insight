import Link from "next/link";

export default function PlatformPillarCard(props: {
  eyebrow: string;
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
}) {
  const { eyebrow, title, body, href, actionLabel } = props;

  return (
    <article className="app-card" style={{ display: "grid", gap: 12 }}>
      <div>
        <p className="value-card__eyebrow">{eyebrow}</p>
        <h3 className="app-card__title">{title}</h3>
        <p className="app-card__body">{body}</p>
      </div>

      {href ? (
        <div className="cta-row" style={{ marginTop: 4 }}>
          <Link className="button" href={href}>
            {actionLabel ?? "Open"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
