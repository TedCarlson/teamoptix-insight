"use client";

import { useState } from "react";
import styles from "./legal-workspace.module.css";

type Props = {
  draftMode: boolean;
  section: {
    id: string;
    section_number?: string | number | null;
    title?: string | null;
    body_markdown?: string | null;
  };
};

export function LegalEditorPane({ draftMode, section }: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [body, setBody] = useState(section.body_markdown ?? "");

  async function save() {
    try {
      setSaveState("saving");

      const res = await fetch("/api/legal/section/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          body,
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setSaveState("error");
        return;
      }

      setBody(json.section?.body_markdown ?? body);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <section className={styles.editor}>
      <article className={styles.documentCard}>
        <header className={styles.documentHeader}>
          <div>
            <p className={styles.panelLabel}>Section {section.section_number ?? "—"}</p>
            <h2 className={styles.documentTitle}>{section.title ?? "Untitled Section"}</h2>
          </div>

          {draftMode ? (
            <div className={styles.editorActions}>
              <button className={styles.primaryButton} onClick={save} type="button">
                Save
              </button>

              <span className={saveState === "error" ? styles.saveError : styles.saveStatus}>
                {saveState}
              </span>
            </div>
          ) : null}
        </header>

        {draftMode ? (
          <textarea
            className={styles.editorTextarea}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        ) : (
          <div className={styles.documentBody}>
            {body
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
          </div>
        )}
      </article>
    </section>
  );
}
