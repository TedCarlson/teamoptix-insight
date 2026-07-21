"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

  const requestSequence = useRef(0);

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

        if (!active) {
          return;
        }

        if (!response.ok) {
          setAvailableYears([]);
          setSelectedYear(null);
          setError(
            result?.error ??
              "Failed to load available FINAL DSW years."
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
        if (!active) {
          return;
        }

        setAvailableYears([]);
        setSelectedYear(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load available FINAL DSW years."
        );
      } finally {
        if (active) {
          setYearsLoading(false);
        }
      }
    }

    requestSequence.current += 1;
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

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    try {
      setPayloadLoading(true);
      setError(null);
      setPayload(null);

      const response = await fetch(
        `/api/company/${slug}/analytics/history?year=${selectedYear}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (requestSequence.current !== requestId) {
        return;
      }

      if (!response.ok) {
        setError(
          result?.error ??
            "Failed to load the FINAL DSW payload."
        );
        return;
      }

      setPayload(result as OperationsHistoryPayload);
      setLoadedYear(selectedYear);
    } catch (caught) {
      if (requestSequence.current !== requestId) {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load the FINAL DSW payload."
      );
    } finally {
      if (requestSequence.current === requestId) {
        setPayloadLoading(false);
      }
    }
  }, [
    loadedYear,
    selectedYear,
    slug,
    yearOptions,
  ]);

  useEffect(() => {
    if (
      yearsLoading ||
      selectedYear === null ||
      selectedYear === loadedYear ||
      !yearOptions.includes(selectedYear)
    ) {
      return;
    }

    void loadSelectedYear();
  }, [
    loadedYear,
    loadSelectedYear,
    selectedYear,
    yearOptions,
    yearsLoading,
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
