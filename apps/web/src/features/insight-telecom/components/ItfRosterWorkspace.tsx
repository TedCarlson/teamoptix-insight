"use client";

import { useEffect, useMemo, useState } from "react";
import type { ItfWorkspaceContext } from "../access/itfWorkspaceContext";
import {
  ITF_POSITION_TITLE_OPTIONS,
  ITF_ROSTER_IDENTIFIER_FIELDS,
  applyItfStartedPlacement,
  buildItfRosterCommandPayload,
  buildItfRosterCopyText,
  compareItfRosterRowsByTechId,
  copyItfRosterDraft,
  createEmptyItfRosterDraft,
  itfAffiliationLabel,
  itfAffiliationTypeLabel,
  itfPositionTitleLabel,
  type ItfOfficeOption,
  type ItfPositionTitle,
  type ItfRegionOption,
  type ItfRelationshipOption,
  type ItfRosterDraft,
  type ItfRosterIdentifierType,
  type ItfRosterReviewRow,
  type ItfRosterStatus,
  type ItfSeatType,
  type ItfStartedPlacement,
  type ItfWorkforceUnit,
  type ItfWorkforceUnitOption,
} from "../roster/itfRosterForm";
import ItfWorkspaceSurface from "./ItfWorkspaceSurface";
import styles from "./ItfRosterWorkspace.module.css";

const seatOptions: Array<{ value: ItfSeatType; label: string }> = [
  { value: "UNASSIGNED", label: "Not placed" },
  { value: "FIELD", label: "Field" },
  { value: "LEADERSHIP", label: "Leadership" },
  { value: "SUPPORT", label: "Support" },
  { value: "TRAVEL", label: "Travel Tech" },
  { value: "DROP_BURY", label: "Drop Bury" },
  { value: "TRAINING", label: "Training" },
  { value: "FMLA", label: "FMLA" },
];

const positionOrder = new Map(
  ITF_POSITION_TITLE_OPTIONS.map((title, index) => [title, index])
);

const positionLabelOrder = new Map(
  ITF_POSITION_TITLE_OPTIONS.map((title, index) => [itfPositionTitleLabel(title), index])
);

const reportsToPositions: Record<ItfPositionTitle, ItfPositionTitle[]> = {
  Technician: ["ITG Supervisor", "QA Supervisor", "Project Manager", "Regional Manager"],
  "Drop Bury": ["ITG Supervisor", "Project Manager", "Regional Manager"],
  "BP Supervisor": ["BP Lead", "BP Owner", "ITG Supervisor", "Project Manager", "Regional Manager"],
  "BP Lead": ["BP Owner", "ITG Supervisor", "Project Manager", "Regional Manager"],
  "BP Owner": ["ITG Supervisor", "Project Manager", "Regional Manager", "Director"],
  "ITG Supervisor": ["Project Manager", "Regional Manager", "Director"],
  "QA Supervisor": ["Project Manager", "Regional Manager", "Director"],
  "Project Manager": ["Regional Manager", "Director"],
  "Regional Manager": ["Director", "VP"],
  Director: ["Director", "VP"],
  VP: ["VP"],
  Admin: ["Director", "VP"],
  Unknown: ["ITG Supervisor", "Project Manager", "Regional Manager", "Director"],
};

function statusLabel(status: ItfRosterStatus) {
  return status.replaceAll("_", " ");
}

function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function endsActiveDuty(status: ItfRosterStatus) {
  return status === "inactive" || status === "onboarding_closed";
}

