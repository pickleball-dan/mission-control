import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  DollarSign,
  LayoutDashboard,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react'

import {
  fetchUsageReport,
  TelemetryError,
  type SessionSort,
  type SessionSortKey,
  type SessionUsageMetric,
  type UsageExceptionReport,
  type UsageMetric,
  type UsageReport,
} from './telemetryApi'
import {
  beginGoogleSignIn,
  completeGoogleSignIn,
  signOutTelemetry,
  telemetryPublicConfig,
  type TelemetrySession,
} from './telemetryAuth'

type ViewState = 'checking' | 'signed_out' | 'loading' | 'ready' | 'empty' | 'unauthorized' | 'unavailable'

type ModelPrice = { input: number; output: number }

const MODEL_PRICES_PER_MILLION: Record<string, ModelPrice> = {
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const REPORTING_WINDOWS = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export default function NamEngineOpenAIUsage() {
  const [session, setSession] = useState<TelemetrySession | null>(null)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [view, setView] = useState<ViewState>('checking')
  const [message, setMessage] = useState('')
  const [days, setDays] = useState(1)
  const [sessionSort, setSessionSort] = useState<SessionSort>({ key: 'timestamp', direction: 'desc' })

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
      const nextReport = await fetchUsageReport(activeSession, days, sessionSort)
      setReport(nextReport)
      setView(nextReport.summary.request_count ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof TelemetryError && error.kind === 'unauthorized') {
        setView('unauthorized')
        setMessage('This Google account is not authorized to view NamEngine telemetry.')
      } else {
        setView('unavailable')
        setMessage(error instanceof TelemetryError && error.kind === 'timeout'
          ? 'NamEngine telemetry took too long to respond.'
          : 'NamEngine telemetry is temporarily unavailable.')
      }
    }
  }, [days, sessionSort])

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
  const totalCost = report ? estimateReportCost(report.requests_by_model) : 0
  const averageCost = report?.summary.request_count ? totalCost / report.summary.request_count : 0
  const projectedMonthlyCost = days ? totalCost / days * 30 : 0
  const reportingLabel = REPORTING_WINDOWS.find((item) => item.days === days)?.label ?? `${days} days`

  return (
    <div className="app-shell telemetry-shell">
      <aside className="sidebar">
        <div className="brand-mark">MC</div>
        <div className="brand-copy"><strong>Mission Control</strong><span>Portfolio OS</span></div>
        <nav>
          <a className="nav-item nav-link" href="/"><LayoutDashboard size={18} /> Overview</a>
          <a className="nav-item nav-link active" href="/namengine/openai-usage"><Activity size={18} /> OpenAI usage</a>
        </nav>
        <div className="sidebar-note"><Sparkles size={18} /><div><strong>Private telemetry</strong><span>Aggregates only. No customer data.</span></div></div>
      </aside>

      <main>
        <header className="topbar telemetry-topbar">
          <div>
            <p className="eyebrow">NamEngine operations</p>
            <h1>OpenAI usage</h1>
            <p>Estimated cost, request volume, token usage, reliability, and latency across NamEngine.</p>
          </div>
          <div className="telemetry-actions">
            {session && <span className="signed-in-user">{session.email}</span>}
            {session && <button className="secondary-button" onClick={signOut}><LogOut size={17} /> Sign out</button>}
          </div>
        </header>

        {(view === 'checking' || view === 'loading') && <StatePanel icon={<RefreshCw className="spin" size={24} />} title="Loading telemetry" copy="Connecting securely to NamEngine…" />}

        {view === 'signed_out' && <StatePanel icon={<LogIn size={24} />} title="Sign in to view telemetry" copy="Use an approved Google account. Mission Control stores no service credentials." action={<button className="primary-button" disabled={!configured} onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Continue with Google</button>} />}

        {view === 'unauthorized' && <StatePanel icon={<CircleOff size={24} />} title="Access not available" copy={message || 'This Google account is not authorized to view telemetry.'} action={<button className="primary-button" onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Try another account</button>} />}

        {view === 'unavailable' && <StatePanel icon={<TriangleAlert size={24} />} title="Telemetry unavailable" copy={message} action={session && <button className="primary-button" onClick={() => void loadReport(session)}><RefreshCw size={18} /> Try again</button>} />}

        {view === 'empty' && <><TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} /><StatePanel icon={<Activity size={24} />} title="No usage in this period" copy="NamEngine returned a valid empty telemetry report. Try a longer date range." /></>}

        {view === 'ready' && report && (
          <>
            <TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} />
            <section className="telemetry-metrics" aria-label="OpenAI usage summary">
              <UsageCard icon={<DollarSign size={20} />} label={`Estimated cost (${reportingLabel})`} value={formatCurrency(totalCost)} />
              <UsageCard icon={<DollarSign size={20} />} label="Average cost / request" value={formatCurrency(averageCost, 4)} />
              <UsageCard icon={<DollarSign size={20} />} label="Projected monthly cost" value={formatCurrency(projectedMonthlyCost)} />
              <UsageCard icon={<Zap size={20} />} label="Total requests" value={formatNumber(report.summary.request_count)} />
              <UsageCard icon={<CheckCircle2 size={20} />} label="Successful" value={formatNumber(report.summary.success_count)} />
              <UsageCard icon={<XCircle size={20} />} label="Failed" value={formatNumber(report.summary.failure_count)} />
              <UsageCard icon={<Bot size={20} />} label="Total tokens" value={formatNumber(report.summary.total_tokens)} />
              <UsageCard icon={<Clock3 size={20} />} label="Average latency" value={formatLatency(report.summary.average_latency_ms)} />
            </section>

            <section className="telemetry-grid">
              <ModelCostTable rows={report.requests_by_model} />
              <SessionCostTable rows={report.requests_by_session ?? []} sort={sessionSort} setSort={setSessionSort} />
              <UsageExceptionsPanel report={report.usage_exceptions} />
              <DailyUsage rows={report.requests_by_day} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function TelemetryControls({ days, setDays, session, loadReport }: { days: number; setDays: (value: number) => void; session: TelemetrySession | null; loadReport: (session: TelemetrySession) => Promise<void> }) {
  return <div className="telemetry-controls"><label><CalendarDays size={17} /><span>Reporting window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{REPORTING_WINDOWS.map((window) => <option key={window.days} value={window.days}>{window.label}</option>)}</select></label>{session && <button className="secondary-button" onClick={() => void loadReport(session)}><RefreshCw size={16} /> Refresh</button>}</div>
}

function UsageCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="usage-card"><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>
}

