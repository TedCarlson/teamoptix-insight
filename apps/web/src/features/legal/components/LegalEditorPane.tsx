"use client";

import { useState } from "react";
import styles from "./legal-workspace.module.css";

type Props = {
  section: any;
};

export function LegalEditorPane({ section }: Props) {
  const [saveState, setSaveState] = useState("idle");

  return (
    <EditorCore
      key={section?.id}   // 🔥 CRITICAL: forces reset per section
      section={section}
      saveState={saveState}
      setSaveState={setSaveState}
    />
  );
}

function EditorCore({
  section,
  saveState,
  setSaveState,
}: {
  section: any;
  saveState: string;
  setSaveState: (v: string) => void;
}) {
  // 🔥 initialize ONCE per mount (no effects, no lint issues)
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

      // 🔥 DB truth wins
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
          <button onClick={save} type="button">
            Save
          </button>

          <span>{saveState}</span>
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