export default function ItfRosterWorkspace({
  context,
  initialRows,
  initialOffices,
  initialWorkforceUnits,
  initialRegions,
  relationshipOptions,
}: {
  context: ItfWorkspaceContext;
  initialRows: ItfRosterReviewRow[];
  initialOffices: ItfOfficeOption[];
  initialWorkforceUnits: ItfWorkforceUnitOption[];
  initialRegions: ItfRegionOption[];
  relationshipOptions: ItfRelationshipOption[];
}) {
  const [rows, setRows] = useState<ItfRosterReviewRow[]>(initialRows);
  const [offices, setOffices] = useState<ItfOfficeOption[]>(initialOffices);
  const [workforceUnits, setWorkforceUnits] = useState(initialWorkforceUnits);
  const [regions, setRegions] = useState(initialRegions);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<"all" | ItfWorkforceUnit>("all");
  const [status, setStatus] = useState<"all" | ItfRosterStatus>("active");
  const [seat, setSeat] = useState<"all" | ItfSeatType>("all");
  const [group, setGroup] = useState("all");
  const [affiliation, setAffiliation] = useState("all");
  const [company, setCompany] = useState("all");
  const [relationship, setRelationship] = useState("all");
  const [grouping, setGrouping] = useState<"position" | "team">("position");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItfRosterDraft>(createEmptyItfRosterDraft);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [officeFormOpen, setOfficeFormOpen] = useState(false);
  const [officeDraft, setOfficeDraft] = useState({ officeName: "", address: "", subRegion: "" });
  const [officeSaving, setOfficeSaving] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [structureFormOpen, setStructureFormOpen] = useState(false);
  const [structureSaving, setStructureSaving] = useState(false);
  const [structureError, setStructureError] = useState("");
  const [targetRegionId, setTargetRegionId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [newRegion, setNewRegion] = useState({ name: "", code: "" });
  const [replacementLeader, setReplacementLeader] = useState("");
  const [saveSaving, setSaveSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [placementChoice, setPlacementChoice] = useState<ItfStartedPlacement | null>(null);

  useEffect(() => {
    if (!overlayOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOverlayOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [overlayOpen]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (location !== "all" && row.placement.workforceUnit !== location) return false;
      if (status !== "all" && row.person.status !== status) return false;
      if (seat !== "all" && row.placement.seatType !== seat) return false;
      if (group !== "all" && row.scope.groupName !== group) return false;
      if (affiliation !== "all" && row.scope.affiliationName !== affiliation) return false;
      if (company !== "all" && row.scope.companyName !== company) return false;
      if (relationship !== "all" && row.placement.relationshipName !== relationship) return false;
      if (!query) return true;
      return [
        row.person.fullName,
        row.person.email,
        row.person.phone,
        ...Object.values(row.identifiers),
        row.placement.positionTitle,
        row.placement.reportsTo,
        row.scope.companyName,
        row.scope.affiliationName,
        row.scope.groupName,
        row.scope.officeName,
        row.onboarding?.fuseStatus ?? "",
        row.onboarding?.lastNote ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [affiliation, company, group, location, relationship, rows, search, seat, status]);

  const filterOptions = useMemo(() => ({
    seats: seatOptions.filter((option) =>
      rows.some((row) => row.placement.seatType === option.value)
    ),
    groups: Array.from(new Set(rows.map((row) => row.scope.groupName))).sort(),
    affiliations: Array.from(new Set(rows.map((row) => row.scope.affiliationName))).sort(),
    companies: Array.from(new Set(rows.map((row) => row.scope.companyName))).sort(),
    relationships: Array.from(new Set(rows.map((row) => row.placement.relationshipName))).sort(),
  }), [rows]);

  const tableGroups = useMemo(() => {
    const groups = new Map<string, ItfRosterReviewRow[]>();

    filteredRows.forEach((row) => {
      const groupKey = grouping === "position"
        ? itfPositionTitleLabel(row.placement.positionTitle)
        : row.placement.positionTitle === "Technician"
          ? `Team · ${row.scope.groupName}`
          : `Position · ${itfPositionTitleLabel(row.placement.positionTitle)}`;
      const group = groups.get(groupKey) ?? [];
      group.push(row);
      groups.set(groupKey, group);
    });

    return Array.from(groups.entries())
      .sort(([left], [right]) => grouping === "position"
        ? (positionLabelOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (positionLabelOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        : left.startsWith("Team ·") && !right.startsWith("Team ·")
          ? -1
          : right.startsWith("Team ·") && !left.startsWith("Team ·")
            ? 1
            : left.localeCompare(right))
      .map(([title, groupRows]) => ({
        title,
        rows: groupRows.toSorted(compareItfRosterRowsByTechId),
      }));
  }, [filteredRows, grouping]);

  const selectedWorkforceUnit = useMemo(
    () => workforceUnits.find((unit) => unit.id === draft.placement.locationId),
    [draft.placement.locationId, workforceUnits]
  );

  const availableOffices = useMemo(
    () => offices.filter((office) => office.locationId === draft.placement.locationId),
    [draft.placement.locationId, offices]
  );

  const relationshipGroups = useMemo(() => Array.from(new Map(
    relationshipOptions.map((option) => [
      `${option.ownerCompanyId}:${option.engagementParticipantId || "direct"}`,
      option,
    ])
  ).values()), [relationshipOptions]);

  const selectedRelationshipKey = `${draft.placement.ownerCompanyId}:${draft.placement.engagementParticipantId || "direct"}`;
  const selectedRelationshipOptions = relationshipOptions.filter((option) =>
    `${option.ownerCompanyId}:${option.engagementParticipantId || "direct"}` === selectedRelationshipKey
  );
  const relationshipLocations = Array.from(new Map(
    selectedRelationshipOptions
      .filter((option) => option.locationId)
      .map((option) => [option.engagementLocationId || option.locationId, option])
  ).values());
  const relationshipOffices = selectedRelationshipOptions.filter((option) =>
    (option.engagementLocationId || option.locationId) ===
      (draft.placement.engagementLocationId || draft.placement.locationId)
  );
  const selectedRelationshipOption = selectedRelationshipOptions.find((option) =>
    (option.engagementOfficeId || option.officeId) ===
      (draft.placement.engagementOfficeId || draft.placement.officeId)
  ) ?? selectedRelationshipOptions[0];
  const assignmentPathReady = Boolean(
    selectedRelationshipOption?.canAssign &&
    (!draft.placement.engagementParticipantId || draft.placement.engagementLocationId)
  );
  const locationRailOptions = Array.from(new Map(
    relationshipOptions
      .filter((option) => option.locationId)
      .map((option) => [option.locationCode, option])
  ).values());

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );
  const onboardingCount = rows.filter((row) => row.onboarding && !row.onboarding.hasCurrentAssignment).length;
  const startedPlacementCount = rows.filter((row) => row.onboarding?.requiresPlacement).length;
  const hasOnboardingRows = rows.some((row) => row.onboarding);
  const tableColumnCount = 6 + (status === "all" ? 1 : 0) + (hasOnboardingRows ? 1 : 0);

  const directReports = useMemo(() => {
    if (!selectedRow) return [];
    return rows.filter((row) =>
      row.id !== selectedRow.id && (
        row.reportsToRosterId === selectedRow.id ||
        (!row.reportsToRosterId && row.placement.reportsTo === selectedRow.person.fullName)
      )
    );
  }, [rows, selectedRow]);

  const requiresReassignment = Boolean(
    selectedRow && endsActiveDuty(draft.person.status) && directReports.length
  );

  const reportsToOptions = useMemo(() => {
    const allowedPositions = reportsToPositions[draft.placement.positionTitle];
    const currentValue = draft.placement.reportsTo;
    const candidates = rows.filter((row) =>
      row.id !== selectedId &&
      row.person.status === "active" &&
      allowedPositions.includes(row.placement.positionTitle) &&
      (row.placement.workforceUnit === draft.placement.workforceUnit ||
        row.placement.workforceUnit === "company")
    );

    if (currentValue && !candidates.some((row) => row.person.fullName === currentValue)) {
      const currentLeader = rows.find((row) => row.person.fullName === currentValue);
      if (currentLeader) candidates.push(currentLeader);
    }

    return candidates.toSorted((left, right) => {
      const leftLocal = left.placement.workforceUnit === draft.placement.workforceUnit ? 0 : 1;
      const rightLocal = right.placement.workforceUnit === draft.placement.workforceUnit ? 0 : 1;
      return leftLocal - rightLocal || left.person.fullName.localeCompare(right.person.fullName);
    });
  }, [draft.placement.positionTitle, draft.placement.reportsTo, draft.placement.workforceUnit, rows, selectedId]);

  const replacementOptions = useMemo(() => {
    if (!selectedRow) return [];
    const selectedRank = positionOrder.get(selectedRow.placement.positionTitle) ?? Number.MAX_SAFE_INTEGER;
    return rows.filter((row) => {
      if (row.id === selectedRow.id || row.person.status !== "active") return false;
      if (row.placement.seatType !== "LEADERSHIP" && row.placement.seatType !== "SUPPORT") return false;
      const candidateRank = positionOrder.get(row.placement.positionTitle) ?? Number.MAX_SAFE_INTEGER;
      const isSameOrHigherResponsibility = candidateRank >= selectedRank;
      const isLocalOrCompanyWide = row.placement.workforceUnit === selectedRow.placement.workforceUnit ||
        row.placement.workforceUnit === "company";
      return isSameOrHigherResponsibility && isLocalOrCompanyWide;
    }).toSorted((left, right) => left.person.fullName.localeCompare(right.person.fullName));
  }, [rows, selectedRow]);

  const divisionOptions = useMemo(() => Array.from(new Map(
    workforceUnits.filter((unit) => unit.divisionId).map((unit) => [unit.divisionId, {
      id: unit.divisionId,
      name: unit.divisionName,
      code: unit.divisionCode,
    }])
  ).values()), [workforceUnits]);

  const selectedDivisionId = selectedWorkforceUnit?.divisionId ?? divisionOptions[0]?.id ?? "";
  const availableRegions = regions.filter((region) => region.divisionId === selectedDivisionId);

  function openCreate() {
    const firstOption = relationshipGroups[0];
    const nextDraft = createEmptyItfRosterDraft();
    if (firstOption) {
      Object.assign(nextDraft.placement, {
        ownerCompanyId: firstOption.ownerCompanyId,
        affiliationType: firstOption.affiliationType,
        engagementParticipantId: firstOption.engagementParticipantId,
        relationshipId: firstOption.relationshipId,
        relationshipName: firstOption.relationshipLabel,
        relationshipStatus: firstOption.relationshipStatus,
        engagementLocationId: firstOption.engagementLocationId,
        engagementOfficeId: firstOption.engagementOfficeId,
        locationId: firstOption.locationId,
        workforceUnit: firstOption.locationCode,
        officeId: firstOption.officeId,
      });
    }
    setSelectedId(null);
    setDraft(nextDraft);
    setOfficeFormOpen(false);
    setOfficeError("");
    setStructureFormOpen(false);
    setStructureError("");
    setReplacementLeader("");
    setSaveError("");
    setCopyStatus("idle");
    setPlacementChoice(null);
    setOverlayOpen(true);
  }

  function openEdit(row: ItfRosterReviewRow) {
    setSelectedId(row.id);
    const nextDraft = copyItfRosterDraft(row);
    const matchingOption = relationshipOptions.find((option) =>
      option.ownerCompanyId === row.placement.ownerCompanyId &&
      option.engagementParticipantId === row.placement.engagementParticipantId &&
      option.locationId === row.placement.locationId &&
      (!row.placement.officeId || option.officeId === row.placement.officeId)
    );
    if (matchingOption) {
      nextDraft.placement.engagementLocationId = matchingOption.engagementLocationId;
      nextDraft.placement.engagementOfficeId = matchingOption.engagementOfficeId;
      nextDraft.placement.relationshipStatus = matchingOption.relationshipStatus;
    }
    setDraft(nextDraft);
    setOfficeFormOpen(false);
    setOfficeError("");
    setStructureFormOpen(false);
    setStructureError("");
    setReplacementLeader("");
    setSaveError("");
    setCopyStatus("idle");
    setPlacementChoice(null);
    setOverlayOpen(true);
  }

  async function copyRosterRecord() {
    if (!selectedRow) return;

    try {
      await navigator.clipboard.writeText(
        buildItfRosterCopyText(draft, itfAffiliationLabel(selectedRow.scope.affiliationName))
      );
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  async function saveReviewRow() {
    const command = buildItfRosterCommandPayload(draft);
    if (!command.person.full_name) return;
    if (requiresReassignment && !replacementLeader) return;
    const isUnplacedOnboarding = Boolean(selectedRow?.onboarding && !selectedRow.onboarding.hasCurrentAssignment);
    setSaveError("");
    setSaveSaving(true);

    try {
      const replacementRow = rows.find((row) => row.person.fullName === replacementLeader);
      const reportsToRow = rows.find((row) => row.person.fullName === draft.placement.reportsTo);
      const response = await fetch(`/api/insight/telecom-fulfillment/${context.company_slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: isUnplacedOnboarding
            ? placementChoice ? "place-started-onboarding" : "update-onboarding-identity"
            : "save-roster-member",
          rosterId: selectedId ?? undefined,
          candidateId: selectedRow?.onboarding?.candidateId,
          placement: placementChoice ?? undefined,
          command,
          reportsToRosterId: reportsToRow?.id,
          replacementRosterId: requiresReassignment ? replacementRow?.id : undefined,
        }),
      });
      const result = await response.json() as { error?: string; result?: { roster_id?: string } };
      if (!response.ok) throw new Error(result.error || "Unable to save roster member.");

      if (selectedId) {
        const formerLeaderName = selectedRow?.person.fullName ?? "";
        setRows((current) => current.map((row) => {
          if (row.id === selectedId) {
            return {
              ...copyItfRosterDraft(draft),
              id: row.id,
              reportsToRosterId: reportsToRow?.id ?? "",
              source: row.source,
              onboarding: row.onboarding ? {
                ...row.onboarding,
                hasCurrentAssignment: placementChoice ? true : row.onboarding.hasCurrentAssignment,
                requiresPlacement: placementChoice ? false : row.onboarding.requiresPlacement,
              } : undefined,
              scope: {
                ...row.scope,
                groupName: draft.placement.reportsTo || "Unassigned",
                affiliationName: draft.placement.affiliationType,
                officeName: selectedRelationshipOption?.officeName ?? "Unassigned",
                divisionName: selectedRelationshipOption?.divisionName ?? "Unassigned",
                regionName: selectedRelationshipOption?.regionName ?? "Unassigned",
              },
            };
          }
          if (requiresReassignment && (
            row.reportsToRosterId === selectedId ||
            (!row.reportsToRosterId && row.placement.reportsTo === formerLeaderName)
          )) {
            return {
              ...row,
              reportsToRosterId: replacementRow?.id ?? "",
              placement: { ...row.placement, reportsTo: replacementLeader },
              scope: { ...row.scope, groupName: replacementLeader },
            };
          }
          return row;
        }));
      } else {
        const reportsToRow = rows.find((row) => row.person.fullName === draft.placement.reportsTo);
        setRows((current) => [
          ...current,
          {
            ...copyItfRosterDraft(draft),
            id: result.result?.roster_id ?? crypto.randomUUID(),
            reportsToRosterId: reportsToRow?.id ?? "",
            source: "ITG added",
            scope: {
              companyName: selectedRelationshipOption?.ownerCompanyName ?? context.company_name,
              affiliationName: draft.placement.affiliationType,
              groupName: draft.placement.reportsTo || "Unassigned",
              officeName: selectedRelationshipOption?.officeName ?? "Unassigned",
              divisionName: selectedRelationshipOption?.divisionName ?? "Unassigned",
              regionName: selectedRelationshipOption?.regionName ?? "Unassigned",
            },
          },
        ]);
      }
      setOverlayOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save roster member.");
    } finally {
      setSaveSaving(false);
    }
  }

  function chooseStartedPlacement(choice: ItfStartedPlacement) {
    setPlacementChoice(choice);
    setDraft((current) => applyItfStartedPlacement(current, choice));
    setSaveError("");
  }

  function updatePerson<Key extends keyof ItfRosterDraft["person"]>(
    key: Key,
    value: ItfRosterDraft["person"][Key]
  ) {
    setDraft((current) => ({
      ...current,
      person: { ...current.person, [key]: value },
    }));
  }

  function updateIdentifier(type: ItfRosterIdentifierType, value: string) {
    setDraft((current) => ({
      ...current,
      identifiers: { ...current.identifiers, [type]: value },
    }));
  }

  function updatePlacement<Key extends keyof ItfRosterDraft["placement"]>(
    key: Key,
    value: ItfRosterDraft["placement"][Key]
  ) {
    setDraft((current) => ({
      ...current,
      placement: { ...current.placement, [key]: value },
    }));
  }

  function updateWorkforceUnit(locationId: string) {
    const unit = workforceUnits.find((item) => item.id === locationId);
    setDraft((current) => ({
      ...current,
      placement: {
        ...current.placement,
        locationId: unit?.id ?? "",
        workforceUnit: unit?.locationCode ?? "company",
        officeId: "",
      },
    }));
    setOfficeFormOpen(false);
    setOfficeError("");
  }

  function updateRelationshipPath(pathKey: string) {
    const option = relationshipGroups.find((item) =>
      `${item.ownerCompanyId}:${item.engagementParticipantId || "direct"}` === pathKey
    );
    if (!option) return;
    setDraft((current) => ({
      ...current,
      placement: {
        ...current.placement,
        ownerCompanyId: option.ownerCompanyId,
        affiliationType: option.affiliationType,
        engagementParticipantId: option.engagementParticipantId,
        relationshipId: option.relationshipId,
        relationshipName: option.relationshipLabel,
        relationshipStatus: option.relationshipStatus,
        engagementLocationId: option.engagementParticipantId ? "" : option.engagementLocationId,
        engagementOfficeId: option.engagementParticipantId ? "" : option.engagementOfficeId,
        locationId: option.engagementParticipantId ? "" : option.locationId,
        workforceUnit: option.engagementParticipantId ? "company" : option.locationCode,
        officeId: option.engagementParticipantId ? "" : option.officeId,
        reportsTo: "",
      },
    }));
  }

  function updateRelationshipLocation(pathId: string) {
    const option = relationshipLocations.find((item) =>
      (item.engagementLocationId || item.locationId) === pathId
    );
    if (!option) return;
    setDraft((current) => ({
      ...current,
      placement: {
        ...current.placement,
        engagementLocationId: option.engagementLocationId,
        engagementOfficeId: "",
        locationId: option.locationId,
        workforceUnit: option.locationCode,
        officeId: "",
        reportsTo: "",
      },
    }));
  }

  function updateRelationshipOffice(pathId: string) {
    const option = relationshipOffices.find((item) =>
      (item.engagementOfficeId || item.officeId) === pathId
    );
    if (!option) return;
    setDraft((current) => ({
      ...current,
      placement: {
        ...current.placement,
        engagementOfficeId: option.engagementOfficeId,
        officeId: option.officeId,
      },
    }));
  }

  async function createRegion() {
    if (!selectedDivisionId || !newRegion.name.trim() || !newRegion.code.trim()) return;
    setStructureSaving(true);
    setStructureError("");
    try {
      const response = await fetch(`/api/insight/telecom-fulfillment/${context.company_slug}/regions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-region",
          divisionId: selectedDivisionId,
          regionName: newRegion.name,
          regionCode: newRegion.code,
        }),
      });
      const result = await response.json() as { region?: ItfRegionOption; error?: string };
      if (!response.ok || !result.region) throw new Error(result.error || "Unable to add region.");
      setRegions((current) => [...current.filter((region) => region.id !== result.region?.id), result.region as ItfRegionOption]
        .toSorted((left, right) => left.regionName.localeCompare(right.regionName)));
      setTargetRegionId(result.region.id);
      setNewRegion({ name: "", code: "" });
    } catch (error) {
      setStructureError(error instanceof Error ? error.message : "Unable to add region.");
    } finally {
      setStructureSaving(false);
    }
  }

  async function assignLocationRegion() {
    if (!selectedWorkforceUnit || !targetRegionId || !effectiveFrom) return;
    setStructureSaving(true);
    setStructureError("");
    try {
      const response = await fetch(`/api/insight/telecom-fulfillment/${context.company_slug}/regions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "assign-location",
          locationId: selectedWorkforceUnit.id,
          regionId: targetRegionId,
          effectiveFrom,
        }),
      });
      const result = await response.json() as { workforceUnit?: ItfWorkforceUnitOption; error?: string };
      if (!response.ok || !result.workforceUnit) throw new Error(result.error || "Unable to assign region.");

      const today = new Date().toISOString().slice(0, 10);
      if (effectiveFrom <= today) {
        setWorkforceUnits((current) => current.map((unit) =>
          unit.id === result.workforceUnit?.id ? result.workforceUnit as ItfWorkforceUnitOption : unit
        ));
        setRows((current) => current.map((row) => row.placement.locationId === result.workforceUnit?.id
          ? { ...row, scope: {
            ...row.scope,
            divisionName: result.workforceUnit?.divisionName ?? row.scope.divisionName,
            regionName: result.workforceUnit?.regionName ?? row.scope.regionName,
          } }
          : row));
      }
      setStructureFormOpen(false);
    } catch (error) {
      setStructureError(error instanceof Error ? error.message : "Unable to assign region.");
    } finally {
      setStructureSaving(false);
    }
  }

  async function createOffice() {
    if (draft.placement.workforceUnit === "company" || !officeDraft.officeName.trim()) return;
    setOfficeSaving(true);
    setOfficeError("");

    try {
      const response = await fetch(`/api/insight/telecom-fulfillment/${context.company_slug}/offices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationCode: draft.placement.workforceUnit,
          officeName: officeDraft.officeName,
          address: officeDraft.address,
          subRegion: officeDraft.subRegion,
        }),
      });
      const result = await response.json() as { office?: ItfOfficeOption; error?: string };
      if (!response.ok || !result.office) throw new Error(result.error || "Unable to add office.");

      setOffices((current) => [
        ...current.filter((office) => office.id !== result.office?.id),
        result.office as ItfOfficeOption,
      ].toSorted((left, right) =>
        left.workforceUnit.localeCompare(right.workforceUnit) ||
        left.officeName.localeCompare(right.officeName)
      ));
      updatePlacement("officeId", result.office.id);
      setOfficeDraft({ officeName: "", address: "", subRegion: "" });
      setOfficeFormOpen(false);
    } catch (error) {
      setOfficeError(error instanceof Error ? error.message : "Unable to add office.");
    } finally {
      setOfficeSaving(false);
    }
  }

  return (
    <ItfWorkspaceSurface title="Roster" description="Company roster identity and ITF workforce-unit assignment.">
      <section className={styles.reviewNotice} aria-label="Commercial company roster">
        <span className={styles.reviewDot} aria-hidden="true" />
        <strong>Company roster</strong>
        <span>Live commercial records · donor lineage retained · saved changes are audited</span>
        {onboardingCount ? <span>{onboardingCount} onboarding · {startedPlacementCount} Started awaiting placement</span> : null}
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.toolbar}>
          <label className={styles.searchControl}>
            <span>Search roster</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Tech ID, FUSE ID, login" />
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding ({rows.filter((row) => row.person.status === "onboarding").length})</option>
              <option value="inactive">Inactive</option>
              <option value="onboarding_closed">Onboarding closed</option>
            </select>
          </label>
          <label>
            <span>Seat</span>
            <select value={seat} onChange={(event) => setSeat(event.target.value as typeof seat)}>
              <option value="all">All seats</option>
              {filterOptions.seats.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Group</span>
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="all">All groups</option>
              {filterOptions.groups.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Affiliation</span>
            <select value={affiliation} onChange={(event) => setAffiliation(event.target.value)}>
              <option value="all">All affiliations</option>
              {filterOptions.affiliations.map((option) => <option key={option} value={option}>{itfAffiliationLabel(option)}</option>)}
            </select>
          </label>
          <label>
            <span>Company</span>
            <select value={company} onChange={(event) => setCompany(event.target.value)}>
              <option value="all">All companies</option>
              {filterOptions.companies.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Relationship</span>
            <select value={relationship} onChange={(event) => setRelationship(event.target.value)}>
              <option value="all">All relationships</option>
              {filterOptions.relationships.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className={styles.toolbarStatus}>{filteredRows.length} visible · {rows.length} roster total</div>
          {context.can_manage ? <button className="button primary" type="button" onClick={openCreate}>Add roster member</button> : null}
        </div>

        <div className={styles.locationRail} aria-label="Active workforce units">
          <button className={location === "all" ? styles.locationActive : ""} type="button" onClick={() => setLocation("all")}>All workforce</button>
          <button className={location === "company" ? styles.locationActive : ""} type="button" onClick={() => setLocation("company")}>Company leadership</button>
          {locationRailOptions.map((unit) => (
            <button
              key={unit.locationCode}
              className={location === unit.locationCode ? styles.locationActive : ""}
              type="button"
              onClick={() => setLocation(unit.locationCode)}
            >
              {unit.locationCode} · {unit.regionName}
            </button>
          ))}
        </div>

        <div className={styles.groupingRail} aria-label="Roster grouping">
          <span>Group by</span>
          <button className={grouping === "position" ? styles.groupingActive : ""} type="button" onClick={() => setGrouping("position")}>Position</button>
          <button className={grouping === "team" ? styles.groupingActive : ""} type="button" onClick={() => setGrouping("team")}>Team</button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>{status === "all" ? <th>Status</th> : null}<th>Tech ID / worker</th><th>Company</th><th>Location</th><th>Office</th><th>Seat</th><th>Reports to</th>{hasOnboardingRows ? <th>Onboarding</th> : null}</tr>
            </thead>
            {tableGroups.length ? tableGroups.map((group) => (
              <tbody key={group.title}>
                <tr className={styles.positionGroupRow}>
                  <th colSpan={tableColumnCount}><span>{group.title}</span><span>{group.rows.length}</span></th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openEdit(row); }}>
                    {status === "all" ? <td><span className={`${styles.status} ${styles[`status_${row.person.status}`]}`}>{statusLabel(row.person.status)}</span></td> : null}
                    <td className={styles.techIdentity}>
                      {["LEADERSHIP", "SUPPORT"].includes(row.placement.seatType) ? (
                        <strong>{row.person.fullName}</strong>
                      ) : row.identifiers.tech_id ? (
                        <><strong>{row.identifiers.tech_id}</strong><span>{row.person.fullName}</span></>
                      ) : (
                        <><strong>{row.person.fullName}</strong><span>Tech ID not assigned</span></>
                      )}
                    </td>
                    <td>{row.scope.companyName}</td>
                    <td>{row.placement.workforceUnit === "company" ? "Company wide" : row.placement.workforceUnit}</td>
                    <td>{row.scope.officeName}</td>
                    <td>{seatOptions.find((item) => item.value === row.placement.seatType)?.label}</td>
                    <td>{row.placement.reportsTo || "Unassigned"}</td>
                    {hasOnboardingRows ? <td>{row.onboarding ? <span className={`${styles.lifecycle} ${row.onboarding.requiresPlacement ? styles.lifecycleAction : ""}`}>{row.onboarding.requiresPlacement ? "Started · place" : row.onboarding.fuseStatus}</span> : "—"}</td> : null}
                  </tr>
                ))}
              </tbody>
            )) : (
              <tbody><tr><td colSpan={tableColumnCount} className={styles.emptyState}><strong>No roster members in this view.</strong><span>Change the filters or add a roster member using the single-overlay workflow.</span></td></tr></tbody>
            )}
          </table>
        </div>
      </section>

      {overlayOpen ? (
        <div className={styles.overlayBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOverlayOpen(false); }}>
          <section className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="itf-roster-overlay-title">
            <header className={styles.overlayHeader}>
              <div><span>{context.company_name} roster</span><h2 id="itf-roster-overlay-title">{selectedId ? draft.person.fullName : "Add roster member"}</h2></div>
              <button type="button" onClick={() => setOverlayOpen(false)} aria-label="Close roster overlay">×</button>
            </header>

            <div className={styles.overlayBody}>
              {selectedRow?.onboarding ? (
                <section className={styles.formSection}>
                  <header><strong>FUSE onboarding</strong><span>Onboarding lifecycle only</span></header>
                  <div className={styles.lifecyclePanel}>
                    <div><span>Status</span><strong>{selectedRow.onboarding.fuseStatus}</strong></div>
                    <div><span>Loaded</span><strong>{displayDate(selectedRow.onboarding.processingStartDate)}</strong></div>
                    <div><span>Status updated</span><strong>{displayDate(selectedRow.onboarding.statusUpdateAt)}</strong></div>
                    <div className={styles.lifecycleNote}><span>Latest note</span><strong>{selectedRow.onboarding.lastNote || "No note supplied"}</strong></div>
                    {selectedRow.onboarding.requiresPlacement ? (
                      <div className={styles.placementDecision}>
                        <div>
                          <strong>Started — choose the roster placement</strong>
                          <span>FUSE has completed its handoff. Choose where this person belongs in the operating roster, or defer without changing anything.</span>
                        </div>
                        <div>
                          <button className={placementChoice === "training" ? styles.placementActive : ""} type="button" onClick={() => chooseStartedPlacement("training")}>Active training</button>
                          <button className={placementChoice === "field" ? styles.placementActive : ""} type="button" onClick={() => chooseStartedPlacement("field")}>Active field</button>
                          <button className={placementChoice === "travel" ? styles.placementActive : ""} type="button" onClick={() => chooseStartedPlacement("travel")}>Active travel tech</button>
                          <button type="button" onClick={() => setOverlayOpen(false)}>Defer</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className={styles.formSection}>
                <header><strong>Person</strong><span>Platform roster record</span></header>
                <div className={styles.formGrid}>
                  <label className={styles.fullField}><span>Full name</span><input autoFocus value={draft.person.fullName} onChange={(event) => updatePerson("fullName", event.target.value)} /></label>
                  <label><span>Email</span><input type="email" value={draft.person.email} onChange={(event) => updatePerson("email", event.target.value)} /></label>
                  <label><span>Phone</span><input type="tel" value={draft.person.phone} onChange={(event) => updatePerson("phone", event.target.value)} /></label>
                  <label><span>Roster status</span><select value={draft.person.status} onChange={(event) => updatePerson("status", event.target.value as ItfRosterStatus)}><option value="active" disabled={Boolean(selectedRow?.onboarding && !selectedRow.onboarding.hasCurrentAssignment)}>Active</option><option value="onboarding">Onboarding</option><option value="inactive">Inactive locally</option><option value="onboarding_closed">Onboarding closed</option></select></label>
                  {requiresReassignment ? (
                    <label className={styles.fullField}>
                      <span>New leader for {directReports.length} direct reports</span>
                      <select autoFocus value={replacementLeader} onChange={(event) => setReplacementLeader(event.target.value)}>
                        <option value="">Choose the new leader</option>
                        {replacementOptions.map((leader) => <option key={leader.id} value={leader.person.fullName}>{leader.person.fullName} · {itfPositionTitleLabel(leader.placement.positionTitle)}</option>)}
                      </select>
                      <small className={styles.fieldHint}>Saving makes the old leader inactive and moves the full team in one bulk change.</small>
                    </label>
                  ) : null}
                </div>
              </section>

              <section className={styles.formSection}>
                <header><strong>Telecom identifiers</strong><span>Attached to this platform roster record</span></header>
                <div className={styles.formGrid}>
                  {ITF_ROSTER_IDENTIFIER_FIELDS.map((field) => (
                    <label key={field.type}>
                      <span>{field.label}</span>
                      <input
                        aria-describedby={`itf-identifier-${field.type}`}
                        value={draft.identifiers[field.type]}
                        onChange={(event) => updateIdentifier(field.type, event.target.value)}
                      />
                      <small id={`itf-identifier-${field.type}`} className={styles.fieldHint}>{field.hint}</small>
                    </label>
                  ))}
                </div>
              </section>

              <section className={styles.formSection}>
                <header><strong>Workforce assignment</strong><span>Company → affiliation → relationship → location</span></header>
                <div className={styles.formGrid}>
                  <label>
                    <span>Company</span>
                    <input value={selectedRelationshipOption?.ownerCompanyName ?? context.company_name} readOnly />
                  </label>
                  <label>
                    <span>Affiliation</span>
                    <input value={itfAffiliationTypeLabel(draft.placement.affiliationType)} readOnly />
                    <small className={styles.fieldHint}>Operational scope only; each company retains responsibility for its workforce records and agreements.</small>
                  </label>
                  <label className={styles.fullField}>
                    <span>Relationship</span>
                    <select value={selectedRelationshipKey} onChange={(event) => updateRelationshipPath(event.target.value)}>
                      {relationshipGroups.map((option) => {
                        const key = `${option.ownerCompanyId}:${option.engagementParticipantId || "direct"}`;
                        return <option key={key} value={key}>{option.relationshipLabel}{option.relationshipStatus !== "active" ? ` · ${option.relationshipStatus}` : ""}</option>;
                      })}
                    </select>
                  </label>
                  <label>
                    <span>Location</span>
                    <select value={draft.placement.engagementLocationId || draft.placement.locationId} onChange={(event) => updateRelationshipLocation(event.target.value)}>
                      <option value="">Company wide</option>
                      {relationshipLocations.map((option) => {
                        const key = option.engagementLocationId || option.locationId;
                        return <option key={key} value={key}>{option.locationCode} · {option.regionName}</option>;
                      })}
                    </select>
                  </label>
                  <label className={styles.fullField}>
                    <span>Office</span>
                    <div className={styles.officeControl}>
                      <select disabled={!draft.placement.locationId} value={draft.placement.engagementOfficeId || draft.placement.officeId} onChange={(event) => updateRelationshipOffice(event.target.value)}>
                        <option value="">{!draft.placement.locationId ? "Not used for company-wide leadership" : "Select office"}</option>
                        {relationshipOffices.filter((office) => office.officeId).map((office) => {
                          const key = office.engagementOfficeId || office.officeId;
                          return <option key={key} value={key}>{office.officeName}</option>;
                        })}
                      </select>
                      {context.can_manage && draft.placement.locationId && !draft.placement.engagementParticipantId ? <button className="button" type="button" onClick={() => { setOfficeFormOpen((current) => !current); setOfficeError(""); }}>Add office</button> : null}
                      {context.can_manage && draft.placement.locationId && !draft.placement.engagementParticipantId ? <button className="button" type="button" onClick={() => { setStructureFormOpen((current) => !current); setStructureError(""); setTargetRegionId(selectedWorkforceUnit?.regionId ?? ""); }}>Manage region</button> : null}
                    </div>
                  </label>
                  {officeFormOpen ? (
                    <div className={`${styles.officeForm} ${styles.fullField}`}>
                      <label><span>Office name</span><input value={officeDraft.officeName} onChange={(event) => setOfficeDraft((current) => ({ ...current, officeName: event.target.value }))} /></label>
                      <label><span>Address</span><input value={officeDraft.address} onChange={(event) => setOfficeDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                      <label><span>Sub-region</span><input value={officeDraft.subRegion} onChange={(event) => setOfficeDraft((current) => ({ ...current, subRegion: event.target.value }))} /></label>
                      <div className={styles.officeActions}>
                        {officeError ? <span role="alert">{officeError}</span> : <span>Saved beneath {draft.placement.workforceUnit} only.</span>}
                        <button className="button primary" type="button" disabled={officeSaving || !officeDraft.officeName.trim()} onClick={createOffice}>{officeSaving ? "Adding…" : "Add and select"}</button>
                      </div>
                    </div>
                  ) : null}
                  {structureFormOpen && selectedWorkforceUnit ? (
                    <div className={`${styles.structureForm} ${styles.fullField}`}>
                      <div className={styles.structureSummary}>
                        <strong>{selectedWorkforceUnit.locationCode}</strong>
                        <span>{selectedWorkforceUnit.divisionName} division · currently {selectedWorkforceUnit.regionName} region</span>
                      </div>
                      <label><span>Assign to region</span><select value={targetRegionId} onChange={(event) => setTargetRegionId(event.target.value)}><option value="">Select region</option>{availableRegions.map((region) => <option key={region.id} value={region.id}>{region.regionName} · {region.regionCode}</option>)}</select></label>
                      <label><span>Effective date</span><input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
                      <button className="button primary" type="button" disabled={structureSaving || !targetRegionId || !effectiveFrom} onClick={assignLocationRegion}>Assign location</button>
                      <div className={styles.newRegionRow}>
                        <label><span>New region name</span><input value={newRegion.name} onChange={(event) => setNewRegion((current) => ({ ...current, name: event.target.value }))} placeholder="Enter the approved name" /></label>
                        <label><span>Region code</span><input value={newRegion.code} onChange={(event) => setNewRegion((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></label>
                        <button className="button" type="button" disabled={structureSaving || !newRegion.name.trim() || !newRegion.code.trim()} onClick={createRegion}>Add region</button>
                      </div>
                      {structureError ? <span className={styles.formError} role="alert">{structureError}</span> : <small>Region changes move the location as a unit; they do not rewrite the durable location code.</small>}
                    </div>
                  ) : null}
                  <label><span>Position title</span><select value={draft.placement.positionTitle} onChange={(event) => updatePlacement("positionTitle", event.target.value as ItfPositionTitle)}>{ITF_POSITION_TITLE_OPTIONS.map((title) => <option key={title} value={title}>{itfPositionTitleLabel(title)}</option>)}</select></label>
                  <label><span>Seat</span><select value={draft.placement.seatType} onChange={(event) => updatePlacement("seatType", event.target.value as ItfSeatType)}>{seatOptions.map((seat) => <option key={seat.value} value={seat.value} disabled={seat.value === "UNASSIGNED"}>{seat.label}</option>)}</select></label>
                  <label><span>Effective date</span><input type="date" value={draft.placement.effectiveFrom} onChange={(event) => updatePlacement("effectiveFrom", event.target.value)} /></label>
                  <label className={styles.fullField}>
                    <span>Reports to</span>
                    <select value={draft.placement.reportsTo} onChange={(event) => updatePlacement("reportsTo", event.target.value)}>
                      <option value="">Unassigned</option>
                      {reportsToOptions.map((leader) => <option key={leader.id} value={leader.person.fullName}>{leader.person.fullName} · {itfPositionTitleLabel(leader.placement.positionTitle)}{leader.placement.workforceUnit === "company" ? " · company" : ` · ${leader.placement.workforceUnit}`}</option>)}
                    </select>
                    <small className={styles.fieldHint}>Choices are limited by company, responsibility level, and location scope.</small>
                  </label>
                  {!selectedRelationshipOption?.canAssign ? (
                    <div className={`${styles.responsibilityCard} ${styles.fullField}`}>
                      <strong>Relationship in review</strong>
                      <span>The company, relationship, and ITG locations are ready to inspect. Workforce assignment remains locked until the relationship is accepted and activated.</span>
                    </div>
                  ) : null}
                </div>
              </section>

              {!["Technician", "Drop Bury", "Unknown"].includes(draft.placement.positionTitle) ? (
                <section className={styles.formSection}>
                  <header><strong>Service provider oversight</strong><span>ITG company responsibility</span></header>
                  <div className={styles.responsibilityCard}>
                    <strong>Company contact</strong>
                    <span>No Service Provider responsibility rows assigned.</span>
                    <small>Connected service provider companies will be assigned here without changing ownership of their rosters.</small>
                  </div>
                </section>
              ) : null}
            </div>

            <footer className={styles.overlayFooter}>
              <span className={saveError ? styles.saveError : ""}>{saveError || (selectedRow?.onboarding && !selectedRow.onboarding.hasCurrentAssignment && !placementChoice ? "Save roster details without changing the FUSE lifecycle. Placement remains deferred." : !selectedRelationshipOption?.canAssign ? "Relationship in review · assignment saving is locked." : !assignmentPathReady ? "Choose the relationship location before saving." : placementChoice ? `Confirm ${placementChoice === "training" ? "Training" : "Active Field"} placement.` : "One save updates identity and opens the effective workforce assignment.")}</span>
              <div>
                {selectedId ? (
                  <button className="button" type="button" onClick={copyRosterRecord}>
                    {copyStatus === "copied" ? "Record copied" : copyStatus === "failed" ? "Copy failed" : "Copy record"}
                  </button>
                ) : null}
                <button className="button" type="button" onClick={() => setOverlayOpen(false)}>Cancel</button>
                <button className="button primary" type="button" disabled={saveSaving || !(selectedRow?.onboarding && !selectedRow.onboarding.hasCurrentAssignment && !placementChoice) && !assignmentPathReady || !draft.person.fullName.trim() || (requiresReassignment && !replacementLeader)} onClick={saveReviewRow}>{saveSaving ? "Saving…" : placementChoice === "training" ? "Place in Training" : placementChoice === "field" ? "Place Active Field" : requiresReassignment ? "Save and reassign" : selectedId ? "Save roster member" : "Create roster member"}</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </ItfWorkspaceSurface>
  );
}
