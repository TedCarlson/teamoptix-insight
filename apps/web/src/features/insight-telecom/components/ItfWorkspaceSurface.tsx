import styles from "./ItfWorkspaceSurface.module.css";

type ItfWorkspaceSurfaceProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export default function ItfWorkspaceSurface({
  title,
  description,
  children,
}: ItfWorkspaceSurfaceProps) {
  const headingId = `itf-${title.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <main className={styles.page} aria-labelledby={headingId}>
      <h1 className={styles.visuallyHidden} id={headingId}>{title}</h1>
      <p className={styles.visuallyHidden}>{description}</p>
      {children}
    </main>
  );
}

export { styles as itfSurfaceStyles };