function ModelCostTable({ rows }: { rows: Array<UsageMetric & { model: string }> }) {
  return <article className="telemetry-panel telemetry-panel-wide"><div className="panel-heading"><div><p className="eyebrow">Cost</p><h2>Estimated cost by model</h2></div></div><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Model</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Estimated cost</th></tr></thead><tbody>{rows.map((row) => <tr key={row.model}><td>{row.model}</td><td>{formatNumber(row.request_count)}</td><td>{formatNumber(row.input_tokens)}</td><td>{formatNumber(row.output_tokens)}</td><td>{formatCurrency(estimateModelCost(row))}</td></tr>)}</tbody></table></div></article>
}

function SessionCostTable({ rows, sort, setSort }: { rows: SessionUsageMetric[]; sort: SessionSort; setSort: (value: SessionSort) => void }) {
  const visibleRows = rows.slice(0, 25)
  const sortedRows = useMemo(() => sortSessionRows(visibleRows, sort), [visibleRows, sort])
  const sortedCards = sortSessionRows(visibleRows, sort)
  const sortHeader = (key: SessionSortKey, label: string) => {
    const active = sort.key === key
    const nextDirection = active && sort.direction === 'desc' ? 'asc' : 'desc'
    return <button className={`sort-header${active ? ' active' : ''}`} type="button" onClick={() => setSort({ key, direction: nextDirection })}>{label}<span>{active ? (sort.direction === 'desc' ? '↓' : '↑') : '↕'}</span></button>
  }
  return <article className="telemetry-panel telemetry-panel-wide"><div className="panel-heading"><div><p className="eyebrow">Sessions</p><h2>Estimated cost by session</h2></div><span>{rows.length ? `${formatNumber(rows.length)} sessions` : 'No session rows yet'}</span></div>{visibleRows.length ? <><div className="session-cost-cards">{sortedCards.map((row) => <div className="session-cost-card" key={row.session_id}><div><strong>{formatCurrency(row.estimated_spend_usd, 4)}</strong><span>{formatNumber(row.request_count)} requests · {formatNumber(row.total_tokens)} tokens</span></div><p title={row.session_id}>{formatSessionLabel(row)}</p><dl><div><dt>Time</dt><dd>{formatTimestamp(row.timestamp, row.date)}</dd></div><div><dt>Model</dt><dd>{row.model}</dd></div><div><dt>Raw ID</dt><dd title={row.session_id}>{shortSessionId(row.session_id)}</dd></div></dl></div>)}</div><div className="usage-table-wrap session-cost-table-wrap"><table className="usage-table session-cost-table"><thead><tr><th>{sortHeader('session_id', 'Session')}</th><th>{sortHeader('timestamp', 'Time')}</th><th>{sortHeader('model', 'Model')}</th><th>{sortHeader('request_count', 'Requests')}</th><th>{sortHeader('total_tokens', 'Tokens')}</th><th>{sortHeader('generated_name_count', 'Names')}</th><th>{sortHeader('average_latency_ms', 'Avg. latency')}</th><th>{sortHeader('estimated_spend_usd', 'Estimated cost')}</th></tr></thead><tbody>{sortedRows.map((row) => <tr key={row.session_id}><td><span className="session-id-cell" title={row.session_id}>{formatSessionLabel(row)}</span></td><td>{formatTimestamp(row.timestamp, row.date)}</td><td>{row.model}</td><td>{formatNumber(row.request_count)}</td><td>{formatNumber(row.total_tokens)}</td><td>{formatNumber(row.generated_name_count)}</td><td>{formatLatency(row.average_latency_ms)}</td><td>{formatCurrency(row.estimated_spend_usd, 4)}</td></tr>)}</tbody></table></div></> : <p className="empty-panel-copy">Deploy the latest NamEngine telemetry API so Mission Control can receive per-session rows.</p>}</article>
}

