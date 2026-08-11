import { telemetryPublicConfig, type TelemetrySession } from './telemetryAuth'

export type UsageMetric = {
  request_count: number
  success_count: number
  failure_count: number
  success_rate: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  average_latency_ms: number
  maximum_latency_ms: number
  image_generation_count: number
  requests_missing_token_usage: number
  estimated_spend_usd: number
  generated_name_count: number
}

export type SessionUsageMetric = UsageMetric & {
  session_id: string
  timestamp?: string
  date: string
  vertical: string
  model: string
  request_types: string[]
  stage_breakdown?: StageUsageMetric[]
}

export type StageUsageMetric = {
  stage: string
  request_count: number
  average_latency_ms: number
  maximum_latency_ms: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_spend_usd: number
}

export type UsageExceptionReport = {
  normal_pipeline: string[]
  summary: {
    normal_request_count: number
    exception_request_count: number
    unexpected_request_type_count: number
    failure_count: number
    pipeline_anomaly_session_count: number
    requests_missing_token_usage: number
  }
  unexpected_request_types: Array<UsageMetric & { request_type: string; reason?: string }>
  sessions_with_pipeline_anomalies: Array<SessionUsageMetric & {
    stage_counts?: Record<string, number>
    missing_stages?: string[]
    unexpected_request_types?: string[]
    reason?: string
  }>
  failures_by_error_type: Array<{ error_type: string; failure_count: number }>
  requests_with_unavailable_token_usage: Array<{
    request_type: string
    model: string
    request_count: number
  }>
}

export type UsageReport = {
  range: { start: string | null; end: string | null; reporting_window?: string | null }
  session_sort?: { sort_by: string; direction: string }
  summary: UsageMetric
  requests_by_day: Array<UsageMetric & { date: string }>
  requests_by_request_type: Array<UsageMetric & { request_type: string }>
  usage_exceptions?: UsageExceptionReport
  requests_by_model: Array<UsageMetric & { model: string }>
  requests_by_session?: SessionUsageMetric[]
  failures_by_error_type: Array<{ error_type: string; failure_count: number }>
  slowest_request_categories: Array<UsageMetric & { category: string }>
  requests_with_unavailable_token_usage: Array<{
    request_type: string
    model: string
    request_count: number
  }>
}

export type SessionSortKey =
  | 'timestamp'
  | 'session_id'
  | 'vertical'
  | 'model'
  | 'request_count'
  | 'total_tokens'
  | 'generated_name_count'
  | 'average_latency_ms'
  | 'estimated_spend_usd'

export type SessionSort = { key: SessionSortKey; direction: 'asc' | 'desc' }

export type TelemetryErrorKind = 'unauthorized' | 'unavailable' | 'timeout' | 'configuration'

export class TelemetryError extends Error {
  constructor(public kind: TelemetryErrorKind) {
    super(kind)
  }
}

export async function fetchUsageReport(session: TelemetrySession, days: number, sessionSort: SessionSort): Promise<UsageReport> {
  const config = telemetryPublicConfig()
  if (!config) throw new TelemetryError('configuration')
  const url = new URL('/api/namengine/openai-usage', config.gatewayUrl)
  if (days <= 1) {
    url.searchParams.set('reporting_window', 'last_24_hours')
  } else {
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    url.searchParams.set('start', start.toISOString())
    url.searchParams.set('end', end.toISOString())
  }
  url.searchParams.set('session_sort', sessionSort.key)
  url.searchParams.set('session_sort_direction', sessionSort.direction)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.idToken}` },
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new TelemetryError('unauthorized')
    if (response.status === 504) throw new TelemetryError('timeout')
    if (!response.ok) throw new TelemetryError('unavailable')
    const payload = await response.json() as UsageReport
    if (!payload?.summary || !Array.isArray(payload.requests_by_day)) {
      throw new TelemetryError('unavailable')
    }
    return payload
  } catch (error) {
    if (error instanceof TelemetryError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new TelemetryError('timeout')
    throw new TelemetryError('unavailable')
  } finally {
    window.clearTimeout(timeout)
  }
}
