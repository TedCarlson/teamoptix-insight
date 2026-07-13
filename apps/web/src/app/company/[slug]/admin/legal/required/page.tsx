import CustomerLegalRequiredClient from "./CustomerLegalRequiredClient";
import {
  getCustomerLegalTasksForCompanySlug,
  getDocumentVersionsByIds,
} from "@/features/legal/server/legal.repository";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

function value(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

export default async function CustomerLegalRequiredPage({ params }: PageProps) {
  const resolved = await params;
  const slug = resolved.slug;
  const tasks = (await getCustomerLegalTasksForCompanySlug(slug)) as Record<string, unknown>[];
  const activeTasks = tasks.filter((task) => {
    const status = value(task, "status");
    return status !== "EXECUTED_AND_VAULTED" && status !== "CANCELLED";
  });
  const versionIds = activeTasks.map((task) => value(task, "document_version_id")).filter(Boolean);
  const versions = (await getDocumentVersionsByIds(versionIds)) as Record<string, unknown>[];

  return (
    <CustomerLegalRequiredClient
      slug={slug}
      tasks={activeTasks}
      versions={versions}
    />
  );
}
