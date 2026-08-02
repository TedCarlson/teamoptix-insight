"use client";

import { useEffect, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";

export function usePeopleWorkspaceRoster(slug: string) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    fetch(`/api/company/${slug}/people/roster`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Unable to load workforce records.");
        return body;
      })
      .then((body) => {
        if (!active) return;
        setRows(Array.isArray(body?.roster) ? body.roster : []);
      })
      .catch((cause) => {
        if (!active) return;
        setRows([]);
        setError(cause instanceof Error ? cause.message : "Unable to load workforce records.");
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [slug]);

  return { rows, loading, error };
}
