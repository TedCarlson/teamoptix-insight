type WorkspaceHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export default function WorkspaceHeader(props: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        <p className="value-card__eyebrow">{props.eyebrow}</p>
        <h1 className="workspace-title">{props.title}</h1>
        {props.description ? (
          <p className="workspace-subtitle">{props.description}</p>
        ) : null}
      </div>

      {props.action ? (
        <div className="workspace-header__action">{props.action}</div>
      ) : null}
    </header>
  );
}
