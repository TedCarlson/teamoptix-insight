import { NextRequest, NextResponse } from "next/server";
import {
  deliveryManifestSheetsFromWorkbook,
  parseDeliveryManifest,
  parsePickupManifest,
  pickupManifestSheetsFromWorkbook,
  readManifestWorkbook,
} from "@/features/operations/manifests";

export const runtime = "nodejs";

type ManifestType = "delivery" | "pickup";

function normalizeManifestType(value: FormDataEntryValue | null): ManifestType | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "delivery") return "delivery";
  if (normalized === "pickup") return "pickup";

  return null;
}

function countBy<T extends string | number | boolean | null | undefined>(
  values: readonly T[]
) {
  const counts: Record<string, number> = {};

  for (const value of values) {
    const key = String(value ?? "").trim() || "blank";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function summarizeDeliveryManifest(buffer: Buffer) {
  const workbookSheets = readManifestWorkbook(buffer);
  const parsed = parseDeliveryManifest(deliveryManifestSheetsFromWorkbook(workbookSheets));

  return {
    manifest_type: "delivery",
    workbook_sheets: Object.keys(workbookSheets),
    metadata: parsed.metadata,
    stop_detail: {
      header_row_index: parsed.stopDetail.headerRowIndex,
      parsed_row_count: parsed.stopDetail.parsedRowCount,
      skipped_row_count: parsed.stopDetail.skippedRowCount,
      completed_counts: countBy(parsed.stopDetail.rows.map((row) => row.completed)),
      package_count_total: parsed.stopDetail.rows.reduce(
        (total, row) => total + (row.package_count ?? 0),
        0
      ),
      sample_rows: parsed.stopDetail.rows.slice(0, 3),
    },
    package_detail: {
      header_row_index: parsed.packageDetail.headerRowIndex,
      parsed_row_count: parsed.packageDetail.parsedRowCount,
      skipped_row_count: parsed.packageDetail.skippedRowCount,
      prem_svc_counts: countBy(parsed.packageDetail.rows.map((row) => row.prem_svc_raw)),
      express_package_count: parsed.packageDetail.rows.filter((row) => row.is_express).length,
      residential_package_count: parsed.packageDetail.rows.filter((row) => row.is_residential)
        .length,
      signature_package_count: parsed.packageDetail.rows.filter((row) => row.is_signature)
        .length,
      hazmat_package_count: parsed.packageDetail.rows.filter((row) => row.is_hazmat).length,
      collection_package_count: parsed.packageDetail.rows.filter((row) => row.is_collection)
        .length,
      sample_rows: parsed.packageDetail.rows.slice(0, 3),
    },
  };
}

function summarizePickupManifest(buffer: Buffer) {
  const workbookSheets = readManifestWorkbook(buffer);
  const parsed = parsePickupManifest(pickupManifestSheetsFromWorkbook(workbookSheets));

  return {
    manifest_type: "pickup",
    workbook_sheets: Object.keys(workbookSheets),
    metadata: parsed.metadata,
    pickup_detail: {
      header_row_index: parsed.pickupDetail.headerRowIndex,
      parsed_row_count: parsed.pickupDetail.parsedRowCount,
      skipped_row_count: parsed.pickupDetail.skippedRowCount,
      pickup_type_counts: countBy(parsed.pickupDetail.rows.map((row) => row.pickup_type)),
      package_count_expected_total: parsed.pickupDetail.rows.reduce(
        (total, row) => total + (row.package_count_expected ?? 0),
        0
      ),
      packages_picked_up_total: parsed.pickupDetail.rows.reduce(
        (total, row) => total + (row.packages_picked_up ?? 0),
        0
      ),
      sample_rows: parsed.pickupDetail.rows.slice(0, 5),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const manifestType = normalizeManifestType(formData.get("manifest_type"));

    if (!manifestType) {
      return NextResponse.json(
        { error: "manifest_type is required and must be delivery or pickup." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const summary =
      manifestType === "delivery"
        ? summarizeDeliveryManifest(buffer)
        : summarizePickupManifest(buffer);

    return NextResponse.json({
      filename: file.name,
      size_bytes: file.size,
      ...summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to inspect manifest workbook.",
      },
      { status: 500 }
    );
  }
}
