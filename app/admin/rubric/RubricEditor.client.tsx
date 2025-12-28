// app/admin/rubric/RubricEditor.client.tsx
'use client'

import React from 'react'

type Band = 'exceed' | 'meet' | 'needs_improvement' | 'unacceptable' | 'no_data'
type ColorToken =
  | 'accent_positive'
  | 'accent_neutral'
  | 'accent_warning'
  | 'accent_critical'
  | 'accent_muted'

type DraftBand = {
  band: Band
  min_input: string
  max_input: string
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
}

type DraftMetricRubric = {
  metric_name: string
  report_label: string
  format: string
  category: 'p4p' | 'other' | 'both'
  bands: DraftBand[]
}

type InitialMetricRubric = {
  metric_name: string
  report_label: string
  format: string
  category: 'p4p' | 'other' | 'both'
  bands: Array<{
    band: Band
    min_value: number | null
    max_value: number | null
    inclusive_min: boolean
    inclusive_max: boolean
    color_token: ColorToken
  }>
}

type VersionResp =
  | {
      ok: true
      scope: string
      source_system: string
      fiscal_month_anchor: string | null
      version: { id: number } | null
      thresholds: Array<{
        metric_name: string
        band: Band
        min_value: number | null
        max_value: number | null
        inclusive_min: boolean
        inclusive_max: boolean
        color_token: ColorToken
        report_label_snapshot?: string | null
        format_snapshot?: string | null
      }>
    }
  | { ok: false; error: string }

const COLOR_TOKENS: ColorToken[] = [
  'accent_positive',
  'accent_neutral',
  'accent_warning',
  'accent_critical',
  'accent_muted',
]

// UI-only swatch mapping. Tokens remain DB truth.
const TOKEN_SWATCH: Record<ColorToken, string> = {
  accent_positive: '#16a34a',
  accent_neutral: '#64748b',
  accent_warning: '#f59e0b',
  accent_critical: '#dc2626',
  accent_muted: '#94a3b8',
}

const DEFAULT_BANDS: DraftBand[] = [
  { band: 'exceed', min_input: '', max_input: '', inclusive_min: true, inclusive_max: false, color_token: 'accent_positive' },
  { band: 'meet', min_input: '', max_input: '', inclusive_min: true, inclusive_max: false, color_token: 'accent_neutral' },
  { band: 'needs_improvement', min_input: '', max_input: '', inclusive_min: true, inclusive_max: false, color_token: 'accent_warning' },
  { band: 'unacceptable', min_input: '', max_input: '', inclusive_min: true, inclusive_max: false, color_token: 'accent_critical' },
  { band: 'no_data', min_input: '', max_input: '', inclusive_min: true, inclusive_max: true, color_token: 'accent_muted' },
]

function calendarMonthAnchor(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const mm = String(m).padStart(2, '0')
  return `${y}-${mm}-01`
}

function numberToInput(n: number | null) {
  if (n === null || n === undefined) return ''
  if (n === Infinity) return 'Infinity'
  if (n === -Infinity) return '-Infinity'
  return String(n)
}

function inputToNumber(s: string): number | null {
  const t = String(s ?? '').trim()
  if (!t) return null
  if (t === 'Infinity') return Infinity
  if (t === '-Infinity') return -Infinity
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function prettyBand(b: Band) {
  if (b === 'needs_improvement') return 'Needs improvement'
  if (b === 'no_data') return 'No data'
  return b.charAt(0).toUpperCase() + b.slice(1)
}

// Basic safety: require min/max numeric for non-no_data bands; allow blanks if you want looser rules.
function validateDraft(draft: DraftMetricRubric[]) {
  const errors: string[] = []

  for (const m of draft) {
    if (!m.metric_name) continue

    const bands = m.bands
    for (const b of bands) {
      if (b.band === 'no_data') continue

      const min = inputToNumber(b.min_input)
      const max = inputToNumber(b.max_input)

      // allow one-sided open ranges only if explicitly Infinity/-Infinity
      const minRaw = String(b.min_input ?? '').trim()
      const maxRaw = String(b.max_input ?? '').trim()

      if (!minRaw || !maxRaw) {
        errors.push(`${m.report_label}: ${prettyBand(b.band)} requires Min and Max`)
        continue
      }

      if (min === null || max === null) {
        errors.push(`${m.report_label}: ${prettyBand(b.band)} has invalid Min/Max`)
        continue
      }

      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        errors.push(`${m.report_label}: ${prettyBand(b.band)} has Min > Max`)
      }
    }
  }

  return errors
}

