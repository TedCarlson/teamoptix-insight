"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AvailableOperationsHistoryYear,
  OperationsHistoryPayload,
} from "./operationsHistory.types";

type AnalyticsDataState = {
  selectedYear: number | null;
  loadedYear: number | null;
  availableYears: AvailableOperationsHistoryYear[];
  yearOptions: number[];
  payload: OperationsHistoryPayload | null;
  yearsLoading: boolean;
  payloadLoading: boolean;
  error: string | null;
  selectYear: (year: number) => void;
  loadSelectedYear: () => Promise<void>;
};

const AnalyticsDataContext =
  createContext<AnalyticsDataState | null>(null);

export function AnalyticsDataProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [selectedYear, setSelectedYear] =
    useState<number | null>(null);
  const [loadedYear, setLoadedYear] =
    useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<
    AvailableOperationsHistoryYear[]
  >([]);
  const [payload, setPayload] =
    useState<OperationsHistoryPayload | null>(null);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearOptions = useMemo(
    () =>
      availableYears
        .map((item) => Number(item.operating_year))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => b - a),
    [availableYears]
  );

  useEffect(() => {
    let active = true;

    async function loadAvailableYears() {
      try {
        setYearsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/company/${slug}/analytics/history`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!active) return;

        if (!response.ok) {
          setAvailableYears([]);
          setSelectedYear(null);
          setError(
            result?.error ??
              "Failed to load available analytics years."
          );
          return;
        }

        const rows = Array.isArray(result?.available_years)
          ? (result.available_years as AvailableOperationsHistoryYear[])
          : [];

        setAvailableYears(rows);

        const latestYear = rows
          .map((item) => Number(item.operating_year))
          .filter((value) => Number.isInteger(value))
          .sort((a, b) => b - a)
          .at(0);

        setSelectedYear(latestYear ?? null);
      } catch (caught) {
        if (!active) return;

        setAvailableYears([]);
        setSelectedYear(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load available analytics years."
        );
      } finally {
        if (active) {
          setYearsLoading(false);
        }
      }
    }

    setLoadedYear(null);
    setPayload(null);

    if (slug) {
      void loadAvailableYears();
    }

    return () => {
      active = false;
    };
  }, [slug]);

  const loadSelectedYear = useCallback(async () => {
    if (
      selectedYear === null ||
      !yearOptions.includes(selectedYear) ||
      selectedYear === loadedYear
    ) {
      return;
    }

    try {
      setPayloadLoading(true);
      setError(null);

      const response = await fetch(
        `/api/company/${slug}/analytics/history?year=${selectedYear}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(
          result?.error ?? "Failed to load analytics history."
        );
        return;
      }

      setPayload(result as OperationsHistoryPayload);
      setLoadedYear(selectedYear);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load analytics history."
      );
    } finally {
      setPayloadLoading(false);
    }
  }, [
    loadedYear,
    selectedYear,
    slug,
    yearOptions,
  ]);

  const value = useMemo<AnalyticsDataState>(
    () => ({
      selectedYear,
      loadedYear,
      availableYears,
      yearOptions,
      payload,
      yearsLoading,
      payloadLoading,
      error,
      selectYear: setSelectedYear,
      loadSelectedYear,
    }),
    [
      availableYears,
      error,
      loadedYear,
      loadSelectedYear,
      payload,
      payloadLoading,
      selectedYear,
      yearOptions,
      yearsLoading,
    ]
  );

  return (
    <AnalyticsDataContext.Provider value={value}>
      {children}
    </AnalyticsDataContext.Provider>
  );
}

export function useAnalyticsData() {
  const context = useContext(AnalyticsDataContext);

  if (!context) {
    throw new Error(
      "useAnalyticsData must be used inside AnalyticsDataProvider."
    );
  }

  return context;
}
