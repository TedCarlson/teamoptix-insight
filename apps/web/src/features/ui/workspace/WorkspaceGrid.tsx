type WorkspaceGridProps = {
  children: React.ReactNode;
  min?: number;
};

export default function WorkspaceGrid(props: WorkspaceGridProps) {
  const min = props.min ?? 280;

  return (
    <section
      className="workspace-grid"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {props.children}
    </section>
  );
}
