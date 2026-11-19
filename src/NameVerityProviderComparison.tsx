import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BadgeCheck,
  CircleOff,
  Clock3,
  Coins,
  FlaskConical,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
  Zap,
} from 'lucide-react'

import {
  fetchProviderComparison,
  runProviderComparison,
  TelemetryError,
  type ComparisonPack,
  type ProviderId,
  type ProviderOption,
  type ProviderComparisonMetric,
  type ProviderComparisonSummary,
} from './telemetryApi'
import {
  beginGoogleSignIn,
  completeGoogleSignIn,
  signOutTelemetry,
  telemetryPublicConfig,
  type TelemetrySession,
} from './telemetryAuth'

type ViewState = 'checking' | 'signed_out' | 'loading' | 'ready' | 'empty' | 'unauthorized' | 'unavailable'

export default function NameVerityProviderComparison() {
  const [session, setSession] = useState<TelemetrySession | null>(null)
  const [summary, setSummary] = useState<ProviderComparisonSummary | null>(null)
  const [view, setView] = useState<ViewState>('checking')
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)
  const [pack, setPack] = useState<ComparisonPack>('smoke')
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([])
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(['openai', 'xai'])
  const [repetitions, setRepetitions] = useState(1)

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

  const loadComparison = useCallback(async (activeSession: TelemetrySession) => {
    setView('loading')
    setMessage('')
    try {
      const response = await fetchProviderComparison(activeSession)
      setProviderOptions(response.providers ?? response.summary?.provider_catalog ?? [])
      setSummary(response.summary)
      setView(response.available && response.summary ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof TelemetryError && error.kind === 'unauthorized') {
        setView('unauthorized')
        setMessage('This Google account is not authorized to view provider comparisons.')
      } else {
        setView('unavailable')
        setMessage(error instanceof TelemetryError && error.kind === 'timeout'
          ? 'The provider comparison took too long to respond.'
          : 'Provider comparison data is temporarily unavailable.')
      }
    }
  }, [])

  useEffect(() => {
    if (session) void loadComparison(session)
  }, [session, loadComparison])

  const signOut = () => {
    signOutTelemetry()
    setSession(null)
    setSummary(null)
    setMessage('')
    setView('signed_out')
  }

  const runComparison = async () => {
    if (!session || running) return
    if (selectedProviders.length < 2) {
      setMessage('Select at least two configured providers.')
      return
    }
    const providerLabel = selectedProviders.map(providerName).join(', ')
    if (!window.confirm(`Run ${providerLabel} side by side across the ${pack} synthetic Baby journey pack, ${repetitions} time${repetitions === 1 ? '' : 's'}? This makes live paid API calls and may take several minutes.`)) return
    setRunning(true)
    setMessage(`Running the same NameVerity prompts through ${providerLabel}…`)
    try {
      const response = await runProviderComparison(session, { pack, vertical: 'baby', providers: selectedProviders, repetitions })
      setSummary(response.summary)
      setView('ready')
      setMessage('Comparison completed.')
    } catch (error) {
      setMessage(error instanceof TelemetryError && error.kind === 'timeout'
        ? 'The comparison did not finish within the allowed time.'
        : 'The comparison could not run. Check the NameVerity provider configuration and try again.')
    } finally {
      setRunning(false)
    }
  }

  const configured = Boolean(telemetryPublicConfig())

  return (
    <div className="app-shell telemetry-shell">
      <aside className="sidebar">
        <div className="brand-mark">MC</div>
        <div className="brand-copy"><strong>Mission Control</strong><span>Portfolio OS</span></div>
        <nav>
          <a className="nav-item nav-link" href="/"><LayoutDashboard size={18} /> Overview</a>
          <a className="nav-item nav-link" href="/#projects"><Target size={18} /> Projects</a>
          <a className="nav-item nav-link" href="/operating-pulse"><Activity size={18} /> Operating pulse</a>
          <a className="nav-item nav-link" href="/namengine/generation-qa"><Sparkles size={18} /> Generation QA</a>
          <a className="nav-item nav-link active" href="/nameverity/provider-comparison"><FlaskConical size={18} /> AI comparison</a>
        </nav>
        <div className="sidebar-note"><BadgeCheck size={18} /><div><strong>Controlled comparison</strong><span>Synthetic fixtures, identical prompts, aggregate results.</span></div></div>
      </aside>

      <main>
        <header className="topbar telemetry-topbar">
          <div>
            <p className="eyebrow">NameVerity engine lab</p>
            <h1>AI provider comparison</h1>
            <p>Select two or more providers and compare them with the exact same production-shaped prompt and synthetic intake journey.</p>
          </div>
          <div className="telemetry-actions">
            {session && <span className="signed-in-user">{session.email}</span>}
            {session && <button className="secondary-button" onClick={signOut}><LogOut size={17} /> Sign out</button>}
          </div>
        </header>

        {(view === 'checking' || view === 'loading') && <StatePanel icon={<RefreshCw className="spin" size={24} />} title="Loading comparison" copy="Connecting securely to NameVerity…" />}
        {view === 'signed_out' && <StatePanel icon={<LogIn size={24} />} title="Sign in to compare providers" copy="Use an approved Google account. Mission Control stores no provider or service credentials." action={<button className="primary-button" disabled={!configured} onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Continue with Google</button>} />}
        {view === 'unauthorized' && <StatePanel icon={<CircleOff size={24} />} title="Access not available" copy={message || 'This Google account is not authorized.'} action={<button className="primary-button" onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Try another account</button>} />}
        {view === 'unavailable' && <StatePanel icon={<TriangleAlert size={24} />} title="Comparison unavailable" copy={message} action={session && <button className="primary-button" onClick={() => void loadComparison(session)}><RefreshCw size={18} /> Try again</button>} />}

        {(view === 'empty' || view === 'ready') && (
          <>
            <ComparisonControls pack={pack} setPack={setPack} providerOptions={providerOptions} selectedProviders={selectedProviders} setSelectedProviders={setSelectedProviders} repetitions={repetitions} setRepetitions={setRepetitions} running={running} onRun={runComparison} onRefresh={() => session && loadComparison(session)} />
            {running && <div className="generation-qa-status-bar" aria-label="Provider comparison in progress"><div /></div>}
            {message && <p className="generation-qa-run-message">{message}</p>}
            {view === 'empty' && <StatePanel icon={<FlaskConical size={24} />} title="No comparison run yet" copy="Run the first controlled test using synthetic Baby fixtures. No customer data is used." />}
            {view === 'ready' && summary && <ComparisonReport summary={summary} />}
          </>
        )}
      </main>
    </div>
  )
}

