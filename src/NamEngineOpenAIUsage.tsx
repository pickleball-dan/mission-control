import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  Image,
  LayoutDashboard,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
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
          ? 'NamEngine telemetry took too long to respond.'
          : 'NamEngine telemetry is temporarily unavailable.')
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
          <a className="nav-item nav-link active" href="/namengine/openai-usage"><Activity size={18} /> OpenAI usage</a>
        </nav>
        <div className="sidebar-note">
          <Sparkles size={18} />
          <div><strong>Private telemetry</strong><span>Aggregates only. No customer data.</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar telemetry-topbar">
          <div>
            <p className="eyebrow">NamEngine operations</p>
            <h1>OpenAI usage</h1>
            <p>Request volume, token usage, reliability, and latency across NamEngine.</p>
          </div>
          <div className="telemetry-actions">
            {session && <span className="signed-in-user">{session.email}</span>}
            {session && <button className="secondary-button" onClick={signOut}><LogOut size={17} /> Sign out</button>}
          </div>
        </header>

        {(view === 'checking' || view === 'loading') && (
          <StatePanel icon={<RefreshCw className="spin" size={24} />} title="Loading telemetry" copy="Connecting securely to NamEngine…" />
        )}

        {view === 'signed_out' && (
          <StatePanel
            icon={<LogIn size={24} />}
            title="Sign in to view telemetry"
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
            copy={message || 'This Google account is not authorized to view telemetry.'}
            action={<button className="primary-button" onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Try another account</button>}
          />
        )}

        {view === 'unavailable' && (
          <StatePanel
            tone="warning"
            icon={<TriangleAlert size={24} />}
            title="Telemetry unavailable"
            copy={message}
            action={session && <button className="primary-button" onClick={() => void loadReport(session)}><RefreshCw size={18} /> Try again</button>}
          />
        )}

        {view === 'empty' && (
          <>
            <TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} />
            <StatePanel icon={<BarChart3 size={24} />} title="No usage in this period" copy="NamEngine returned a valid empty telemetry report. Try a longer date range." />
          </>
        )}

        {view === 'ready' && report && (
          <>
            <TelemetryControls days={days} setDays={setDays} session={session} loadReport={loadReport} />
            <section className="telemetry-metrics" aria-label="OpenAI usage summary">
              <UsageCard icon={<Zap size={20} />} label="Total requests" value={formatNumber(report.summary.request_count)} />
              <UsageCard icon={<CheckCircle2 size={20} />} label="Successful" value={formatNumber(report.summary.success_count)} />
              <UsageCard icon={<XCircle size={20} />} label="Failed" value={formatNumber(report.summary.failure_count)} tone="alert" />
              <UsageCard icon={<CheckCircle2 size={20} />} label="Success rate" value={`${report.summary.success_rate.toFixed(1)}%`} />
              <UsageCard icon={<Bot size={20} />} label="Total tokens" value={formatNumber(report.summary.total_tokens)} />
              <UsageCard icon={<Activity size={20} />} label="Input tokens" value={formatNumber(report.summary.input_tokens)} />
              <UsageCard icon={<Activity size={20} />} label="Output tokens" value={formatNumber(report.summary.output_tokens)} />
              <UsageCard icon={<Clock3 size={20} />} label="Average latency" value={formatLatency(report.summary.average_latency_ms)} />
              <UsageCard icon={<Image size={20} />} label="Image generations" value={formatNumber(report.summary.image_generation_count)} />
              <UsageCard icon={<CircleOff size={20} />} label="Token usage unavailable" value={formatNumber(report.summary.requests_missing_token_usage)} />
            </section>

            <section className="telemetry-grid">
              <UsageBreakdown title="Usage by model" labelKey="model" rows={report.requests_by_model} />
              <UsageBreakdown title="Usage by request type" labelKey="request_type" rows={report.requests_by_request_type} />
              <DailyUsage rows={report.requests_by_day} />
              <Failures rows={report.failures_by_error_type} />
              <SlowestCategories rows={report.slowest_request_categories} />
              <UnavailableUsage rows={report.requests_with_unavailable_token_usage} />
            </section>
          </>
        )}
      </main>
    </div>
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

function UsageCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'alert' }) {
  return (
    <article className={`usage-card${tone ? ` usage-card-${tone}` : ''}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function UsageBreakdown({
  title,
  rows,
  labelKey,
}: {
  title: string
  rows: Array<UsageMetric & Record<string, string | number>>
  labelKey: string
}) {
  const maximum = Math.max(...rows.map((row) => row.request_count), 1)
  return (
    <article className="telemetry-panel">
      <div className="panel-heading"><div><p className="eyebrow">Distribution</p><h2>{title}</h2></div><span>{rows.length} categories</span></div>
      <div className="usage-bars">
        {rows.map((row) => (
          <div className="usage-bar-row" key={String(row[labelKey])}>
            <div className="usage-bar-label"><strong>{String(row[labelKey])}</strong><span>{formatNumber(row.total_tokens)} tokens</span></div>
            <div className="usage-bar-track"><div style={{ width: `${Math.max(3, row.request_count / maximum * 100)}%` }} /></div>
            <span className="usage-bar-value">{formatNumber(row.request_count)}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function DailyUsage({ rows }: { rows: Array<UsageMetric & { date: string }> }) {
  return (
    <article className="telemetry-panel telemetry-panel-wide">
      <div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Daily usage</h2></div><span>{rows.length} active days</span></div>
      <div className="usage-table-wrap">
        <table className="usage-table">
          <thead><tr><th>Date</th><th>Requests</th><th>Successful</th><th>Failed</th><th>Total tokens</th><th>Avg. latency</th></tr></thead>
          <tbody>
            {[...rows].reverse().slice(0, 14).map((row) => (
              <tr key={row.date}>
                <td>{formatDate(row.date)}</td>
                <td>{formatNumber(row.request_count)}</td>
                <td>{formatNumber(row.success_count)}</td>
                <td>{formatNumber(row.failure_count)}</td>
                <td>{formatNumber(row.total_tokens)}</td>
                <td>{formatLatency(row.average_latency_ms)}</td>
              </tr>
            ))}
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

function SlowestCategories({ rows }: { rows: UsageReport['slowest_request_categories'] }) {
  return (
    <article className="telemetry-panel">
      <div className="panel-heading"><div><p className="eyebrow">Performance</p><h2>Slowest request categories</h2></div></div>
      {rows.length ? <div className="compact-rows">{rows.slice(0, 8).map((row) => (
        <div key={row.category}><span>{row.category}<small>{formatNumber(row.request_count)} requests</small></span><strong>{formatLatency(row.average_latency_ms)}</strong></div>
      ))}</div> : <EmptyPanelCopy>No latency data in this period.</EmptyPanelCopy>}
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

function EmptyPanelCopy({ children }: { children: React.ReactNode }) {
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
  icon: React.ReactNode
  title: string
  copy: string
  action?: React.ReactNode
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