function UsageExceptionsPanel({ report }: { report?: UsageExceptionReport }) {
  if (!report) return <article className="telemetry-panel"><div className="panel-heading"><div><p className="eyebrow">Exceptions</p><h2>Usage exceptions</h2></div></div><p className="empty-panel-copy">Deploy the latest NamEngine telemetry API to see usage exceptions.</p></article>
  const summary = report.summary
  const rows = [
    { label: 'Unexpected request types', value: summary.unexpected_request_type_count },
    { label: 'Pipeline anomaly sessions', value: summary.pipeline_anomaly_session_count },
    { label: 'Failures', value: summary.failure_count },
    { label: 'Missing token usage', value: summary.requests_missing_token_usage },
  ]
  return <article className="telemetry-panel"><div className="panel-heading"><div><p className="eyebrow">Exceptions</p><h2>Usage exceptions</h2></div><span>{formatNumber(summary.exception_request_count)} flagged</span></div><div className="compact-rows exception-rows">{rows.map((row) => <div key={row.label}><span>{row.label}<small>{exceptionDetail(row.label, report)}</small></span><strong>{formatNumber(row.value)}</strong></div>)}</div></article>
}

function exceptionDetail(label: string, report: UsageExceptionReport): string {
  if (label === 'Unexpected request types') return report.unexpected_request_types[0]?.request_type ?? 'Normal pipeline only'
  if (label === 'Pipeline anomaly sessions') return report.sessions_with_pipeline_anomalies[0]?.session_id ?? 'No anomaly sessions'
  if (label === 'Failures') return report.failures_by_error_type[0]?.error_type ?? 'No failures'
  return report.requests_with_unavailable_token_usage[0]?.request_type ?? 'Token usage available'
}

function DailyUsage({ rows }: { rows: Array<UsageMetric & { date: string }> }) {
  return <article className="telemetry-panel telemetry-panel-wide"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Daily usage</h2></div></div><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Date</th><th>Requests</th><th>Total tokens</th><th>Avg. latency</th></tr></thead><tbody>{[...rows].reverse().slice(0, 14).map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{formatNumber(row.request_count)}</td><td>{formatNumber(row.total_tokens)}</td><td>{formatLatency(row.average_latency_ms)}</td></tr>)}</tbody></table></div></article>
}

function StatePanel({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="telemetry-state"><div className="telemetry-state-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</section>
}

function sortSessionRows(rows: SessionUsageMetric[], sort: SessionSort): SessionUsageMetric[] {
  return [...rows].sort((first, second) => {
    const left = sessionSortValue(first, sort.key)
    const right = sessionSortValue(second, sort.key)
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
    return sort.direction === 'asc' ? result : -result
  })
}

function sessionSortValue(row: SessionUsageMetric, key: SessionSortKey): string | number {
  if (key === 'timestamp') return Date.parse(row.timestamp || `${row.date}T00:00:00Z`) || 0
  return row[key] ?? ''
}

function estimateReportCost(rows: Array<UsageMetric & { model: string }>): number {
  return rows.reduce((total, row) => total + estimateModelCost(row), 0)
}

function estimateModelCost(row: UsageMetric & { model: string }): number {
  const price = lookupPrice(row.model)
  if (!price) return 0
  return row.input_tokens / 1_000_000 * price.input + row.output_tokens / 1_000_000 * price.output
}

function lookupPrice(model: string): ModelPrice | null {
  const normalized = model.toLowerCase()
  const key = Object.keys(MODEL_PRICES_PER_MILLION).find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`))
  return key ? MODEL_PRICES_PER_MILLION[key] : null
}

function formatCurrency(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits }).format(value || 0)
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

function formatTimestamp(timestamp: string | undefined, fallbackDate: string): string {
  const value = timestamp ? new Date(timestamp) : new Date(`${fallbackDate}T00:00:00Z`)
  if (Number.isNaN(value.getTime())) return formatDate(fallbackDate)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value)
}

function formatSessionLabel(row: SessionUsageMetric): string {
  const vertical = titleCase(row.vertical || firstSessionSegment(row.session_id) || 'session')
  const rounds = sessionRounds(row.session_id)
  return rounds ? `${vertical} · ${rounds}` : `${vertical} · First list`
}

function firstSessionSegment(value: string): string {
  return value.split('-')[0] || ''
}

function sessionRounds(value: string): string {
  const matches = [...value.matchAll(/_r(\d+)/g)].map((match) => Number(match[1])).filter(Boolean)
  if (!matches.length) return ''
  const first = Math.min(...matches)
  const last = Math.max(...matches)
  if (first === last) return `Round ${first}`
  return `Rounds ${first}–${last}`
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function shortSessionId(value: string): string {
  if (value.length <= 20) return value
  return `${value.slice(0, 12)}…${value.slice(-5)}`
}
