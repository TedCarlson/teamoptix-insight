"use client";

import { useEffect, useState } from "react";
import styles from "./legal-workspace.module.css";

type Props = {
  section: any;
};

export function LegalEditorPane({ section }: Props) {
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    setBody(section?.body_markdown ?? "");
    setSaveState("idle");
  }, [section?.id]);

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

      if (!json?.dbWritten || !json?.section) {
        setSaveState("error");
        return;
      }

      setBody(json.section.body_markdown ?? "");
      setSaveState("saved");

      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("error");
    }
  }

  if (!section) return null;

  return (
    <section className={styles.editor}>
      <div className={styles.documentCard}>
        <div className={styles.documentHeader}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <p className={styles.panelLabel}>Draft Content</p>

            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid #ddd",
              }}
            >
              {saveState}
            </span>
          </div>

          <h2 className={styles.documentTitle}>
            {section.section_number}. {section.title}
          </h2>

          <button
            type="button"
            onClick={save}
            disabled={saveState === "saving"}
            className={styles.secondaryButton}
            style={{ width: "fit-content", marginTop: 8 }}
          >
            Save section
          </button>
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
