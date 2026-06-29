"use client";

import { useState } from "react";
import styles from "./legal-workspace.module.css";

type Props = {
  section: any;
};

export function LegalEditorPane({ section }: Props) {
  const [saveState, setSaveState] = useState("idle");
  const [body, setBody] = useState(section?.body_markdown ?? "");

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
      <div className={styles.documentCard}>
        <div className={styles.documentHeader}>
          <button className={styles.primaryButton} onClick={save}>
            Save
          </button>

          <span
            className={
              saveState === "error"
                ? styles.saveError
                : styles.saveStatus
            }
          >
            {saveState}
          </span>
        </div>

        <textarea
          className={styles.editorTextarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </section>
  );
}
