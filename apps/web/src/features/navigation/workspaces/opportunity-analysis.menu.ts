import type { AppMenuSection } from "../appMenu.types";

export function buildOpportunityAnalysisMenu(base: string): AppMenuSection {
  const opportunityBase = `${base}/opportunity-analysis`;

  return {
    key: "opportunity-analysis",
    label: "Opportunity Analysis",
    items: [
      { key: "opportunity-home", label: "Opportunities", href: opportunityBase },
      { key: "opportunity-new", label: "New Analysis", href: `${opportunityBase}/new` },
      { key: "opportunity-comparisons", label: "Comparisons", href: `${opportunityBase}/comparisons` },
      { key: "opportunity-assumptions", label: "Assumptions", href: `${opportunityBase}/assumptions` },
      { key: "opportunity-reference", label: "Reference Data", href: `${opportunityBase}/reference-data` },
    ],
  };
}
