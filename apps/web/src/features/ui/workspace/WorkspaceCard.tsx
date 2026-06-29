type WorkspaceCardProps = {
  eyebrow: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
};

export default function WorkspaceCard(props: WorkspaceCardProps) {
  return (
    <section className="app-card workspace-card">
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h2 className="app-card__title">{props.title}</h2>
      {props.body ? <p className="app-card__body">{props.body}</p> : null}
      {props.children}
    </section>
  );
}
