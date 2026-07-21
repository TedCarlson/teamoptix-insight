import type {
  RouteCapacityBand,
  RouteCapacityClass,
  RouteCapacityConfidence,
  RouteCapacityThresholdBasis,
} from "./routeCapacity.types";

export type RoutePortfolioDay = {
  serviceDate: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  routeIdentity: string;
  routeName: string;
  waNumber: string | null;
  stops: number;
  packages: number;
  packagesPerStop: number | null;
  routeCount: 1;
  sourceStatus: "final";
  routeClass: RouteCapacityClass;
  demandBand: RouteCapacityBand;
  historicalMedianStops: number | null;
  historicalSampleSize: number;
  comparisonBasis: RouteCapacityThresholdBasis;
  confidence: RouteCapacityConfidence;
};

export type RoutePortfolioWeek = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  operatingDays: number;
  routeInstances: number;
  stops: number;
  packages: number;
  packagesPerStop: number | null;
  averageStopsPerRoute: number | null;
  averagePackagesPerRoute: number | null;
};

export type RouteWeekPoint = RoutePortfolioWeek & {
  routeIdentity: string;
  routeName: string;
  companyStops: number;
  companyPackages: number;
  shareOfCompanyStops: number | null;
  shareOfCompanyPackages: number | null;
  stopsWoW: number | null;
  packagesWoW: number | null;
  packagesPerStopWoW: number | null;
  demandBand: RouteCapacityBand;
  sourceCompleteness: number;
};

export type RoutePortfolioRoute = {
  routeIdentity: string;
  routeName: string;
  waNumber: string | null;
  operatedDays: number;
  observedWeeks: number;
  latestWeek: RouteWeekPoint | null;
  weeks: RouteWeekPoint[];
  averageStopsPerDay: number | null;
  averagePackagesPerDay: number | null;
  averagePackagesPerStop: number | null;
  shareOfCompanyStops: number | null;
  shareOfCompanyPackages: number | null;
  frequency: number;
  heavyWeeks: number;
  lightWeeks: number;
  outsideNormalWeeks: number;
  sourceCompleteness: number;
  comparisonBasis: RouteCapacityThresholdBasis;
  confidence: RouteCapacityConfidence;
};

export type RoutePortfolioHeadline = {
  routesOperated: number;
  routeInstances: number;
  operatingDays: number;
  averageStopsPerRoute: number | null;
  averagePackagesPerRoute: number | null;
  averagePackagesPerStop: number | null;
  heavyRoutes: number;
  routesOutsideNormalRange: number;
  finalSourceCoverage: number;
};

export type RoutePortfolioPayload = {
  range: {
    startDate: string;
    endDate: string;
  };
  generatedAt: string;
  source: {
    family: "DSW";
    snapshot: "FINAL";
    dutyHoursAvailable: false;
    roadHoursAvailable: false;
    milesAvailable: false;
  };
  headline: RoutePortfolioHeadline;
  companyWeeks: RoutePortfolioWeek[];
  routes: RoutePortfolioRoute[];
};