export default function RubricEditorClient(props: { initial: InitialMetricRubric[] }) {
  const [draft, setDraft] = React.useState<DraftMetricRubric[]>(() =>
    props.initial.map((m) => ({
      metric_name: m.metric_name,
      report_label: m.report_label,
      format: m.format,
      category: m.category,
      bands: DEFAULT_BANDS.map((b) => ({ ...b })),
    }))
  )

  const [loadingCommitted, setLoadingCommitted] = React.useState(false)
  const [committing, setCommitting] = React.useState(false)

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  const [committedInfo, setCommittedInfo] = React.useState<string | null>(null)
  const [loadedAnchor, setLoadedAnchor] = React.useState<string | null>(null)
  const [loadedVersionId, setLoadedVersionId] = React.useState<number | null>(null)

  const setBand = (
    metric_name: string,
    band: Band,
    patch: Partial<Pick<DraftBand, 'min_input' | 'max_input' | 'color_token' | 'inclusive_min' | 'inclusive_max'>>
  ) => {
    setDraft((prev) =>
      prev.map((m) => {
        if (m.metric_name !== metric_name) return m
        return {
          ...m,
          bands: m.bands.map((b) => (b.band === band ? { ...b, ...patch } : b)),
        }
      })
    )
  }

  const onResetMetric = (metric_name: string) => {
    setDraft((prev) =>
      prev.map((m) => (m.metric_name === metric_name ? { ...m, bands: DEFAULT_BANDS.map((b) => ({ ...b })) } : m))
    )
  }

  const onLoadCommitted = async () => {
    setErrorMsg(null)
    setOkMsg(null)

    try {
      setLoadingCommitted(true)

      // ✅ Do NOT pass anchor. API resolves latest as-of today.
      const res = await fetch('/api/rubric/version?scope=global&source_system=ontrac', {
        cache: 'no-store',
      })

      const json = (await res.json()) as VersionResp
      if (!res.ok || (json as any).ok === false) {
        throw new Error((json as any)?.error ?? `Load failed (${res.status})`)
      }

      const ok = json as Extract<VersionResp, { ok: true }>

      if (!ok.version) {
        setLoadedAnchor(ok.fiscal_month_anchor ? String(ok.fiscal_month_anchor).slice(0, 10) : null)
        setLoadedVersionId(null)
        setCommittedInfo('No committed version found (latest as-of today)')
        return
      }

      const byKey = new Map<string, any>()
      for (const r of ok.thresholds) {
        byKey.set(`${r.metric_name}__${r.band}`, r)
      }

      setDraft((prev) =>
        prev.map((m) => ({
          ...m,
          bands: m.bands.map((b) => {
            const r = byKey.get(`${m.metric_name}__${b.band}`)
            if (!r) return b
            return {
              ...b,
              min_input: numberToInput(r.min_value),
              max_input: numberToInput(r.max_value),
              inclusive_min: Boolean(r.inclusive_min),
              inclusive_max: Boolean(r.inclusive_max),
              color_token: r.color_token,
            }
          }),
        }))
      )

      const anchor = ok.fiscal_month_anchor ? String(ok.fiscal_month_anchor).slice(0, 10) : null
      setLoadedAnchor(anchor)
      setLoadedVersionId(ok.version.id)
      setCommittedInfo(`Loaded committed version #${ok.version.id}${anchor ? ` (${anchor})` : ''}`)
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e))
    } finally {
      setLoadingCommitted(false)
    }
  }

  const onCommit = async () => {
    setErrorMsg(null)
    setOkMsg(null)

    const errs = validateDraft(draft)
    if (errs.length) {
      setErrorMsg(errs[0])
      return
    }

    try {
      setCommitting(true)

      const todayISO = new Date().toISOString().slice(0, 10)
      const anchor = loadedAnchor ?? calendarMonthAnchor(todayISO)

      const payload = {
        scope: 'global',
        source_system: 'ontrac',
        fiscal_month_anchor: anchor,
        notes: `admin commit (ui)`,
        metrics: draft.map((m) => ({
          metric_name: m.metric_name,
          report_label: m.report_label,
          format: m.format,
          // Keep direction stable (server may ignore; safe for forward compatibility)
          direction: 'higher_is_better',
          bands: m.bands.map((b) => ({
            metric_name: m.metric_name,
            band: b.band,
            min_value: inputToNumber(b.min_input),
            max_value: inputToNumber(b.max_input),
            inclusive_min: Boolean(b.inclusive_min),
            inclusive_max: Boolean(b.inclusive_max),
            color_token: b.color_token,
            report_label_snapshot: m.report_label,
            format_snapshot: m.format,
          })),
        })),
      }

      const res = await fetch('/api/rubric/commit', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok || !json || json.ok === false) {
        throw new Error(json?.error ?? `Commit failed (${res.status})`)
      }

      setOkMsg(`Committed rubric for ${anchor}`)
      // Refresh committed snapshot so UI stays DB-truth aligned
      await onLoadCommitted()
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e))
    } finally {
      setCommitting(false)
    }
  }

  React.useEffect(() => {
    void onLoadCommitted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="text-sm">
          <span className="font-medium">Enabled metrics:</span> {draft.length}
          <div className="mt-1 text-xs text-muted-foreground">
            Range rule: <span className="font-mono">min ≤ value &lt; max</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={onLoadCommitted}
            disabled={loadingCommitted}
          >
            {loadingCommitted ? 'Loading…' : 'Reload committed'}
          </button>

          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            onClick={onCommit}
            disabled={committing}
          >
            {committing ? 'Committing…' : 'Commit Rubric'}
          </button>
        </div>

        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {committedInfo ?? 'No committed version loaded.'}
          {loadedVersionId ? null : null}
        </div>
      </div>

      {errorMsg ? (
        <div className="border-b bg-red-50 p-4 text-sm text-red-700">{errorMsg}</div>
      ) : null}

      {okMsg ? (
        <div className="border-b bg-green-50 p-4 text-sm text-green-700">{okMsg}</div>
      ) : null}

      <div className="space-y-8 p-4">
        {draft.map((m) => (
          <div key={m.metric_name} className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">{m.report_label}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {m.metric_name} · format: {m.format} · category: {m.category}
                </div>
              </div>

              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => onResetMetric(m.metric_name)}
              >
                Reset metric
              </button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Band</th>
                    <th className="py-2 text-left font-medium">Min</th>
                    <th className="py-2 text-left font-medium">Max</th>
                    <th className="py-2 text-left font-medium">Color</th>
                  </tr>
                </thead>
                <tbody>
                  {m.bands.map((b) => (
                    <tr key={b.band} className="border-b">
                      <td className="py-3 pr-4 font-medium">{prettyBand(b.band)}</td>

                      <td className="py-3 pr-4">
                        <input
                          className="w-40 rounded-md border px-3 py-2"
                          value={b.min_input}
                          onChange={(e) => setBand(m.metric_name, b.band, { min_input: e.target.value })}
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <input
                          className="w-40 rounded-md border px-3 py-2"
                          value={b.max_input}
                          onChange={(e) => setBand(m.metric_name, b.band, { max_input: e.target.value })}
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <span
                            title={b.color_token}
                            style={{
                              display: 'inline-block',
                              width: 14,
                              height: 14,
                              borderRadius: 9999,
                              border: '1px solid rgba(0,0,0,0.25)',
                              backgroundColor: TOKEN_SWATCH[b.color_token],
                            }}
                          />
                          <select
                            className="w-56 rounded-md border px-3 py-2"
                            value={b.color_token}
                            onChange={(e) =>
                              setBand(m.metric_name, b.band, { color_token: e.target.value as ColorToken })
                            }
                          >
                            {COLOR_TOKENS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-2 text-xs text-muted-foreground">
                Color tokens are stored as strings in the DB; the circle is a UI preview.
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
