"use client";

import styles from "./legal-workspace.module.css";

export function EvidencePrintButton() {
  return (
    <button className={styles.primaryButton} type="button" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
