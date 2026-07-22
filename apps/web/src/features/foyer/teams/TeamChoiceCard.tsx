import Link from "next/link";

type TeamChoiceCardProps = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

export default function TeamChoiceCard(props: TeamChoiceCardProps) {
  return (
    <Link className="foyer-door foyer-door--interactive" href={props.href}>
      <span className="foyer-door__eyebrow">{props.eyebrow}</span>
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      <strong className="foyer-door__cta">
        {props.cta}
        <span className="foyer-door__arrow" aria-hidden="true">
          →
        </span>
      </strong>
    </Link>
  );
}
