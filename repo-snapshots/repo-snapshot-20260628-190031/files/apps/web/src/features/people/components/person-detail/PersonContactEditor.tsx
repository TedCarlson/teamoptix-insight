"use client";

import { useEffect, useState } from "react";
import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export default function PersonContactEditor(props: {
  slug: string;
  person: PersonRecord | null;
  loading: boolean;
  onSaved: (next: PersonRecord) => void;
}) {
  const { slug, person, loading, onSaved } = props;

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(person?.email ?? "");
    setPhone(person?.phone ?? "");
    setMessage(null);
    setError(null);
  }, [person?.id, person?.email, person?.phone]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!person?.id) {
      setError("Person record is unavailable.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${person.id}`,
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

      const next = data?.roster as Partial<PersonRecord> | undefined;

      onSaved({
        ...person,
        email: typeof next?.email === "string" ? next.email : email.trim() || null,
        phone: typeof next?.phone === "string" ? next.phone : phone.trim() || null,
      });

      setMessage("Contact info saved.");
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
        Maintain the company-managed email and phone used to contact and invite this person.
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
