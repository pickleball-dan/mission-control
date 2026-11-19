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
  type ProviderComparisonCandidate,
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
type RunAttempt = {
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  finishedAt?: string
  message: string
}

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
  const [runAttempt, setRunAttempt] = useState<RunAttempt | null>(null)

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
    setMessage('')
    const startedAt = new Date().toISOString()
    setRunAttempt({
      status: 'running',
      startedAt,
      message: `Running the same NameVerity prompts through ${providerLabel}.`,
    })
    try {
      const response = await runProviderComparison(session, { pack, vertical: 'baby', providers: selectedProviders, repetitions })
      setSummary(response.summary)
      setView('ready')
      setRunAttempt({
        status: 'completed',
        startedAt,
        finishedAt: new Date().toISOString(),
        message: 'Comparison completed successfully. The results below are from this attempt.',
      })
    } catch (error) {
      setRunAttempt({
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        message: error instanceof TelemetryError && error.kind === 'timeout'
          ? 'The comparison did not finish within the allowed time.'
          : 'The comparison request failed before a new result was saved.',
      })
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
            {runAttempt && <RunAttemptNotice attempt={runAttempt} summary={summary} />}
            {!runAttempt && message && <p className="generation-qa-run-message">{message}</p>}
            {view === 'empty' && <StatePanel icon={<FlaskConical size={24} />} title="No comparison run yet" copy="Run the first controlled test using synthetic Baby fixtures. No customer data is used." />}
            {view === 'ready' && summary && <ComparisonReport summary={summary} />}
          </>
        )}
      </main>
    </div>
  )
}

