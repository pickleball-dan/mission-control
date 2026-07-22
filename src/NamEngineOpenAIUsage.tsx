import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  Coins,
  DollarSign,
  LayoutDashboard,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react'

import { fetchUsageReport, TelemetryError, type UsageMetric, type UsageReport } from './telemetryApi'
import {
  beginGoogleSignIn,
  completeGoogleSignIn,
  signOutTelemetry,
  telemetryPublicConfig,
  type TelemetrySession,
} from './telemetryAuth'

type ViewState = 'checking' | 'signed_out' | 'loading' | 'ready' | 'empty' | 'unauthorized' | 'unavailable'
type CostRow = UsageMetric & Record<string, unknown>

export default function NamEngineOpenAIUsage() {
  const [session, setSession] = useState<TelemetrySession | null>(null)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [view, setView] = useState<ViewState>('checking')
  const [message, setMessage] = useState('')
  const [days, setDays] = useState(30)

  useEffect(() => {
    let active = true
    completeGoogleSignIn()
      .then((nextSession) => {
        if (!active) return
        setSession(nextSession)
        setView(nextSession ? 'loading' : 'signed_out')
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Google sign-in could not be completed.')
        setView('unauthorized')
      })
    return () => { active = false }
  }, [])

  const loadReport = useCallback(async (activeSession: TelemetrySession) => {
    setView('loading')
    setMessage('')
    try {
      const nextReport = await fetchUsageReport(activeSession, days)
      setReport(nextReport)
      setView(nextReport.summary.request_count ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof TelemetryError && error.kind === 'unauthorized') {
        setView('unauthorized')
        setMessage('This Google account is not authorized to view NamEngine telemetry.')
      } else {
        setView('unavailable')
        setMessage(error instanceof TelemetryError && error.kind === 'timeout'
          ? 'NamEngine usage took too long to respond.'
          : 'NamEngine usage is temporarily unavailable.')
      }
    }
  }, [days])

  useEffect(() => {
    if (session) void loadReport(session)
  }, [session, loadReport])

  const signOut = () => {
    signOutTelemetry()
    setSession(null)
    setReport(null)
    setMessage('')
    setView('signed_out')
  }

  const configured = Boolean(telemetryPublicConfig())

  return (
    <div className="app-shell telemetry-shell">
      <aside className="sidebar">
        <div className="brand-mark">MC</div>
        <div className="brand-copy">
          <strong>Mission Control</strong>
          <span>Portfolio OS</span>
        </div>
        <nav>
          <a className="nav-item nav-link" href="/"><LayoutDashboard size={18} /> Overview</a>
          <a className="nav-item nav-link active" href="/namengine/openai-usage"><Activity size={18} /> OpenAI cost</a>
        </nav>
        <div className="sidebar-note">
          <Sparkles size={18} />
          <div><strong>Private usage</strong><span>Cost aggregates only. No customer data.</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar telemetry-topbar">
          <div>
            <p className="eyebrow">NamEngine operations</p>
            <h1>OpenAI cost</h1>
            <p>Estimated AI spend first, with usage and reliability explaining the number.</p>
          </div>
          <div className="telemetry-actions">
            {session && <span className="signed-in-user">{session.email}</span>}
            {session && <button className="secondary-button" onClick={signOut}><LogOut size={17} /> Sign out</button>}
          </div>
        </header>

        {(view === 'checking' || view === 'loading') && (
          <StatePanel icon={<RefreshCw className="spin" size={24} />} title="Loading cost report" copy="Connecting securely to NamEngine…" />
        )}

        {view === 'signed_out' && (
          <StatePanel
            icon={<LogIn size={24} />}
            title="Sign in to view AI spend"
            copy="Use an approved Google account. Mission Control stores no service credentials."
            action={
              <button className="primary-button" disabled={!configured} onClick={() => void beginGoogleSignIn()}>
                <LogIn size={18} /> Continue with Google
              </button>
            }
            note={!configured ? 'Public Google OIDC configuration is not available for this build.' : undefined}
          />
        )}

        {view === 'unauthorized' && (
          <StatePanel
            tone="warning"
            icon={<CircleOff size={24} />}
            title="Access not available"
            copy={message || 'This Google account is not authorized to view cost data.'}
            action={<button className="primary-button" onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Try another account</button>}
          />
        )}

        {view === 'unavailable' && (
          <StatePanel
            tone="warning"
            icon={<TriangleAlert size={24} />}
            title="Cost report unavailable"
            copy={message}
            action={session && <button className="primary-button" onClick={() => void loadReport(session)}><RefreshCw size={18} /> Try again</button>}
          />
        )}

        {view === 'empty' && (
          <>
            <TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} />
            <StatePanel icon={<BarChart3 size={24} />} title="No usage in this period" copy="NamEngine returned a valid empty report. Try a longer date range." />
          </>
        )}

        {view === 'ready' && report && <CostDashboard report={report} days={days} setDays={setDays} session={session} loadReport={loadReport} />}
      </main>
    </div>
  )
}

