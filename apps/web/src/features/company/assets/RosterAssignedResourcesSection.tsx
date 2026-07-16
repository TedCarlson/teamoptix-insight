"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { DrawerSection } from "@/features/people/components/person-drawer/PersonDrawerRows";
import RosterAssetAssignmentOverlay from "./RosterAssetAssignmentOverlay";

type AssetTypeKey = "SCANNER" | "FUEL_CARD" | "PIN";

type ResourceDefinition = {
  key: AssetTypeKey;
  label: string;
  value: string | null | undefined;
};

type Props = {
  companySlug: string;
  person: RosterRow;
  onChanged: () => Promise<void>;
};

export default function RosterAssignedResourcesSection({
  companySlug,
  person,
  onChanged,
}: Props) {
  const [activeType, setActiveType] =
    useState<AssetTypeKey | null>(null);

  const resources: ResourceDefinition[] = [
    {
      key: "SCANNER",
      label: "Scanner",
      value: person.scanner_serial,
    },
    {
      key: "FUEL_CARD",
      label: "Fuel card",
      value: person.fuel_card,
    },
    {
      key: "PIN",
      label: "PIN",
      value: person.pin_id_no,
    },
  ];

  const activeResource =
    resources.find(
      (resource) => resource.key === activeType,
    ) ?? null;

  return (
    <>
      <DrawerSection
        eyebrow="Resources"
        title="Assigned assets"
      >
        <div style={{ display: "grid", gap: 8 }}>
          {resources.map((resource) => (
            <div
              key={resource.key}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "128px minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
                minHeight: 36,
              }}
            >
              <span className="hero-stat__label">
                {resource.label}
              </span>

              <strong
                style={{
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {resource.value || "Unassigned"}
              </strong>

              <button
                className="button"
                type="button"
                onClick={() => setActiveType(resource.key)}
                style={{
                  minHeight: 32,
                  padding: "0 10px",
                }}
              >
                {resource.value ? "Change" : "Assign"}
              </button>
            </div>
          ))}
        </div>
      </DrawerSection>

      {activeResource ? (
        <RosterAssetAssignmentOverlay
          open
          companySlug={companySlug}
          rosterMemberId={person.roster_member_id}
          rosterMemberName={person.full_name}
          assetTypeKey={activeResource.key}
          assetTypeLabel={activeResource.label}
          onClose={() => setActiveType(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
