import React from "react";

const page: React.CSSProperties = {
  padding: 24,
  maxWidth: 980,
  margin: "0 auto",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 850,
  margin: 0,
};

const subtitle: React.CSSProperties = {
  marginTop: 10,
  opacity: 0.75,
};

const box: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  marginTop: 12,
};

const boxTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  opacity: 0.75,
};

const boxBody: React.CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  lineHeight: 1.55,
  opacity: 0.85,
};

export default function Page() {
  return (
    <main style={page}>
      <h1 style={title}>SMART Report (Internal)</h1>
      <p style={subtitle}>Landing placeholder. Navigation lives in the menu.</p>

      <section style={box}>
        <h2 style={boxTitle}>Executive Summary</h2>
        <div style={boxBody}>Placeholder</div>
      </section>

      <section style={box}>
        <h2 style={boxTitle}>P4P Performance (Track A)</h2>
        <div style={boxBody}>Placeholder</div>
      </section>

      <section style={box}>
        <h2 style={boxTitle}>Legacy / Tie-break Context (Track B)</h2>
        <div style={boxBody}>Placeholder</div>
      </section>
    </main>
  );
}