function CostDashboard({
  report,
  days,
  setDays,
  session,
  loadReport,
}: {
  report: UsageReport
  days: number
  setDays: (value: number) => void
  session: TelemetrySession | null
  loadReport: (session: TelemetrySession) => Promise<void>
}) {
  const totalSpend = reportCost(report)
  const previousSpend = previousReportCost(report)
  const todaySpend = spendForToday(report.requests_by_day)
  const averageCostPerRequest = safeDivide(totalSpend, report.summary.request_count)
  const generatedNameCount = firstNumber(report.summary as CostRow, 'generated_name_count', 'name_count', 'generated_names_count')
  const averageCostPerName = generatedNameCount ? safeDivide(totalSpend, generatedNameCount) : null
  const averageCostPerThousandTokens = report.summary.total_tokens ? totalSpend / report.summary.total_tokens * 1_000 : 0
  const highestCostModel = maxByCost(report.requests_by_model as CostRow[], 'model')
  const highestCostRequestType = maxByCost(report.requests_by_request_type as CostRow[], 'request_type')
  const largestSingleRequestCost = firstNumber(report.summary as CostRow, 'largest_request_cost_usd', 'maximum_request_cost_usd', 'max_request_cost_usd')

  return (
    <>
      <TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} />

      <section className="cost-hero" aria-label="Estimated AI spend">
        <div className="cost-hero-icon"><DollarSign size={32} /></div>
        <div>
          <p className="eyebrow">Estimated AI Spend</p>
          <strong>{formatCurrency(totalSpend)}</strong>
          <span>{periodComparison(totalSpend, previousSpend)}</span>
        </div>
      </section>

      <section className="cost-kpi-row cost-kpi-secondary" aria-label="Cost KPIs">
        <CostCard icon={<Coins size={20} />} label="Today's Spend" value={formatCurrency(todaySpend)} />
        <CostCard icon={<Zap size={20} />} label="Average Cost / Request" value={formatCurrency(averageCostPerRequest)} />
        <CostCard icon={<Bot size={20} />} label="Average Cost / Generated Name" value={averageCostPerName === null ? 'Coming Soon' : formatCurrency(averageCostPerName)} />
        <CostCard icon={<TrendingUp size={20} />} label="Average Cost / 1,000 Tokens" value={formatCurrency(averageCostPerThousandTokens)} />
      </section>

      <section className="cost-kpi-row cost-kpi-operations" aria-label="Operational KPIs">
        <CostCard icon={<Activity size={20} />} label="Total Requests" value={formatNumber(report.summary.request_count)} secondary />
        <CostCard icon={<Bot size={20} />} label="Total Tokens" value={formatNumber(report.summary.total_tokens)} secondary />
        <CostCard icon={<CheckCircle2 size={20} />} label="Success Rate" value={`${report.summary.success_rate.toFixed(1)}%`} secondary />
        <CostCard icon={<Clock3 size={20} />} label="Average Latency" value={formatLatency(report.summary.average_latency_ms)} secondary />
      </section>

      <section className="telemetry-grid cost-analytics-grid" aria-label="Supporting cost analytics">
        <CostBreakdown title="Spend by Day" labelKey="date" rows={report.requests_by_day as CostRow[]} valueLabel="Estimated spend" formatLabel={formatDate} />
        <CostBreakdown title="Spend by Model" labelKey="model" rows={report.requests_by_model as CostRow[]} valueLabel="Estimated spend" />
        <CostBreakdown title="Spend by Request Type" labelKey="request_type" rows={report.requests_by_request_type as CostRow[]} valueLabel="Estimated spend" />
        <MetricBreakdown title="Requests by Day" labelKey="date" rows={report.requests_by_day as CostRow[]} valueKey="request_count" valueLabel="Requests" formatLabel={formatDate} />
        <MetricBreakdown title="Token Usage by Day" labelKey="date" rows={report.requests_by_day as CostRow[]} valueKey="total_tokens" valueLabel="Tokens" formatLabel={formatDate} />
        <OperationsSummary
          highestCostModel={highestCostModel}
          highestCostRequestType={highestCostRequestType}
          largestSingleRequestCost={largestSingleRequestCost}
          averageLatency={report.summary.average_latency_ms}
          successRate={report.summary.success_rate}
        />
        <DailyCostTable rows={report.requests_by_day as Array<CostRow & { date: string }>} />
        <Failures rows={report.failures_by_error_type} />
        <UnavailableUsage rows={report.requests_with_unavailable_token_usage} />
      </section>
    </>
  )
}