function ComparisonControls({ pack, setPack, providerOptions, selectedProviders, setSelectedProviders, repetitions, setRepetitions, running, onRun, onRefresh }: {
  pack: ComparisonPack
  setPack: (value: ComparisonPack) => void
  providerOptions: ProviderOption[]
  selectedProviders: ProviderId[]
  setSelectedProviders: (value: ProviderId[]) => void
  repetitions: number
  setRepetitions: (value: number) => void
  running: boolean
  onRun: () => Promise<void>
  onRefresh: () => void | Promise<void> | null
}) {
  const options = providerOptions.length ? providerOptions : [
    { id: 'openai' as const, label: 'ChatGPT / OpenAI', model: '', configured: true },
    { id: 'claude' as const, label: 'Claude / Anthropic', model: '', configured: false },
    { id: 'xai' as const, label: 'Grok / xAI', model: '', configured: true },
  ]
  const toggleProvider = (provider: ProviderId) => {
    setSelectedProviders(selectedProviders.includes(provider)
      ? selectedProviders.filter((item) => item !== provider)
      : [...selectedProviders, provider])
  }
  return <div className="telemetry-controls comparison-controls"><div><strong>Controlled live test</strong><span>Production-shaped synthetic intake only; no customer information or generated names leave NameVerity.</span><div className="provider-selector" aria-label="Providers to compare">{options.map((option) => <label key={option.id} title={option.configured ? option.model : 'Provider key is not configured'}><input type="checkbox" checked={selectedProviders.includes(option.id)} disabled={running || !option.configured} onChange={() => toggleProvider(option.id)} /> {option.label}{!option.configured ? ' · unavailable' : ''}</label>)}</div></div><div className="telemetry-actions"><label>Journey pack<select value={pack} disabled={running} onChange={(event) => setPack(event.target.value as ComparisonPack)}><option value="smoke">Smoke · 3 deep journeys</option><option value="standard">Standard · 8 deep journeys</option><option value="full">Full · all Baby journeys</option></select></label><label>Repetitions<select value={repetitions} disabled={running} onChange={(event) => setRepetitions(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><button className="secondary-button" disabled={running} onClick={onRefresh}><RefreshCw size={16} /> Refresh</button><button className="primary-button" disabled={running || selectedProviders.length < 2} onClick={() => void onRun()}><PlayCircle size={18} /> {running ? 'Running…' : 'Run comparison'}</button></div></div>
}

function ComparisonReport({ summary }: { summary: ProviderComparisonSummary }) {
  return <>
    <section className="telemetry-metrics" aria-label="Provider comparison summary">
      <UsageCard icon={<BadgeCheck size={20} />} label="Prompt match" value={summary.prompt_equivalence_verified ? 'Verified' : 'Review'} alert={!summary.prompt_equivalence_verified} />
      <UsageCard icon={<FlaskConical size={20} />} label="Paired comparisons" value={formatNumber(summary.comparison_count)} />
      <UsageCard icon={<Clock3 size={20} />} label="Fastest average" value={fastestProvider(summary.provider_summary)} />
      <UsageCard icon={<Coins size={20} />} label="Combined est. cost" value={formatCurrency(summary.provider_summary.reduce((total, row) => total + row.estimated_cost_usd, 0), 4)} />
    </section>

    <section className="telemetry-grid comparison-grid">
      <ProviderCards rows={summary.provider_summary} />
      <article className="telemetry-panel telemetry-panel-wide">
        <div className="panel-heading"><div><p className="eyebrow">Side by side</p><h2>Aggregate provider metrics</h2></div><span>{summary.pack} · {summary.fixture_count} journeys · {summary.repetitions} repetition{summary.repetitions === 1 ? '' : 's'}</span></div>
        <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Provider</th><th>Completed</th><th>Avg. latency</th><th>Tokens</th><th>Est. cost</th><th>Candidates / target</th><th>Duplicates</th><th>Avoid hits</th></tr></thead><tbody>{summary.provider_summary.map((row) => <tr key={row.provider}><td><strong>{providerName(row.provider)}</strong><small className="table-subtitle">{row.model}</small></td><td>{row.completed_count} / {row.run_count}</td><td>{formatLatency(row.average_latency_ms)}</td><td>{formatNumber(row.total_tokens)}</td><td>{formatCurrency(row.estimated_cost_usd, 4)}</td><td>{formatNumber(row.candidate_count)} / {formatNumber(row.target_candidate_count)} <small className="table-subtitle">{formatScore(row.candidate_target_rate * 100)}%</small></td><td>{formatNumber(row.duplicate_count)}</td><td>{formatNumber(row.avoid_hit_count)}</td></tr>)}</tbody></table></div>
      </article>

      <article className="telemetry-panel telemetry-panel-wide">
        <div className="panel-heading"><div><p className="eyebrow">Model self-scoring</p><h2>Average candidate scores</h2></div><span>Directional, not a final winner</span></div>
        <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Provider</th><th>Taste fit</th><th>Usability</th><th>Distinctiveness</th></tr></thead><tbody>{summary.provider_summary.map((row) => <tr key={row.provider}><td><strong>{providerName(row.provider)}</strong></td><td>{formatScore(row.average_taste_fit)}</td><td>{formatScore(row.average_usability)}</td><td>{formatScore(row.average_distinctiveness)}</td></tr>)}</tbody></table></div>
        <p className="comparison-caveat">These are model-generated rubric scores. Use a blinded human review before deciding which provider produces better names.</p>
      </article>

      <article className="telemetry-panel telemetry-panel-wide">
        <div className="panel-heading"><div><p className="eyebrow">Fixture detail</p><h2>Paired run performance</h2></div><span>{formatTimestamp(summary.created_at)}</span></div>
        <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Journey</th><th>Rep.</th><th>Prompt</th>{summary.providers.map((provider) => <th key={`${provider}-latency`}>{providerName(provider)} latency</th>)}{summary.providers.map((provider) => <th key={`${provider}-candidates`}>{providerName(provider)} candidates</th>)}</tr></thead><tbody>{summary.comparisons.map((row) => <tr key={`${row.fixture_id}-${row.repetition}`}><td>{row.fixture_label}<small className="table-subtitle">{row.expected_signal_count} intent signals</small></td><td>{row.repetition}</td><td>{row.prompt_equivalence_verified ? 'Matched' : 'Review'}</td>{summary.providers.map((provider) => <td key={`${provider}-latency`}>{formatLatency(row.providers[provider]?.latency_ms ?? 0)}</td>)}{summary.providers.map((provider) => <td key={`${provider}-candidates`}>{formatNumber(row.providers[provider]?.candidate_count ?? 0)} / {formatNumber(row.target_candidate_count)}</td>)}</tr>)}</tbody></table></div>
      </article>
    </section>
  </>
}

function ProviderCards({ rows }: { rows: ProviderComparisonMetric[] }) {
  return <div className="provider-card-grid telemetry-panel-wide">{rows.map((row) => <article className="provider-card" key={row.provider}><div className="provider-card-heading"><div><p className="eyebrow">{providerCompany(row.provider)}</p><h2>{providerName(row.provider)}</h2></div><Zap size={22} /></div><p>{row.model}</p><dl><div><dt>Completion</dt><dd>{formatPercent(row.completion_rate)}</dd></div><div><dt>Average latency</dt><dd>{formatLatency(row.average_latency_ms)}</dd></div><div><dt>Candidate target</dt><dd>{formatScore(row.candidate_target_rate * 100)}%</dd></div><div><dt>Total tokens</dt><dd>{formatNumber(row.total_tokens)}</dd></div><div><dt>Estimated cost</dt><dd>{formatCurrency(row.estimated_cost_usd, 4)}</dd></div></dl></article>)}</div>
}

function UsageCard({ icon, label, value, alert = false }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return <article className={`usage-card${alert ? ' usage-card-alert' : ''}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>
}

function StatePanel({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="telemetry-state"><div className="telemetry-state-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</section>
}

function providerName(value: ProviderId): string {
  if (value === 'xai') return 'Grok / xAI'
  if (value === 'claude') return 'Claude / Anthropic'
  return 'ChatGPT / OpenAI'
}
function providerCompany(value: ProviderId): string { return value === 'xai' ? 'xAI' : value === 'claude' ? 'Anthropic' : 'OpenAI' }
function formatNumber(value: number): string { return new Intl.NumberFormat('en-US').format(value || 0) }
function formatPercent(value: number): string { return `${Number(value || 0).toFixed(1)}%` }
function formatScore(value: number): string { return Number(value || 0).toFixed(2) }
function formatCurrency(value: number, digits = 2): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value || 0) }
function formatLatency(value: number): string { return value >= 1_000 ? `${(value / 1_000).toFixed(1)}s` : `${Math.round(value || 0)}ms` }
function formatTimestamp(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Latest run' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
function fastestProvider(rows: ProviderComparisonMetric[]): string {
  const completed = rows.filter((row) => row.completed_count > 0 && row.average_latency_ms > 0)
  if (!completed.length) return '—'
  return providerName([...completed].sort((left, right) => left.average_latency_ms - right.average_latency_ms)[0].provider)
}
