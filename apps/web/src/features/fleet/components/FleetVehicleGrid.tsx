import type { FleetVehicleRow } from "../fleet.types";
import FleetVehicleCreateForm from "./FleetVehicleCreateForm";

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function vehicleDescription(row: FleetVehicleRow) {
  return [row.year, row.make, row.model].filter(Boolean).join(" ") || label(row.vehicle_type);
}

export default function FleetVehicleGrid({ rows, companySlug }: { rows: FleetVehicleRow[]; companySlug: string }) {
  return (
    <article className="app-card" style={{ padding: 14, overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <p className="value-card__eyebrow">Fleet inventory</p>
          <h2 className="app-card__title" style={{ fontSize: 18 }}>Vehicles</h2>
        </div>
        <FleetVehicleCreateForm companySlug={companySlug} />
      </div>

      {rows.length === 0 ? (
        <p className="app-card__body" style={{ marginTop: 18 }}>No vehicles have been loaded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
              {['Unit #','Status','Class','Vehicle','Route','Driver','Odometer','Inspection','Defects','Work'].map((heading) => (
                <th key={heading} style={{ padding: "10px 8px", fontSize: 12 }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.vehicle_id} style={{ borderBottom: "1px solid #eef2f7" }}>
                <td style={{ padding: "12px 8px" }}><strong>{row.unit_number}</strong></td>
                <td style={{ padding: "12px 8px" }}>{label(row.status)}</td>
                <td style={{ padding: "12px 8px" }}>{row.vehicle_class_key ?? "—"}</td>
                <td style={{ padding: "12px 8px" }}>{vehicleDescription(row)}</td>
                <td style={{ padding: "12px 8px" }}>{row.primary_route ?? "—"}</td>
                <td style={{ padding: "12px 8px" }}>{row.primary_driver_name ?? "—"}</td>
                <td style={{ padding: "12px 8px" }}>{row.odometer_miles?.toLocaleString() ?? "—"}</td>
                <td style={{ padding: "12px 8px" }}>{row.last_inspected_at ? new Date(row.last_inspected_at).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "12px 8px" }}>{row.open_defect_count}</td>
                <td style={{ padding: "12px 8px" }}>{row.open_work_order_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
