"use client";

import { useEffect, useState } from "react";
import type { CandidateRecord } from "@/features/hiring/lib/candidate-detail.types";

export default function CandidateContactEditor(props: {
  slug: string;
  candidate: CandidateRecord | null;
  loading: boolean;
  onSaved: (next: CandidateRecord) => void;
}) {
  const { slug, candidate, loading, onSaved } = props;

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(candidate?.email ?? "");
    setPhone(candidate?.phone ?? "");
    setMessage(null);
    setError(null);
  }, [candidate?.id, candidate?.email, candidate?.phone]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!candidate?.id) {
      setError("Candidate record is unavailable.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${candidate.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email,
            phone,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Contact update failed.");
      }

      const roster = (data?.roster ?? {}) as {
        email?: string | null;
        phone?: string | null;
      };

      onSaved({
        ...candidate,
        email:
          typeof roster.email === "string"
            ? roster.email
            : email.trim() || null,
        phone:
          typeof roster.phone === "string"
            ? roster.phone
            : phone.trim() || null,
      });

      setMessage("Candidate contact info saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contact update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">Contact</p>
      <h3 className="value-card__title">Invite contact</h3>
      <p className="value-card__body">
        Maintain the email and phone used to contact and invite this candidate.
      </p>

      {loading ? (
        <p className="value-card__body">Loading contact fields...</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="hero-stat__label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="hero-stat__label">Phone</span>
            <input
              className="input"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
            />
          </label>

          <div className="cta-row">
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Contact"}
            </button>
          </div>

          {message ? <p style={{ color: "#2e7d32", margin: 0 }}>{message}</p> : null}
          {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
        </form>
      )}
    </article>
  );
}
