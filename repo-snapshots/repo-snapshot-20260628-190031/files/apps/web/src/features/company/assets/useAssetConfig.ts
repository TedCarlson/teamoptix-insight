"use client";

import { useEffect, useState } from "react";
import type { AssetProviderOption, AssetStatusOption } from "./asset.types";

export function useAssetConfig(companySlug: string, assetTypeKey: string) {
  const [providers, setProviders] = useState<AssetProviderOption[]>([]);
  const [statuses, setStatuses] = useState<AssetStatusOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!companySlug || !assetTypeKey) return;

      setLoading(true);
      setError(null);

      try {
        const [providersRes, statusesRes] = await Promise.all([
          fetch(`/api/company/${companySlug}/assets/providers?assetTypeKey=${assetTypeKey}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${companySlug}/assets/statuses`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const providersData = await providersRes.json().catch(() => ({}));
        const statusesData = await statusesRes.json().catch(() => ({}));

        if (!active) return;

        if (!providersRes.ok) {
          setError(providersData?.error ?? "Failed to load providers.");
          return;
        }

        if (!statusesRes.ok) {
          setError(statusesData?.error ?? "Failed to load statuses.");
          return;
        }

        setProviders(Array.isArray(providersData?.providers) ? providersData.providers : []);
        setStatuses(Array.isArray(statusesData?.statuses) ? statusesData.statuses : []);
      } catch {
        if (!active) return;
        setError("Failed to load asset configuration.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [companySlug, assetTypeKey]);

  return { providers, statuses, loading, error };
}
