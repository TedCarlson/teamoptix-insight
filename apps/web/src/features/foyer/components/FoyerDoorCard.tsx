import Link from "next/link";

type FoyerDoorCardProps = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

export default function FoyerDoorCard(props: FoyerDoorCardProps) {
  return (
    <Link className="foyer-door" href={props.href}>
      <span className="foyer-door__eyebrow">{props.eyebrow}</span>
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      <strong>{props.cta} →</strong>
    </Link>
  );
}
