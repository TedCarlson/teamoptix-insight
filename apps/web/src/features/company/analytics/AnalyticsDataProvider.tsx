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
import { usePathname } from "next/navigation";
import {
  isAnalyticsComparisonMode,
  isAnalyticsRangePreset,
  type AnalyticsComparisonMode,
  type AnalyticsRangePreset,
} from "./analyticsContext";
import type {
  AvailableOperationsHistoryYear,
  OperationsHistoryPayload,
} from "./operationsHistory.types";

type AnalyticsDataState = {
  selectedYear: number | null;
  loadedYear: number | null;
  selectedPreset: AnalyticsRangePreset;
  selectedContractId: string | null;
  comparisonMode: AnalyticsComparisonMode;
  availableYears: AvailableOperationsHistoryYear[];
  contractOptions: AvailableOperationsHistoryYear[];
  yearOptions: number[];
  payload: OperationsHistoryPayload | null;
  comparisonPayload: OperationsHistoryPayload | null;
  yearsLoading: boolean;
  payloadLoading: boolean;
  comparisonLoading: boolean;
  error: string | null;
  comparisonError: string | null;
  selectYear: (year: number) => void;
  selectPreset: (preset: AnalyticsRangePreset) => void;
  selectContract: (contractId: string | null) => void;
  selectComparisonMode: (mode: AnalyticsComparisonMode) => void;
  loadSelectedRange: () => Promise<void>;
};

const AnalyticsDataContext =
  createContext<AnalyticsDataState | null>(null);

