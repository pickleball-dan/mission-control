import { useCallback, useEffect, useState } from 'react'
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

import { fetchUsageReport, TelemetryError, type UsageMetric, type UsageReport } from './telemetryApi'
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
  const totalCost = report ? estimateReportCost(report.requests_by_model) : 0
  const averageCost = report?.summary.request_count ? totalCost / report.summary.request_count : 0
  const projectedMonthlyCost = days ? totalCost / days * 30 : 0

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
              <UsageCard icon={<DollarSign size={20} />} label={`Estimated cost (${days} days)`} value={formatCurrency(totalCost)} />
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
              <UsageBreakdown title="Usage by request type" labelKey="request_type" rows={report.requests_by_request_type} />
              <DailyUsage rows={report.requests_by_day} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function TelemetryControls({ days, setDays, session, loadReport }: { days: number; setDays: (value: number) => void; session: TelemetrySession | null; loadReport: (session: TelemetrySession) => Promise<void> }) {
  return <div className="telemetry-controls"><label><CalendarDays size={17} /><span>Reporting window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>{session && <button className="secondary-button" onClick={() => void loadReport(session)}><RefreshCw size={16} /> Refresh</button>}</div>
}

function UsageCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="usage-card"><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>
}

function ModelCostTable({ rows }: { rows: Array<UsageMetric & { model: string }> }) {
  return <article className="telemetry-panel telemetry-panel-wide"><div className="panel-heading"><div><p className="eyebrow">Cost</p><h2>Estimated cost by model</h2></div></div><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Model</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Estimated cost</th></tr></thead><tbody>{rows.map((row) => <tr key={row.model}><td>{row.model}</td><td>{formatNumber(row.request_count)}</td><td>{formatNumber(row.input_tokens)}</td><td>{formatNumber(row.output_tokens)}</td><td>{formatCurrency(estimateModelCost(row))}</td></tr>)}</tbody></table></div></article>
}

function UsageBreakdown({ title, rows, labelKey }: { title: string; rows: Array<UsageMetric & Record<string, string | number>>; labelKey: string }) {
  return <article className="telemetry-panel"><div className="panel-heading"><div><p className="eyebrow">Distribution</p><h2>{title}</h2></div></div><div className="compact-rows">{rows.map((row) => <div key={String(row[labelKey])}><span>{String(row[labelKey])}<small>{formatNumber(row.total_tokens)} tokens</small></span><strong>{formatNumber(row.request_count)}</strong></div>)}</div></article>
}

function DailyUsage({ rows }: { rows: Array<UsageMetric & { date: string }> }) {
  return <article className="telemetry-panel telemetry-panel-wide"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Daily usage</h2></div></div><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Date</th><th>Requests</th><th>Total tokens</th><th>Avg. latency</th></tr></thead><tbody>{[...rows].reverse().slice(0, 14).map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{formatNumber(row.request_count)}</td><td>{formatNumber(row.total_tokens)}</td><td>{formatLatency(row.average_latency_ms)}</td></tr>)}</tbody></table></div></article>
}

function StatePanel({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="telemetry-state"><div className="telemetry-state-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</section>
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