function RunAttemptNotice({ attempt, summary }: { attempt: RunAttempt; summary: ProviderComparisonSummary | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (attempt.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [attempt.status])
  const started = new Date(attempt.startedAt).getTime()
  const elapsedSeconds = Math.max(0, Math.floor(((attempt.finishedAt ? new Date(attempt.finishedAt).getTime() : now) - started) / 1000))
  return <section className={`run-attempt-notice is-${attempt.status}`} role="status">
    <div><strong>{attempt.status === 'running' ? 'Comparison running' : attempt.status === 'completed' ? 'Comparison completed' : 'Comparison failed'}</strong><span>{attempt.message}</span></div>
    <dl><div><dt>Started</dt><dd>{formatTimestamp(attempt.startedAt)}</dd></div>{attempt.finishedAt && <div><dt>{attempt.status === 'failed' ? 'Failed' : 'Completed'}</dt><dd>{formatTimestamp(attempt.finishedAt)}</dd></div>}<div><dt>Duration</dt><dd>{formatDuration(elapsedSeconds)}</dd></div>{attempt.status === 'failed' && summary && <div><dt>Results still shown</dt><dd>{formatTimestamp(summary.created_at)}</dd></div>}</dl>
  </section>
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
  const selectedLabels = options.filter((option) => selectedProviders.includes(option.id)).map((option) => option.label)
  return <div className="telemetry-controls comparison-controls"><div><strong>Controlled live test</strong><span>Production-shaped synthetic intake only. Prompts and generated names appear below for human review; no customer sessions are used.</span></div><div className="telemetry-actions"><details className="provider-multiselect"><summary><span>Providers</span><strong>{selectedLabels.join(', ') || 'Choose providers'}</strong></summary><div className="provider-dropdown" aria-label="Providers to compare">{options.map((option) => { const selected = selectedProviders.includes(option.id); const minimumSelected = selected && selectedProviders.length <= 2; return <label key={option.id} title={option.configured ? option.model : 'Provider key is not configured'}><input type="checkbox" checked={selected} disabled={running || !option.configured || minimumSelected} onChange={() => toggleProvider(option.id)} /><span><strong>{option.label}</strong><small>{option.configured ? option.model : 'Unavailable'}</small></span></label> })}<p>Select at least two providers.</p></div></details><label>Journey pack<select value={pack} disabled={running} onChange={(event) => setPack(event.target.value as ComparisonPack)}><option value="smoke">Smoke · 3 deep journeys</option><option value="standard">Standard · 8 deep journeys</option><option value="full">Full · all Baby journeys</option></select></label><label>Repetitions<select value={repetitions} disabled={running} onChange={(event) => setRepetitions(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><button className="secondary-button" disabled={running} onClick={onRefresh}><RefreshCw size={16} /> Refresh</button><button className="primary-button" disabled={running || selectedProviders.length < 2} onClick={() => void onRun()}><PlayCircle size={18} /> {running ? 'Running…' : 'Run comparison'}</button></div></div>
}

function ComparisonReport({ summary }: { summary: ProviderComparisonSummary }) {
  return <>
    <section className="results-provenance"><BadgeCheck size={18} /><div><strong>Showing last successful comparison</strong><span>Completed {formatTimestamp(summary.created_at)} · Run ID {summary.run_id}</span></div></section>
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
        <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Provider</th><th>Completed</th><th>Avg. latency</th><th>Tokens</th><th>Est. cost</th><th>Candidates / target</th><th>Duplicates</th><th>Avoid hits</th></tr></thead><tbody>{summary.provider_summary.map((row) => { const partial = row.completed_count < row.run_count; return <tr className={partial ? 'provider-row-partial' : ''} key={row.provider}><td><strong>{providerName(row.provider)}</strong><small className="table-subtitle">{row.model}</small></td><td><span className={`completion-status${partial ? ' is-partial' : ''}`}>{row.completed_count} / {row.run_count}{partial ? ' · Partial' : ''}</span></td><td>{formatLatency(row.average_latency_ms)}</td><td>{formatNumber(row.total_tokens)}</td><td>{formatCurrency(row.estimated_cost_usd, 4)}</td><td>{formatNumber(row.candidate_count)} / {formatNumber(row.target_candidate_count)} <small className="table-subtitle">{formatScore(row.candidate_target_rate * 100)}%</small></td><td>{formatNumber(row.duplicate_count)}</td><td>{formatNumber(row.avoid_hit_count)}</td></tr> })}</tbody></table></div>
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

      <BlindQualityReview summary={summary} />
    </section>
  </>
}

type ReviewRatings = Record<string, number>

function BlindQualityReview({ summary }: { summary: ProviderComparisonSummary }) {
  const storageKey = `nameverity-provider-review:${summary.run_id}`
  const [blind, setBlind] = useState(true)
  const [ratings, setRatings] = useState<ReviewRatings>(() => {
    try { return JSON.parse(window.localStorage.getItem(storageKey) || '{}') as ReviewRatings } catch { return {} }
  })
  const providerAliases = Object.fromEntries(summary.providers.map((provider, index) => [provider, `Provider ${String.fromCharCode(65 + index)}`])) as Record<ProviderId, string>
  const setRating = (key: string, value: number) => {
    const next = { ...ratings, [key]: value }
    setRatings(next)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  }
  const averages = summary.providers.map((provider) => {
    const values = Object.entries(ratings).filter(([key]) => key.endsWith(`:${provider}`)).map(([, value]) => value)
    return { provider, average: values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0, count: values.length }
  })
  return <article className="telemetry-panel telemetry-panel-wide quality-review-panel">
    <div className="panel-heading"><div><p className="eyebrow">Human review</p><h2>Review actual generated names</h2></div><label className="blind-toggle"><input type="checkbox" checked={blind} onChange={(event) => setBlind(event.target.checked)} /> Hide provider identity</label></div>
    <p className="comparison-caveat">Rate each complete name set from 1 (weak) to 5 (excellent). Ratings are saved in this browser for this run. All prompts and names below come from synthetic test journeys.</p>
    {averages.some((row) => row.count) && <div className="review-summary">{averages.map((row) => <span key={row.provider}><strong>{blind ? providerAliases[row.provider] : providerName(row.provider)}</strong>{row.count ? `${row.average.toFixed(1)} / 5 · ${row.count} rated` : 'Not rated'}</span>)}</div>}
    <div className="review-journeys">{summary.comparisons.map((comparison) => {
      const prompt = (summary.fixture_prompts ?? []).find((item) => item.fixture_id === comparison.fixture_id)
      return <section className="review-journey" key={`${comparison.fixture_id}-${comparison.repetition}`}>
        <div className="review-journey-heading"><div><strong>{comparison.fixture_label}</strong><span>Repetition {comparison.repetition} · exact canonical prompt matched</span></div>{prompt && <details><summary>View synthetic prompt</summary><pre>{JSON.stringify(prompt.prompt, null, 2)}</pre></details>}</div>
        <div className="review-provider-grid">{summary.providers.map((provider) => {
          const result = comparison.providers[provider]
          const ratingKey = `${comparison.fixture_id}:${comparison.repetition}:${provider}`
          return <section className={`review-provider${result?.completed ? '' : ' is-incomplete'}`} key={provider}>
            <div className="review-provider-heading"><div><p className="eyebrow">{blind ? providerAliases[provider] : providerName(provider)}</p>{!blind && <span>{result?.model}</span>}</div><label>Quality score<select value={ratings[ratingKey] ?? ''} onChange={(event) => setRating(ratingKey, Number(event.target.value))}><option value="" disabled>Rate 1–5</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
            {result?.completed ? <div className="candidate-review-list">{(result.candidates ?? []).map((candidate, index) => <CandidateReviewCard candidate={candidate} index={index} key={`${candidate.name}-${index}`} />)}</div> : <p className="provider-failure-copy"><strong>Journey incomplete</strong>{result?.error_reason || result?.error_type || 'Provider generation failed'}</p>}
          </section>
        })}</div>
      </section>
    })}</div>
  </article>
}

function CandidateReviewCard({ candidate, index }: { candidate: ProviderComparisonCandidate; index: number }) {
  return <details className="candidate-review-card"><summary><span>{index + 1}</span><h3>{candidate.name}</h3>{candidate.pronunciation && <small>{candidate.pronunciation}</small>}<em>Details</em></summary><div className="candidate-review-details">{candidate.territory && <p className="candidate-territory">{candidate.territory}</p>}{candidate.rationale && <p>{candidate.rationale}</p>}{(candidate.strengths ?? []).length > 0 && <p><strong>Strengths:</strong> {candidate.strengths.join(' · ')}</p>}{(candidate.risks ?? []).length > 0 && <p><strong>Risks:</strong> {candidate.risks.join(' · ')}</p>}</div></details>
}

function ProviderCards({ rows }: { rows: ProviderComparisonMetric[] }) {
  return <div className="provider-card-grid telemetry-panel-wide">{rows.map((row) => { const partial = row.completed_count < row.run_count; return <article className={`provider-card${partial ? ' is-partial' : ''}`} key={row.provider}><div className="provider-card-heading"><div><p className="eyebrow">{providerCompany(row.provider)}</p><h2>{providerName(row.provider)}</h2></div><Zap size={22} /></div><p>{row.model}</p>{partial && <span className="provider-partial-alert">Partial result · {row.completed_count} of {row.run_count} journeys completed</span>}<dl><div><dt>Completion</dt><dd>{formatPercent(row.completion_rate)}</dd></div><div><dt>Average latency</dt><dd>{formatLatency(row.average_latency_ms)}</dd></div><div><dt>Candidate target</dt><dd>{formatScore(row.candidate_target_rate * 100)}%</dd></div><div><dt>Total tokens</dt><dd>{formatNumber(row.total_tokens)}</dd></div><div><dt>Estimated cost</dt><dd>{formatCurrency(row.estimated_cost_usd, 4)}</dd></div></dl></article> })}</div>
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
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}
function fastestProvider(rows: ProviderComparisonMetric[]): string {
  const completed = rows.filter((row) => row.completed_count > 0 && row.average_latency_ms > 0)
  if (!completed.length) return '—'
  return providerName([...completed].sort((left, right) => left.average_latency_ms - right.average_latency_ms)[0].provider)
}
