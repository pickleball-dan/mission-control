import { useEffect, useState } from 'react'
import { Coins, LogIn, RefreshCw, TriangleAlert } from 'lucide-react'

import { fetchUsageReport, TelemetryError } from './telemetryApi'
import { storedTelemetrySession, telemetryPublicConfig } from './telemetryAuth'

type CardState = 'signed_out' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'unconfigured'

type CostRow = Record<string, unknown>

export default function NamEngineCostSummaryCard() {
  const [state, setState] = useState<CardState>('loading')
  const [spend, setSpend] = useState(0)
  const [requestCount, setRequestCount] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      if (!telemetryPublicConfig()) {
        if (active) setState('unconfigured')
        return
      }
      const session = storedTelemetrySession()
      if (!session) {
        if (active) setState('signed_out')
        return
      }
      try {
        const report = await fetchUsageReport(session, 1, { key: 'timestamp', direction: 'desc' })
        if (!active) return
        const totalSpend = reportCost(report)
        setSpend(totalSpend)
        setRequestCount(report.summary.request_count)
        setState(report.summary.request_count ? 'ready' : 'empty')
      } catch (error) {
        if (!active) return
        setState(error instanceof TelemetryError && error.kind === 'configuration' ? 'unconfigured' : 'unavailable')
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const content = cardContent(state, spend, requestCount)

  return (
    <a className={`metric-card metric-card-link ai-spend-card ai-spend-card-${state}`} href="/namengine/openai-usage" aria-label="Open NamEngine AI cost">
      <div className="metric-icon">{content.icon}</div>
      <div>
        <span>{content.label}</span>
        <strong>{content.value}</strong>
        <small>{content.note}</small>
      </div>
    </a>
  )
}

function cardContent(state: CardState, spend: number, requestCount: number) {
  if (state === 'loading') {
    return { icon: <RefreshCw className="spin" size={20} />, label: 'NamEngine AI spend', value: 'Loading', note: 'Checking last 24 hours' }
  }
  if (state === 'ready') {
    return { icon: <Coins size={20} />, label: 'NamEngine AI spend', value: formatCurrency(spend), note: `${formatNumber(requestCount)} requests · last 24 hours` }
  }
  if (state === 'empty') {
    return { icon: <Coins size={20} />, label: 'NamEngine AI spend', value: formatCurrency(0), note: 'No usage in last 24 hours' }
  }
  if (state === 'signed_out') {
    return { icon: <LogIn size={20} />, label: 'NamEngine AI spend', value: 'Sign in', note: 'Tap to view cost' }
  }
  if (state === 'unconfigured') {
    return { icon: <TriangleAlert size={20} />, label: 'NamEngine AI spend', value: 'Not wired', note: 'Telemetry config missing' }
  }
  return { icon: <TriangleAlert size={20} />, label: 'NamEngine AI spend', value: 'Unavailable', note: 'Tap for details' }
}

function reportCost(report: { summary: CostRow; requests_by_day: CostRow[] }): number {
  const summaryCost = costOf(report.summary)
  if (summaryCost > 0) return summaryCost
  return report.requests_by_day.reduce((total, row) => total + costOf(row), 0)
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 4 : 2 }).format(value || 0)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0)
}
