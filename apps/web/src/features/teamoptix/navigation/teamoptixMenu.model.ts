import type { AppMenuSection } from "@/features/navigation/appMenu.types";

export function buildTeamOptixMenu(): AppMenuSection[] {
  return [
    {
      key: "teamoptix",
      label: "TeamOptix",
      items: [
        { key: "command-center", label: "Command Center", href: "/teamoptix/command-center" },
      ],
    },
    {
      key: "work",
      label: "Work",
      items: [
        {
          key: "projects",
          label: "Projects",
          href: "/teamoptix/projects",
          children: [
            { key: "projects-roadmap", label: "Roadmap", href: "/teamoptix/projects/roadmap" },
            { key: "projects-active", label: "Active Initiatives", href: "/teamoptix/projects/active" },
            { key: "projects-presentations", label: "Presentations", href: "/teamoptix/projects/presentations" },
            { key: "projects-decisions", label: "Decisions", href: "/teamoptix/projects/decisions" },
          ],
        },
        {
          key: "products",
          label: "Products",
          href: "/teamoptix/products",
          children: [
            { key: "product-insight", label: "Insight — P&D Last Mile", href: "/teamoptix/products/insight" },
            { key: "launch-insight-companies", label: "Launch Insight Companies", href: "/companies" },
            { key: "product-itg", label: "Insight — Telecom Fulfillment", href: "/teamoptix/products/itg" },
            { key: "product-uls", label: "Utility Locate Service", href: "/teamoptix/products/uls" },
          ],
        },
        {
          key: "customers",
          label: "Customers",
          href: "/teamoptix/customers",
          children: [
            {
              key: "customer-workspace",
              label: "Customer Workspace",
              href: "/teamoptix/customers",
            },
          ],
        },
      ],
    },
    {
      key: "operations",
      label: "Platform",
      items: [
        {
          key: "engineering",
          label: "Engineering",
          href: "/teamoptix/engineering",
          children: [
            { key: "engineering-repos", label: "Repositories", href: "/teamoptix/engineering/repositories" },
            { key: "engineering-releases", label: "Releases", href: "/teamoptix/engineering/releases" },
            { key: "engineering-health", label: "Code Health", href: "/teamoptix/engineering/health" },
          ],
        },
        {
          key: "automation",
          label: "Automation",
          href: "/teamoptix/automation",
          children: [
            { key: "automation-ticket-library", label: "Automation Workbench", href: "/teamoptix/automation/ticket-library" },
            { key: "automation-assignments", label: "Company Assignments", href: "/teamoptix/automation/assignments" },
            { key: "automation-collections", label: "Collections", href: "/teamoptix/automation/collections" },
            { key: "automation-runners", label: "Runner Fleet", href: "/teamoptix/automation/runners" },
            { key: "automation-telemetry", label: "Telemetry", href: "/teamoptix/automation/telemetry" },
          ],
        },
        {
          key: "ai",
          label: "AI",
          href: "/teamoptix/ai",
          children: [
            { key: "ai-prompts", label: "Prompt Library", href: "/teamoptix/ai/prompts" },
            { key: "ai-assistants", label: "Assistants", href: "/teamoptix/ai/assistants" },
            { key: "ai-evals", label: "Evaluations", href: "/teamoptix/ai/evaluations" },
          ],
        },
      ],
    },
    {
      key: "business",
      label: "Business",
      items: [
        {
          key: "business",
          label: "Business",
          href: "/teamoptix/business",
          children: [
            { key: "business-sales", label: "Sales", href: "/teamoptix/business/sales" },
            { key: "business-marketing", label: "Marketing", href: "/teamoptix/business/marketing" },
            { key: "business-contracts", label: "Contracts", href: "/teamoptix/business/contracts" },
            { key: "business-legal", label: "Legal", href: "/teamoptix/business/legal" },
            {
              key: "business-finance",
              label: "Finance",
              href: "/teamoptix/business/finance",
              children: [
                { key: "finance-banking", label: "Banking", href: "/teamoptix/business/finance/banking" },
                { key: "finance-billing", label: "Billing", href: "/teamoptix/business/finance/billing" },
                { key: "finance-billing-stripe", label: "Stripe", href: "/teamoptix/business/finance/billing-stripe" },
                { key: "finance-accounting", label: "Accounting", href: "/teamoptix/business/finance/accounting" },
                { key: "finance-revenue", label: "Revenue", href: "/teamoptix/business/finance/revenue" },
                { key: "finance-expenses", label: "Expenses", href: "/teamoptix/business/finance/expenses" },
                { key: "finance-reporting", label: "Reporting", href: "/teamoptix/business/finance/reporting" },
              ],
            },
          ],
        },
      ],
    },
  ];
}