function TelemetryControls({
  days,
  setDays,
  session,
  loadReport,
}: {
  days: number
  setDays: (value: number) => void
  session: TelemetrySession | null
  loadReport: (session: TelemetrySession) => Promise<void>
}) {
  return (
    <div className="telemetry-controls">
      <label><CalendarDays size={17} /><span>Reporting window</span>
        <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </label>
      {session && <button className="secondary-button" onClick={() => void loadReport(session)}><RefreshCw size={16} /> Refresh</button>}
    </div>
  )
}

function CostCard({ icon, label, value, secondary }: { icon: ReactNode; label: string; value: string; secondary?: boolean }) {
  return (
    <article className={`usage-card cost-card${secondary ? ' cost-card-secondary' : ''}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function CostBreakdown({
  title,
  rows,
  labelKey,
  valueLabel,
  formatLabel,
}: {
  title: string
  rows: CostRow[]
  labelKey: string
  valueLabel: string
  formatLabel?: (value: string) => string
}) {
  const chartRows = rows.map((row) => ({ row, value: costOf(row) }))
  const maximum = Math.max(...chartRows.map((item) => item.value), 0.000001)
  return (
    <article className="telemetry-panel">
      <div className="panel-heading"><div><p className="eyebrow">Cost</p><h2>{title}</h2></div><span>{rows.length} rows</span></div>
      <div className="usage-bars">
        {chartRows.map(({ row, value }) => (
          <div className="usage-bar-row" key={String(row[labelKey])}>
            <div className="usage-bar-label"><strong>{formatLabel ? formatLabel(String(row[labelKey])) : String(row[labelKey])}</strong><span>{valueLabel}</span></div>
            <div className="usage-bar-track"><div style={{ width: `${Math.max(3, value / maximum * 100)}%` }} /></div>
            <span className="usage-bar-value">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function MetricBreakdown({
  title,
  rows,
  labelKey,
  valueKey,
  valueLabel,
  formatLabel,
}: {
  title: string
  rows: CostRow[]
  labelKey: string
  valueKey: keyof UsageMetric
  valueLabel: string
  formatLabel?: (value: string) => string
}) {
  const maximum = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1)
  return (
    <article className="telemetry-panel">
      <div className="panel-heading"><div><p className="eyebrow">Usage context</p><h2>{title}</h2></div><span>{rows.length} rows</span></div>
      <div className="usage-bars">
        {rows.map((row) => {
          const value = Number(row[valueKey]) || 0
          return (
            <div className="usage-bar-row" key={String(row[labelKey])}>
              <div className="usage-bar-label"><strong>{formatLabel ? formatLabel(String(row[labelKey])) : String(row[labelKey])}</strong><span>{valueLabel}</span></div>
              <div className="usage-bar-track"><div style={{ width: `${Math.max(3, value / maximum * 100)}%` }} /></div>
              <span className="usage-bar-value">{formatNumber(value)}</span>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function OperationsSummary({
  highestCostModel,
  highestCostRequestType,
  largestSingleRequestCost,
  averageLatency,
  successRate,
}: {
  highestCostModel: { label: string; cost: number } | null
  highestCostRequestType: { label: string; cost: number } | null
  largestSingleRequestCost: number | null
  averageLatency: number
  successRate: number
}) {
  return (
    <article className="telemetry-panel operations-summary">
      <div className="panel-heading"><div><p className="eyebrow">Operations summary</p><h2>Cost drivers</h2></div></div>
      <div className="compact-rows">
        <SummaryRow label="Highest-cost model" value={highestCostModel ? highestCostModel.label : 'Coming Soon'} detail={highestCostModel ? formatCurrency(highestCostModel.cost) : undefined} />
        <SummaryRow label="Highest-cost request type" value={highestCostRequestType ? highestCostRequestType.label : 'Coming Soon'} detail={highestCostRequestType ? formatCurrency(highestCostRequestType.cost) : undefined} />
        <SummaryRow label="Largest single request cost" value={largestSingleRequestCost === null ? 'Coming Soon' : formatCurrency(largestSingleRequestCost)} />
        <SummaryRow label="Average request latency" value={formatLatency(averageLatency)} />
        <SummaryRow label="Success rate" value={`${successRate.toFixed(1)}%`} />
      </div>
    </article>
  )
}

function SummaryRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div><span>{label}{detail && <small>{detail}</small>}</span><strong>{value}</strong></div>
}

function DailyCostTable({ rows }: { rows: Array<CostRow & { date: string }> }) {
  return (
    <article className="telemetry-panel telemetry-panel-wide">
      <div className="panel-heading"><div><p className="eyebrow">Daily table</p><h2>Daily cost details</h2></div><span>{rows.length} active days</span></div>
      <div className="usage-table-wrap">
        <table className="usage-table">
          <thead><tr><th>Date</th><th>Estimated Spend</th><th>Requests</th><th>Input Tokens</th><th>Output Tokens</th><th>Avg. Cost / Request</th><th>Avg. Latency</th></tr></thead>
          <tbody>
            {[...rows].reverse().slice(0, 14).map((row) => {
              const spend = costOf(row)
              return (
                <tr key={row.date}>
                  <td>{formatDate(row.date)}</td>
                  <td>{formatCurrency(spend)}</td>
                  <td>{formatNumber(row.request_count)}</td>
                  <td>{formatNumber(row.input_tokens)}</td>
                  <td>{formatNumber(row.output_tokens)}</td>
                  <td>{formatCurrency(safeDivide(spend, row.request_count))}</td>
                  <td>{formatLatency(row.average_latency_ms)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function Failures({ rows }: { rows: UsageReport['failures_by_error_type'] }) {
  return (
    <article className="telemetry-panel">
      <div className="panel-heading"><div><p className="eyebrow">Reliability</p><h2>Failures by error type</h2></div></div>
      {rows.length ? <div className="compact-rows">{rows.map((row) => (
        <div key={row.error_type}><span>{row.error_type}</span><strong>{formatNumber(row.failure_count)}</strong></div>
      ))}</div> : <EmptyPanelCopy>No failures in this period.</EmptyPanelCopy>}
    </article>
  )
}

function UnavailableUsage({ rows }: { rows: UsageReport['requests_with_unavailable_token_usage'] }) {
  return (
    <article className="telemetry-panel telemetry-panel-wide">
      <div className="panel-heading"><div><p className="eyebrow">Data quality</p><h2>Requests with unavailable token usage</h2></div></div>
      {rows.length ? <div className="usage-table-wrap"><table className="usage-table">
        <thead><tr><th>Request type</th><th>Model</th><th>Requests</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.request_type}-${row.model}`}><td>{row.request_type}</td><td>{row.model}</td><td>{formatNumber(row.request_count)}</td></tr>)}</tbody>
      </table></div> : <EmptyPanelCopy>All requests reported token usage.</EmptyPanelCopy>}
    </article>
  )
}

