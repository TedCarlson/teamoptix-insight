import type { DispatchRoute } from "../lib/dispatchSupport";
import {
  eyebrow,
  panel,
  panelHeader,
} from "../lib/dispatchSupport";
import { AssignmentRailSection, Stat } from "./DispatchRails";

type DispatchSummary = {
  total: number;
  withDriver: number;
  withoutDriver: number;
  helpers: number;
  trainees: number;
  available: number;
};

type DispatchRightRailProps = {
  summary: DispatchSummary;
  dispatchRoutes: DispatchRoute[];
};

export function DispatchRightRail(props: DispatchRightRailProps) {
  const { summary, dispatchRoutes } = props;

  return (
    <aside style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Actions</p>
          <strong>Quick scan</strong>
        </div>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <Stat label="Routes" value={summary.total} />
        <Stat label="Covered" value={summary.withDriver} />
        <Stat
          label="Needs Driver"
          value={summary.withoutDriver}
          warn={summary.withoutDriver > 0}
        />

        {summary.trainees > 0 ? (
          <AssignmentRailSection
            title="Trainees"
            emptyText="No trainees assigned"
            routes={dispatchRoutes}
            seat="trainee"
          />
        ) : null}

        <div
          style={{
            marginTop: 6,
            border: "1px solid #e6edf5",
            borderRadius: 12,
            padding: 10,
            color: "#64748b",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          This is still draft-only. Seat changes are local UI state until the
          session/event layer is added.
        </div>
      </div>
    </aside>
  );
}
