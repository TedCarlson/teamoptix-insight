// FILE: app/region/[region]/page.tsx

import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import ComingSoon from "../../_components/ComingSoon";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

type RegionTechsApi =
  | {
      ok: true;
      region_name: string;
      latest_batch: {
        batch_id: string;
        upload_set_id: string;
        source_system: string;
        fiscal_month_anchor: string;
        status: string;
        created_at: string;
      };
      pin:
        | {
            batch_id: string;
            fiscal_month_anchor: string;
            rubric_version_id: number;
            settings_pinned_at: string;
            pinned_at: string;
          }
        | null;
      techs: Array<{ tech_id: string; tech_name: string | null; supervisor: string | null }>;
      counts: { raw_rows_in_region: number; techs: number };
    }
  | { ok: false; error: string };

type RosterRow = {
  tech_id: string | null;
  full_name: string | null;
  status: string | null;
  itg_supervisor: string | null;
  supervisor: string | null;
  company: string | null;
  c_code: string | null;
};

function s(v: any) {
  return String(v ?? "").trim();
}

export default async function Page({
  params,
}: {
  params: { region: string } | Promise<{ region: string }>;
}) {
  const { region } = await Promise.resolve(params);
  const region_name = decodeURIComponent(region);

  // ---- DB metadata (regions_v2 + divisions_v2) ----
  let meta:
    | { region_id: string; region_code: string | null; region_name: string; division_id: string | null }
    | null = null;

  let division_name: string | null = null;

  // ---- Roster (active techs, all-inclusive window for now) ----
  let rosterActive: Array<{
    tech_id: string;
    full_name: string | null;
    status: string | null;
    itg_supervisor: string | null;
    supervisor: string | null;
    company: string | null;
    c_code: string | null;
  }> = [];

  let rosterError: string | null = null;

  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("regions_v2")
      .select("region_id, region_code, region_name, division_id")
      .eq("region_name", region_name)
      .maybeSingle();

    if (!error && data) {
      meta = data;

      if (meta.division_id) {
        const div = await sb
          .from("divisions_v2")
          .select("division_name")
          .eq("division_id", meta.division_id)
          .maybeSingle();

        if (!div.error && div.data?.division_name) {
          division_name = String(div.data.division_name);
        }
      }
    }

    // Roster: active techs by region (windowing later)
    const { data: rRows, error: rErr } = await sb
      .from("roster_v2")
      .select("tech_id,full_name,status,itg_supervisor,supervisor,company,c_code")
      .eq("region", region_name)
      .eq("status", "Active")
      .order("tech_id", { ascending: true });

    if (rErr) {
      rosterError = rErr.message;
    } else {
      const safe = (rRows ?? []) as RosterRow[];
      rosterActive = safe
        .map((r) => {
          const tech_id = s(r.tech_id);
          if (!tech_id) return null;
          return {
            tech_id,
            full_name: s(r.full_name) || null,
            status: s(r.status) || null,
            itg_supervisor: s(r.itg_supervisor) || null,
            supervisor: s(r.supervisor) || null,
            company: s(r.company) || null,
            c_code: s(r.c_code) || null,
          };
        })
        .filter(Boolean) as any[];
    }
  } catch (e: any) {
    meta = null;
    division_name = null;
    rosterError = rosterError ?? (e?.message || "Roster load failed");
  }

  // ---- API hydration: techs in region (latest committed ontrac batch) ----
  let techsApi: RegionTechsApi | null = null;

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");

    if (!host) {
      techsApi = { ok: false, error: "Cannot resolve request host for API fetch." };
    } else {
      const baseUrl = `${proto}://${host}`;
      // NOTE: when you add Option A reportable gate, switch to:
      // const url = `${baseUrl}/api/region/${encodeURIComponent(region_name)}/techs?mode=reportable`;
      const url = `${baseUrl}/api/region/${encodeURIComponent(region_name)}/techs`;

      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        techsApi = { ok: false, error: `Region techs API returned ${res.status}` };
      } else {
        techsApi = (await res.json()) as RegionTechsApi;
      }
    }
  } catch (e: any) {
    techsApi = { ok: false, error: e?.message || "Failed to load region techs (API fetch failed)." };
  }

  const ontracTechs =
    techsApi && "ok" in techsApi && techsApi.ok && Array.isArray(techsApi.techs) ? techsApi.techs : [];

  const latest_batch = techsApi && "ok" in techsApi && techsApi.ok ? techsApi.latest_batch : null;
  const pin = techsApi && "ok" in techsApi && techsApi.ok ? techsApi.pin : null;

  // ---- Juxtaposition: roster vs ontrac ----
  const rosterSet = new Set(rosterActive.map((r) => r.tech_id));
  const ontracSet = new Set(ontracTechs.map((t) => s(t.tech_id)).filter(Boolean));

  const inBoth = [...rosterSet].filter((id) => ontracSet.has(id)).sort((a, b) => a.localeCompare(b));
  const onlyRoster = [...rosterSet].filter((id) => !ontracSet.has(id)).sort((a, b) => a.localeCompare(b));
  const onlyOntrac = [...ontracSet].filter((id) => !rosterSet.has(id)).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <ComingSoon
        title={`Region: ${region_name}`}
        bullets={[
          "Region-scoped workspace (region_name).",
          "Hydrates region + division metadata from DB (read-only).",
          "Lists techs present in latest committed Ontrac batch (via API).",
          "Adds roster (Active) tech list for region (windowing later).",
          "No KPI rollups here yet (reporting deferred).",
        ]}
      />

      <div className="max-w-3xl space-y-6">
        <div className="text-sm">
          <Link className="underline" href="/regions">
            ← Back to Regions
          </Link>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Region metadata</h2>

          {meta ? (
            <ul className="space-y-2">
              <li>
                <span className="font-medium">region_name:</span> {meta.region_name}
              </li>
              <li>
                <span className="font-medium">region_code:</span> {meta.region_code ?? "(null)"}
              </li>
              <li>
                <span className="font-medium">division:</span>{" "}
                {division_name ? division_name : meta.division_id ? "(name not found)" : "(null)"}
              </li>
              <li>
                <span className="font-medium">division_id:</span> {meta.division_id ?? "(null)"}
              </li>
              <li>
                <span className="font-medium">region_id:</span> {meta.region_id}
              </li>
            </ul>
          ) : (
            <div className="opacity-70">
              No matching region found in regions_v2 for <span className="font-medium">{region_name}</span>.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Latest committed batch context (Ontrac)</h2>

          {techsApi?.ok ? (
            <ul className="space-y-2">
              <li>
                <span className="font-medium">batch_id:</span> {latest_batch?.batch_id}
              </li>
              <li>
                <span className="font-medium">fiscal_month_anchor:</span> {latest_batch?.fiscal_month_anchor}
              </li>
              <li>
                <span className="font-medium">status:</span> {latest_batch?.status}
              </li>
              <li>
                <span className="font-medium">created_at:</span> {latest_batch?.created_at}
              </li>
              <li>
                <span className="font-medium">rubric_version_id:</span> {pin?.rubric_version_id ?? "(null)"}
              </li>
              <li>
                <span className="font-medium">settings_pinned_at:</span> {pin?.settings_pinned_at ?? "(null)"}
              </li>
              <li>
                <span className="font-medium">pinned_at:</span> {pin?.pinned_at ?? "(null)"}
              </li>
            </ul>
          ) : (
            <div className="opacity-70">
              Could not load batch/pin context:{" "}
              <span className="font-medium">{techsApi?.error ?? "Unknown error"}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Roster (Active) techs in region</h2>

          {rosterError ? (
            <div className="opacity-70">
              Could not load roster: <span className="font-medium">{rosterError}</span>
            </div>
          ) : rosterActive.length ? (
            <>
              <div className="text-sm opacity-70">Showing {rosterActive.length} roster techs (status=Active).</div>
              <ul className="space-y-2">
                {rosterActive.map((r) => (
                  <li key={r.tech_id}>
                    <span className="font-medium">{r.tech_id}</span>
                    {r.full_name ? <> — {r.full_name}</> : null}
                    {r.company || r.c_code ? (
                      <span className="opacity-70">
                        {" "}
                        ({[r.company || null, r.c_code ? `c_code:${r.c_code}` : null].filter(Boolean).join(" · ")})
                      </span>
                    ) : null}
                    {r.itg_supervisor || r.supervisor ? (
                      <span className="opacity-70">
                        {" "}
                        —{" "}
                        {[
                          r.itg_supervisor ? `ITG Sup: ${r.itg_supervisor}` : null,
                          r.supervisor ? `Sup: ${r.supervisor}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="opacity-70">No roster techs found for this region with status=Active.</div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Ontrac techs in region (latest batch)</h2>

          {techsApi?.ok ? (
            ontracTechs.length ? (
              <>
                <div className="text-sm opacity-70">Showing {ontracTechs.length} unique tech_ids from Ontrac rows.</div>
                <ul className="space-y-2">
                  {ontracTechs.map((t) => (
                    <li key={t.tech_id}>
                      <span className="font-medium">{t.tech_id}</span>
                      {t.tech_name ? <> — {t.tech_name}</> : null}
                      {t.supervisor ? <span className="opacity-70"> (Supervisor: {t.supervisor})</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="opacity-70">No Ontrac tech rows found for this region in the latest committed batch.</div>
            )
          ) : (
            <div className="opacity-70">Ontrac tech list unavailable (API error).</div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Roster ↔ Ontrac comparison</h2>

          <ul className="space-y-2">
            <li>
              <span className="font-medium">in both:</span> {inBoth.length}
            </li>
            <li>
              <span className="font-medium">only roster (Active):</span> {onlyRoster.length}
            </li>
            <li>
              <span className="font-medium">only Ontrac (latest batch):</span> {onlyOntrac.length}
            </li>
          </ul>

          <div className="space-y-3">
            <div>
              <div className="font-medium">Only roster (Active)</div>
              {onlyRoster.length ? (
                <div className="text-sm opacity-70 break-words">{onlyRoster.join(", ")}</div>
              ) : (
                <div className="text-sm opacity-70">(none)</div>
              )}
            </div>

            <div>
              <div className="font-medium">Only Ontrac (latest batch)</div>
              {onlyOntrac.length ? (
                <div className="text-sm opacity-70 break-words">{onlyOntrac.join(", ")}</div>
              ) : (
                <div className="text-sm opacity-70">(none)</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