function EmptyPanelCopy({ children }: { children: ReactNode }) {
  return <p className="empty-panel-copy">{children}</p>
}

function StatePanel({
  icon,
  title,
  copy,
  action,
  note,
  tone,
}: {
  icon: ReactNode
  title: string
  copy: string
  action?: ReactNode
  note?: string
  tone?: 'warning'
}) {
  return (
    <section className={`telemetry-state${tone ? ` telemetry-state-${tone}` : ''}`}>
      <div className="telemetry-state-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      {action}
      {note && <small>{note}</small>}
    </section>
  )
}

function reportCost(report: UsageReport): number {
  const summaryCost = costOf(report.summary as CostRow)
  if (summaryCost > 0) return summaryCost
  return (report.requests_by_day as CostRow[]).reduce((total, row) => total + costOf(row), 0)
}

function previousReportCost(report: UsageReport): number | null {
  const payload = report as unknown as Record<string, unknown>
  const previous = payload.previous_period
  if (previous && typeof previous === 'object') {
    const summary = (previous as Record<string, unknown>).summary
    const cost = costOf((summary && typeof summary === 'object' ? summary : previous) as CostRow)
    return cost > 0 ? cost : null
  }
  return firstNumber(report.summary as CostRow, 'previous_period_estimated_spend_usd', 'previous_estimated_spend_usd', 'previous_spend_usd')
}

function spendForToday(rows: UsageReport['requests_by_day']): number {
  const today = new Date().toISOString().slice(0, 10)
  const row = (rows as CostRow[]).find((item) => String(item.date) === today)
  return row ? costOf(row) : 0
}

function maxByCost(rows: CostRow[], labelKey: string): { label: string; cost: number } | null {
  let best: { label: string; cost: number } | null = null
  for (const row of rows) {
    const cost = costOf(row)
    if (!best || cost > best.cost) best = { label: String(row[labelKey] ?? 'Unknown'), cost }
  }
  return best && best.cost > 0 ? best : null
}

function costOf(row: CostRow): number {
  return firstNumber(row, 'estimated_spend_usd', 'estimated_cost_usd', 'total_cost_usd', 'cost_usd', 'spend_usd') ?? 0
}

function firstNumber(row: CostRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function periodComparison(current: number, previous: number | null): string {
  if (previous === null || previous <= 0) return 'Previous period comparison unavailable'
  const delta = current - previous
  const percent = Math.abs(delta / previous * 100)
  const direction = delta >= 0 ? 'up' : 'down'
  return `${direction} ${percent.toFixed(1)}% vs previous period (${formatCurrency(previous)})`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 4 : 2 }).format(value || 0)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function formatLatency(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}s`
  return `${Math.round(value || 0)}ms`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
