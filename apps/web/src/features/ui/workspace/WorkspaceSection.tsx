type WorkspaceSectionProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export default function WorkspaceSection(props: WorkspaceSectionProps) {
  return (
    <section className="app-card workspace-section">
      {props.eyebrow || props.title || props.description || props.action ? (
        <div className="workspace-section__head">
          <div>
            {props.eyebrow ? <p className="value-card__eyebrow">{props.eyebrow}</p> : null}
            {props.title ? <h2 className="app-card__title">{props.title}</h2> : null}
            {props.description ? <p className="app-card__body">{props.description}</p> : null}
          </div>

          {props.action ? <div>{props.action}</div> : null}
        </div>
      ) : null}

      {props.children}
    </section>
  );
}
