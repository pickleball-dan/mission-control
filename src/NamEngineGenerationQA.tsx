import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  CircleOff,
  Clock3,
  LayoutDashboard,
  LogIn,
  Target,
  LogOut,
  PlayCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react'

import {
  fetchGenerationQAReport,
  fetchGenerationQAStatus,
  runGenerationQA,
  TelemetryError,
  type GenerationQAReport,
  type GenerationQARunMode,
  type GenerationQAScenario,
  type GenerationQAStatus,
} from './telemetryApi'
import {
  beginGoogleSignIn,
  completeGoogleSignIn,
  signOutTelemetry,
  telemetryPublicConfig,
  type TelemetrySession,
} from './telemetryAuth'

type ViewState = 'checking' | 'signed_out' | 'loading' | 'ready' | 'empty' | 'unauthorized' | 'unavailable'
type RunState = 'idle' | 'running'
type SelectedRun = 'fast-fallback' | 'full-fallback' | 'fast-openai' | 'full-openai' | null

export default function NamEngineGenerationQA() {
  const [session, setSession] = useState<TelemetrySession | null>(null)
  const [status, setStatus] = useState<GenerationQAStatus | null>(null)
  const [view, setView] = useState<ViewState>('checking')
  const [message, setMessage] = useState('')
  const [runState, setRunState] = useState<RunState>('idle')
  const [runMessage, setRunMessage] = useState('')
  const [selectedRun, setSelectedRun] = useState<SelectedRun>(null)
  const [report, setReport] = useState<GenerationQAReport | null>(null)
  const [runPage, setRunPage] = useState(() => window.location.pathname.replace(/\/$/, '') === '/namengine/generation-qa/run')

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

  const loadStatus = useCallback(async (activeSession: TelemetrySession) => {
    setView('loading')
    setMessage('')
    try {
      const nextStatus = await fetchGenerationQAStatus(activeSession)
      setStatus(nextStatus)
      setView(nextStatus.available && nextStatus.summary ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof TelemetryError && error.kind === 'unauthorized') {
        setView('unauthorized')
        setMessage('This Google account is not authorized to view NamEngine Generation QA.')
      } else {
        setView('unavailable')
        setMessage(error instanceof TelemetryError && error.kind === 'timeout'
          ? 'NamEngine Generation QA took too long to respond.'
          : 'NamEngine Generation QA is temporarily unavailable.')
      }
    }
  }, [])

  const loadReport = useCallback(async (activeSession: TelemetrySession) => {
    setView('loading')
    setMessage('')
    try {
      const nextReport = await fetchGenerationQAReport(activeSession)
      setReport(nextReport)
      setStatus(nextReport)
      setView(nextReport.available && nextReport.summary ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof TelemetryError && error.kind === 'unauthorized') {
        setView('unauthorized')
        setMessage('This Google account is not authorized to view NamEngine Generation QA.')
      } else {
        setView('unavailable')
        setMessage(error instanceof TelemetryError && error.kind === 'timeout'
          ? 'NamEngine Generation QA took too long to respond.'
          : 'NamEngine Generation QA report is temporarily unavailable.')
      }
    }
  }, [])

  useEffect(() => {
    if (!session) return
    if (runPage) void loadReport(session)
    else void loadStatus(session)
  }, [session, runPage, loadReport, loadStatus])

  const signOut = () => {
    signOutTelemetry()
    setSession(null)
    setStatus(null)
    setMessage('')
    setRunMessage('')
    setView('signed_out')
  }

  const runQA = async (mode: GenerationQARunMode, useAi = false) => {
    if (!session || runState === 'running') return
    if (useAi) {
      const modeLabel = mode === 'fast' ? 'FAST' : 'FULL'
      const scope = mode === 'fast' ? 'the fast scenario set' : 'every full-run scenario'
      if (!window.confirm(`Run a ${modeLabel} OpenAI Generation QA now? This will call OpenAI for ${scope} and may take several minutes.`)) return
    }
    const runLabel = `${mode === 'fast' ? 'Fast' : 'Full'} ${useAi ? 'OpenAI' : 'fallback'}`
    setSelectedRun(`${mode}-${useAi ? 'openai' : 'fallback'}`)
    if (!runPage) {
      window.history.pushState(null, '', '/namengine/generation-qa/run')
      setRunPage(true)
    }
    setRunState('running')
    setRunMessage(`${runLabel} run started…`)
    try {
      const response = await runGenerationQA(session, { mode, useAi, confirmAi: useAi })
      const completedStatus = {
        available: true,
        summary: response.summary,
        summary_path: response.summary_path || response.summary.summary_path,
        report_path: response.report_path || response.summary.report_path,
        results_path: response.results_path || response.summary.results_path,
      }
      setStatus(completedStatus)
      setView('ready')
      try {
        const refreshedReport = await fetchGenerationQAReport(session)
        if (refreshedReport.available && refreshedReport.summary) {
          setReport(refreshedReport)
          setStatus(refreshedReport)
        }
      } catch {
        // Keep the completed run response visible if the follow-up report refresh is unavailable.
      }
      setRunMessage(`${runLabel} run completed.`)
    } catch (error) {
      setRunMessage(error instanceof TelemetryError && error.kind === 'timeout'
        ? 'Generation QA timed out before Mission Control received a response.'
        : 'Generation QA could not run. Try again after NamEngine finishes deploying.')
    } finally {
      setRunState('idle')
    }
  }

  const configured = Boolean(telemetryPublicConfig())
  const summary = status?.summary ?? null
  const anomalyCount = summary?.anomaly_count ?? 0
  const criticalAnomalies = summary?.critical_anomaly_count ?? 0
  const majorAnomalies = summary?.major_anomaly_count ?? 0
  const passedCount = summary?.passed_count ?? 0
  const scenarioCount = summary?.scenario_count ?? 0

  return (
    <div className="app-shell telemetry-shell">
      <aside className="sidebar">
        <div className="brand-mark">MC</div>
        <div className="brand-copy"><strong>Mission Control</strong><span>Portfolio OS</span></div>
        <nav>
          <a className="nav-item nav-link" href="/"><LayoutDashboard size={18} /> Overview</a>
          <a className="nav-item nav-link" href="/#projects"><Target size={18} /> Projects</a>
          <a className="nav-item nav-link" href="/operating-pulse"><Activity size={18} /> Operating pulse</a>
          <a className="nav-item nav-link active" href="/namengine/generation-qa"><Sparkles size={18} /> Generation QA</a>
        </nav>
        <div className="sidebar-note"><Sparkles size={18} /><div><strong>Provider QA</strong><span>OpenAI first. Claude, Gemini, and others can plug into this comparison lane next.</span></div></div>
      </aside>

      <main>
        <header className="topbar telemetry-topbar">
          <div>
            <p className="eyebrow">NamEngine operations</p>
            <h1>Generation QA</h1>
            <p>Run and inspect the protected NamEngine generation quality simulator from Mission Control.</p>
          </div>
          <div className="telemetry-actions">
            {session && <span className="signed-in-user">{session.email}</span>}
            {session && <button className="secondary-button" onClick={signOut}><LogOut size={17} /> Sign out</button>}
          </div>
        </header>

        {(view === 'checking' || view === 'loading') && <StatePanel icon={<RefreshCw className="spin" size={24} />} title="Loading Generation QA" copy="Connecting securely to NamEngine…" />}

        {view === 'signed_out' && <StatePanel icon={<LogIn size={24} />} title="Sign in to run Generation QA" copy="Use an approved Google account. Mission Control stores no NamEngine service credentials." action={<button className="primary-button" disabled={!configured} onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Continue with Google</button>} />}

        {view === 'unauthorized' && <StatePanel icon={<CircleOff size={24} />} title="Access not available" copy={message || 'This Google account is not authorized to view Generation QA.'} action={<button className="primary-button" onClick={() => void beginGoogleSignIn()}><LogIn size={18} /> Try another account</button>} />}

        {view === 'unavailable' && <StatePanel icon={<TriangleAlert size={24} />} title="Generation QA unavailable" copy={message} action={session && <button className="primary-button" onClick={() => runPage ? void loadReport(session) : void loadStatus(session)}><RefreshCw size={18} /> Try again</button>} />}

        {(view === 'empty' || view === 'ready') && (
          <>
            <div className="telemetry-controls generation-qa-controls">
              <div>
                <strong>Generation QA controls</strong>
                <span>Fallback runs are local. Full OpenAI runs call the live provider after confirmation.</span>
              </div>
              <div className="telemetry-actions">
                {session && <button className="secondary-button" disabled={runState === 'running'} onClick={() => runPage ? void loadReport(session) : void loadStatus(session)}><RefreshCw size={16} /> Refresh</button>}
                <button className={`secondary-button generation-qa-run-control${selectedRun === 'fast-fallback' ? ' generation-qa-run-selected' : ''}`} disabled={runState === 'running'} onClick={() => void runQA('fast')}><PlayCircle size={18} /> Run fast</button>
                <button className={`secondary-button generation-qa-run-control${selectedRun === 'full-fallback' ? ' generation-qa-run-selected' : ''}`} disabled={runState === 'running'} onClick={() => void runQA('full')}><PlayCircle size={17} /> Run full</button>
                <button className={`secondary-button generation-qa-ai-button generation-qa-run-control${selectedRun === 'fast-openai' ? ' generation-qa-run-selected' : ''}`} disabled={runState === 'running'} onClick={() => void runQA('fast', true)}><PlayCircle size={17} /> Run fast OpenAI</button>
                <button className={`secondary-button generation-qa-ai-button generation-qa-run-control${selectedRun === 'full-openai' ? ' generation-qa-run-selected' : ''}`} disabled={runState === 'running'} onClick={() => void runQA('full', true)}><PlayCircle size={17} /> Run full OpenAI</button>
              </div>
            </div>

            {runState === 'running' && <div className="generation-qa-status-bar" aria-label="Generation QA run in progress"><div /></div>}
            {runMessage && <p className="generation-qa-run-message">{runMessage}</p>}

            {view === 'empty' && <StatePanel icon={<PlayCircle size={24} />} title="No Generation QA run yet" copy="Run a fast fallback pass to create the first simulator summary." />}

            {view === 'ready' && summary && runPage && <GenerationQARunReport report={report} status={status} />}

            {view === 'ready' && summary && !runPage && (
              <>
                <section className="telemetry-metrics" aria-label="Generation QA summary">
                  <UsageCard icon={anomalyCount ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />} alert={Boolean(anomalyCount)} label="Anomalies" value={String(anomalyCount)} />
                  <UsageCard icon={<CheckCircle2 size={20} />} label="Passed scenarios" value={`${passedCount} / ${scenarioCount}`} />
                  <UsageCard icon={<Clock3 size={20} />} label="Rounds" value={String(summary.round_count ?? '—')} />
                  <UsageCard icon={<Sparkles size={20} />} label="Mode" value={summary.mode ?? 'fallback'} />
                </section>

                <section className="telemetry-grid generation-qa-grid">
                  <article className="telemetry-panel telemetry-panel-wide">
                    <div className="panel-heading"><div><p className="eyebrow">Latest run</p><h2>{summary.run_id}</h2></div><span>{status?.available ? 'Available' : 'No summary'}</span></div>
                    <div className="generation-qa-detail-grid">
                      <Detail label="Schema" value={summary.schema_version ?? 'generation-simulator-v1'} />
                      <Detail label="Critical anomalies" value={String(criticalAnomalies)} />
                      <Detail label="Major anomalies" value={String(majorAnomalies)} />
                      <Detail label="Verticals" value={(summary.verticals ?? []).join(', ') || '—'} />
                      <Detail label="Summary path" value={status?.summary_path || summary.summary_path || '—'} />
                      <Detail label="Report path" value={status?.report_path || summary.report_path || '—'} />
                    </div>
                  </article>

                  <article className="telemetry-panel telemetry-panel-wide">
                    <div className="panel-heading"><div><p className="eyebrow">Provider quality</p><h2>OpenAI full runs are available with confirmation</h2></div><XCircle size={19} /></div>
                    <p className="empty-panel-copy">Use Run full OpenAI when you want the quality check to exercise the live OpenAI naming pipeline. This is the first provider lane for future OpenAI vs Claude vs Gemini comparisons.</p>
                  </article>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function GenerationQARunReport({ report, status }: { report: GenerationQAReport | null; status: GenerationQAStatus | null }) {
  const summary = report?.summary ?? status?.summary
  if (!summary) return null
  const anomalies = summary.anomalies ?? []
  const scenarios = summary.scenarios ?? []
  const providers = (summary.providers ?? []).join(', ') || '—'
  const pipelines = (summary.pipelines ?? []).join(', ') || '—'

  return (
    <>
      <section className="telemetry-metrics" aria-label="Generation QA run status">
        <UsageCard icon={(summary.anomaly_count ?? 0) ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />} alert={Boolean(summary.anomaly_count)} label="Anomalies" value={String(summary.anomaly_count ?? 0)} />
        <UsageCard icon={<CheckCircle2 size={20} />} label="Passed scenarios" value={`${summary.passed_count ?? 0} / ${summary.scenario_count ?? 0}`} />
        <UsageCard icon={<Clock3 size={20} />} label="Avg latency" value={summary.average_latency_ms ? `${summary.average_latency_ms} ms` : '—'} />
        <UsageCard icon={<Sparkles size={20} />} label="Provider mode" value={summary.mode ?? 'fallback'} />
      </section>

      <section className="telemetry-grid generation-qa-grid">
        <article className="telemetry-panel telemetry-panel-wide">
          <div className="panel-heading"><div><p className="eyebrow">Run status</p><h2>{summary.run_id}</h2></div><span>{summary.created_at ?? 'Latest run'}</span></div>
          <div className="generation-qa-detail-grid">
            <Detail label="Providers" value={providers} />
            <Detail label="Pipelines" value={pipelines} />
            <Detail label="Critical anomalies" value={String(summary.critical_anomaly_count ?? 0)} />
            <Detail label="Major anomalies" value={String(summary.major_anomaly_count ?? 0)} />
            <Detail label="Minor anomalies" value={String(summary.minor_anomaly_count ?? 0)} />
            <Detail label="Results path" value={status?.results_path || summary.results_path || '—'} />
          </div>
        </article>

        <article className="telemetry-panel telemetry-panel-wide">
          <div className="panel-heading"><div><p className="eyebrow">Anomaly radar</p><h2>Scenario anomalies</h2></div><span>{anomalies.length} found</span></div>
          {anomalies.length ? (
            <div className="usage-table-wrap generation-qa-table-wrap">
              <table className="usage-table generation-qa-anomaly-table">
                <thead><tr><th>Severity</th><th>Code</th><th>Scenario</th><th>Vertical</th><th>Round</th><th>Message</th></tr></thead>
                <tbody>
                  {anomalies.map((anomaly, index) => (
                    <tr key={`${anomaly.scenario_id ?? 'scenario'}-${anomaly.code ?? 'code'}-${index}`}>
                      <td>{anomaly.severity ?? '—'}</td>
                      <td>{anomaly.code ?? '—'}</td>
                      <td>{anomaly.scenario_id ?? '—'}</td>
                      <td>{anomaly.vertical ?? '—'}</td>
                      <td>{anomaly.round ?? '—'}</td>
                      <td>{anomaly.message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-panel-copy">No anomalies detected in this run.</p>}
        </article>

        <article className="telemetry-panel telemetry-panel-wide">
          <div className="panel-heading"><div><p className="eyebrow">Scenario outputs</p><h2>Generated names by scenario</h2></div><span>{scenarios.length} scenarios</span></div>
          <div className="generation-qa-scenario-list">
            {scenarios.map((scenario) => <ScenarioResult key={scenario.id ?? scenario.label} scenario={scenario} />)}
          </div>
        </article>
      </section>
    </>
  )
}

function ScenarioResult({ scenario }: { scenario: GenerationQAScenario }) {
  return (
    <article className="generation-qa-scenario-card">
      <div className="card-topline">
        <span className={`status ${scenario.passed ? 'status-active' : 'status-paused'}`}>{scenario.passed ? 'Pass' : 'Review'}</span>
        <span className="priority priority-medium">{scenario.vertical ?? 'vertical'}</span>
      </div>
      <h3>{scenario.label ?? scenario.id ?? 'Scenario'}</h3>
      <p>{scenario.signal_hits?.length ? `Signal hits: ${scenario.signal_hits.join(', ')}` : 'No signal hits recorded.'}</p>
      {(scenario.rounds ?? []).map((round) => (
        <div className="generation-qa-round" key={round.round_number ?? `${round.provider}-${round.model}`}>
          <div><strong>Round {round.round_number ?? '—'}</strong><span>{round.provider ?? '—'} · {round.model ?? '—'} · {round.pipeline ?? '—'} · {round.latency_ms ?? '—'} ms</span></div>
          <p>{round.names?.join(', ') || 'No names returned.'}</p>
          {round.anomalies?.length ? <small>{round.anomalies.map((item) => item.message).join(' ')}</small> : null}
        </div>
      ))}
    </article>
  )
}

function UsageCard({ icon, label, value, alert = false }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return <article className={`usage-card${alert ? ' usage-card-alert' : ''}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="generation-qa-detail"><span>{label}</span><strong title={value}>{value}</strong></div>
}

function StatePanel({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="telemetry-state"><div className="telemetry-state-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</section>
}