function number(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function uniqueContractOptions(
  entries: AvailableOperationsHistoryYear[],
  selectedYear: number | null
): AvailableOperationsHistoryYear[] {
  const byContract = new Map<
    string,
    AvailableOperationsHistoryYear
  >();

  for (const entry of entries) {
    if (Number(entry.calendar_year) !== selectedYear) continue;
    byContract.set(entry.contract_id, entry);
  }

  return [...byContract.values()].sort((left, right) =>
    left.segment_start_date.localeCompare(
      right.segment_start_date
    )
  );
}

export function AnalyticsDataProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [selectedYear, setSelectedYear] =
    useState<number | null>(null);
  const [loadedYear, setLoadedYear] =
    useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<AnalyticsRangePreset>("calendar_year");
  const [selectedContractId, setSelectedContractId] =
    useState<string | null>(null);
  const [comparisonMode, setComparisonMode] =
    useState<AnalyticsComparisonMode>("none");
  const [availableYears, setAvailableYears] = useState<
    AvailableOperationsHistoryYear[]
  >([]);
  const [payload, setPayload] =
    useState<OperationsHistoryPayload | null>(null);
  const [comparisonPayload, setComparisonPayload] =
    useState<OperationsHistoryPayload | null>(null);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<
    string | null
  >(null);
  const requestSequence = useRef(0);
  const requestAbortController = useRef<AbortController | null>(
    null
  );
  const loadedContextKey = useRef<string | null>(null);

  const yearOptions = useMemo(
    () =>
      [
        ...new Set(
          availableYears
            .map((item) => Number(item.calendar_year))
            .filter((value) => Number.isInteger(value))
        ),
      ].sort((left, right) => right - left),
    [availableYears]
  );

  const contractOptions = useMemo(
    () => uniqueContractOptions(availableYears, selectedYear),
    [availableYears, selectedYear]
  );

  const contractSelectionSettled = useMemo(() => {
    if (selectedYear === null || contractOptions.length === 0) {
      return true;
    }

    if (selectedContractId) {
      return contractOptions.some(
        (option) => option.contract_id === selectedContractId
      );
    }

    return contractOptions.length > 1;
  }, [contractOptions, selectedContractId, selectedYear]);

  const contextKey = useMemo(
    () =>
      selectedYear === null
        ? null
        : [
            selectedYear,
            selectedPreset,
            selectedContractId ?? "all",
            comparisonMode,
          ].join(":"),
    [
      comparisonMode,
      selectedContractId,
      selectedPreset,
      selectedYear,
    ]
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

        const entries = Array.isArray(result?.available_years)
          ? (result.available_years as AvailableOperationsHistoryYear[])
          : [];
        const options = [
          ...new Set(
            entries
              .map((item) => Number(item.calendar_year))
              .filter((value) => Number.isInteger(value))
          ),
        ].sort((left, right) => right - left);
        const initialParams = new URLSearchParams(
          window.location.search
        );
        const requestedYear = number(initialParams.get("year"));
        const requestedPreset = initialParams.get("preset");
        const requestedComparison = initialParams.get("compare");
        const requestedContract = initialParams.get("contract");
        const initialYear =
          requestedYear !== null && options.includes(requestedYear)
            ? requestedYear
            : options.at(0) ?? null;
        const initialContracts = uniqueContractOptions(
          entries,
          initialYear
        );
        const initialContractId =
          requestedContract &&
          initialContracts.some(
            (entry) => entry.contract_id === requestedContract
          )
            ? requestedContract
            : initialContracts.length === 1
              ? initialContracts[0].contract_id
              : null;

        setAvailableYears(entries);
        setSelectedYear(initialYear);
        setSelectedPreset(
          isAnalyticsRangePreset(requestedPreset)
            ? requestedPreset
            : "calendar_year"
        );
        setComparisonMode(
          isAnalyticsComparisonMode(requestedComparison)
            ? requestedComparison
            : "none"
        );
        setSelectedContractId(initialContractId);
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
        if (active) setYearsLoading(false);
      }
    }

    requestSequence.current += 1;
    requestAbortController.current?.abort();
    loadedContextKey.current = null;
    setLoadedYear(null);
    setPayload(null);
    setComparisonPayload(null);

    if (slug) void loadAvailableYears();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (selectedYear === null || contractOptions.length === 0) {
      setSelectedContractId(null);
      return;
    }

    if (
      selectedContractId &&
      contractOptions.some(
        (option) => option.contract_id === selectedContractId
      )
    ) {
      return;
    }

    setSelectedContractId(
      contractOptions.length === 1
        ? contractOptions[0].contract_id
        : null
    );
  }, [contractOptions, selectedContractId, selectedYear]);

  useEffect(() => {
    if (
      yearsLoading ||
      selectedYear === null ||
      !contractSelectionSettled
    ) {
      return;
    }

    const params = new URLSearchParams();
    params.set("year", String(selectedYear));
    params.set("preset", selectedPreset);
    params.set("compare", comparisonMode);
    if (selectedContractId) {
      params.set("contract", selectedContractId);
    }

    const nextUrl = `${pathname}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(
        window.history.state,
        "",
        nextUrl
      );
    }
  }, [
    comparisonMode,
    pathname,
    selectedContractId,
    selectedPreset,
    selectedYear,
    contractSelectionSettled,
    yearsLoading,
  ]);

  const loadSelectedRange = useCallback(async () => {
    if (
      selectedYear === null ||
      !yearOptions.includes(selectedYear) ||
      contextKey === null ||
      !contractSelectionSettled ||
      loadedContextKey.current === contextKey
    ) {
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    requestAbortController.current?.abort();
    const abortController = new AbortController();
    requestAbortController.current = abortController;

    const params = new URLSearchParams({
      year: String(selectedYear),
      preset: selectedPreset,
      compare: comparisonMode,
      target: "primary",
    });
    if (selectedContractId) {
      params.set("contractId", selectedContractId);
    }

    try {
      setPayloadLoading(true);
      setComparisonLoading(false);
      setError(null);
      setComparisonError(null);
      setPayload(null);
      setComparisonPayload(null);
      setLoadedYear(null);

      const primaryResponse = await fetch(
        `/api/company/${slug}/analytics/history?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: abortController.signal,
        }
      );
      const primaryResult = await primaryResponse.json();

      if (requestSequence.current !== requestId) return;

      if (!primaryResponse.ok) {
        setError(
          primaryResult?.error ??
            "Failed to load the selected analytics range."
        );
        return;
      }

      setPayload(primaryResult as OperationsHistoryPayload);
      setLoadedYear(selectedYear);
      loadedContextKey.current = contextKey;
      setPayloadLoading(false);

      if (comparisonMode === "none") return;

      setComparisonLoading(true);
      params.set("target", "comparison");
      const comparisonResponse = await fetch(
        `/api/company/${slug}/analytics/history?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: abortController.signal,
        }
      );
      const comparisonResult = await comparisonResponse.json();

      if (requestSequence.current !== requestId) return;

      if (!comparisonResponse.ok) {
        setComparisonError(
          comparisonResult?.error ??
            "Failed to load the comparison range."
        );
        return;
      }

      setComparisonPayload(
        comparisonResult as OperationsHistoryPayload
      );
    } catch (caught) {
      if (
        requestSequence.current !== requestId ||
        abortController.signal.aborted
      ) {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load the selected analytics range."
      );
    } finally {
      if (requestSequence.current === requestId) {
        setPayloadLoading(false);
        setComparisonLoading(false);
      }
    }
  }, [
    comparisonMode,
    contractSelectionSettled,
    contextKey,
    selectedContractId,
    selectedPreset,
    selectedYear,
    slug,
    yearOptions,
  ]);

  useEffect(() => {
    if (
      yearsLoading ||
      selectedYear === null ||
      contextKey === null ||
      !contractSelectionSettled ||
      loadedContextKey.current === contextKey
    ) {
      return;
    }

    void loadSelectedRange();
  }, [
    contextKey,
    contractSelectionSettled,
    loadSelectedRange,
    selectedYear,
    yearsLoading,
  ]);

  useEffect(
    () => () => requestAbortController.current?.abort(),
    []
  );

  const value = useMemo<AnalyticsDataState>(
    () => ({
      selectedYear,
      loadedYear,
      selectedPreset,
      selectedContractId,
      comparisonMode,
      availableYears,
      contractOptions,
      yearOptions,
      payload,
      comparisonPayload,
      yearsLoading,
      payloadLoading,
      comparisonLoading,
      error,
      comparisonError,
      selectYear: setSelectedYear,
      selectPreset: setSelectedPreset,
      selectContract: setSelectedContractId,
      selectComparisonMode: setComparisonMode,
      loadSelectedRange,
    }),
    [
      availableYears,
      comparisonError,
      comparisonLoading,
      comparisonMode,
      comparisonPayload,
      contractOptions,
      error,
      loadSelectedRange,
      loadedYear,
      payload,
      payloadLoading,
      selectedContractId,
      selectedPreset,
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
