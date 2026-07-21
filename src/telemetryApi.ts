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
}

export type UsageReport = {
  range: { start: string; end: string }
  summary: UsageMetric
  requests_by_day: Array<UsageMetric & { date: string }>
  requests_by_request_type: Array<UsageMetric & { request_type: string }>
  requests_by_model: Array<UsageMetric & { model: string }>
  failures_by_error_type: Array<{ error_type: string; failure_count: number }>
  slowest_request_categories: Array<UsageMetric & { category: string }>
  requests_with_unavailable_token_usage: Array<{
    request_type: string
    model: string
    request_count: number
  }>
}

export type TelemetryErrorKind = 'unauthorized' | 'unavailable' | 'timeout' | 'configuration'

export class TelemetryError extends Error {
  constructor(public kind: TelemetryErrorKind) {
    super(kind)
  }
}

export async function fetchUsageReport(session: TelemetrySession, days: number): Promise<UsageReport> {
  const config = telemetryPublicConfig()
  if (!config) throw new TelemetryError('configuration')
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const url = new URL('/api/namengine/openai-usage', config.gatewayUrl)
  url.searchParams.set('start', start.toISOString())
  url.searchParams.set('end', end.toISOString())
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
