import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const QUERY_ALLOWLIST = new Set(['start', 'end', 'request_type', 'model', 'success'])
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024

export class RequestError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

export function loadConfig(environment = process.env) {
  const required = (name) => {
    const value = String(environment[name] || '').trim()
    if (!value) throw new Error(`Missing required configuration: ${name}`)
    return value
  }

  const originValue = required('MISSION_CONTROL_ORIGIN')
  const missionControlOrigin = new URL(originValue).origin
  if (originValue.replace(/\/$/, '') !== missionControlOrigin) {
    throw new Error('MISSION_CONTROL_ORIGIN must be an exact origin without a path')
  }

  const telemetryUrl = new URL(required('NAMENGINE_TELEMETRY_URL'))
  if (telemetryUrl.protocol !== 'https:' && telemetryUrl.hostname !== 'localhost') {
    throw new Error('NAMENGINE_TELEMETRY_URL must use HTTPS')
  }

  const allowedEmails = new Set(
    required('TELEMETRY_ALLOWED_EMAILS')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
  if (!allowedEmails.size || [...allowedEmails].some((email) => !email.includes('@'))) {
    throw new Error('TELEMETRY_ALLOWED_EMAILS must contain valid email addresses')
  }

  return {
    telemetryUrl,
    telemetryToken: required('NAMENGINE_TELEMETRY_TOKEN'),
    googleIssuer: required('GOOGLE_OIDC_ISSUER').replace(/\/$/, ''),
    googleAudience: required('GOOGLE_OIDC_AUDIENCE'),
    googleClientSecret: required('GOOGLE_OIDC_CLIENT_SECRET'),
    allowedEmails,
    missionControlOrigin,
    callbackUrl: `${missionControlOrigin}/namengine/openai-usage`,
    upstreamTimeoutMs: DEFAULT_TIMEOUT_MS,
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    rateLimitMax: 60,
    rateLimitWindowMs: 60_000,
  }
}

export class GoogleTokenVerifier {
  constructor(config, jwks = createRemoteJWKSet(GOOGLE_JWKS_URL)) {
    this.config = config
    this.jwks = jwks
  }

  async verify(token, { nonce } = {}) {
    let payload
    try {
      ;({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.googleIssuer,
        audience: this.config.googleAudience,
        algorithms: ['RS256'],
      }))
    } catch {
      throw new RequestError(401, 'unauthorized')
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    if (
      payload.email_verified !== true
      || typeof payload.sub !== 'string'
      || typeof payload.exp !== 'number'
      || (nonce && payload.nonce !== nonce)
      || !email
      || !this.config.allowedEmails.has(email)
    ) {
      throw new RequestError(403, 'forbidden')
    }
    return { email, sub: payload.sub, exp: payload.exp }
  }
}

class FixedWindowRateLimiter {
  constructor(maximum, windowMs) {
    this.maximum = maximum
    this.windowMs = windowMs
    this.entries = new Map()
  }

  consume(key) {
    const now = Date.now()
    const existing = this.entries.get(key)
    if (!existing || existing.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    existing.count += 1
    return existing.count <= this.maximum
  }
}

export function createGatewayServer({
  config = loadConfig(),
  fetchImpl = fetch,
  tokenVerifier = new GoogleTokenVerifier(config),
} = {}) {
  const limiter = new FixedWindowRateLimiter(config.rateLimitMax, config.rateLimitWindowMs)

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://gateway.local')
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' }, request, config)
      }

      requireExactOrigin(request, config)
      if (request.method === 'OPTIONS') {
        response.writeHead(204, corsHeaders(request, config, {
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '600',
        }))
        return response.end()
      }

      const clientKey = clientAddress(request)
      if (!limiter.consume(`client:${clientKey}`)) throw new RequestError(429, 'rate_limited')

      if (request.method === 'POST' && url.pathname === '/auth/token') {
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          throw new RequestError(415, 'unsupported_media_type')
        }
        const body = await readJsonBody(request, 8 * 1024)
        const code = boundedString(body.code, 'code', 4_096)
        const codeVerifier = boundedString(body.code_verifier, 'code_verifier', 128)
        const nonce = boundedString(body.nonce, 'nonce', 256)
        const redirectUri = boundedString(body.redirect_uri, 'redirect_uri', 2_048)
        if (codeVerifier.length < 43 || redirectUri !== config.callbackUrl) {
          throw new RequestError(400, 'invalid_request')
        }
        const tokenPayload = await exchangeAuthorizationCode(
          { code, codeVerifier, redirectUri },
          config,
          fetchImpl,
        )
        const identity = await tokenVerifier.verify(tokenPayload.id_token, { nonce })
        return sendJson(response, 200, {
          id_token: tokenPayload.id_token,
          expires_at: identity.exp || null,
          email: identity.email,
        }, request, config, { 'Cache-Control': 'no-store' })
      }

      if (request.method === 'GET' && url.pathname === '/api/namengine/openai-usage') {
        const bearerToken = authorizationToken(request)
        const identity = await tokenVerifier.verify(bearerToken)
        if (!limiter.consume(`identity:${identity.sub}`)) throw new RequestError(429, 'rate_limited')
        const query = allowedQuery(url.searchParams)
        const payload = await fetchTelemetry(query, config, fetchImpl)
        return sendJson(response, 200, payload, request, config, { 'Cache-Control': 'private, no-store' })
      }

      throw new RequestError(404, 'not_found')
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500
      const code = error instanceof RequestError ? error.code : 'gateway_error'
      return sendJson(response, status, { error: code }, request, config, { 'Cache-Control': 'no-store' })
    }
  })
}

async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }, config, fetchImpl) {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: config.googleAudience,
    client_secret: config.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  let tokenResponse
  try {
    tokenResponse = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, config.upstreamTimeoutMs, fetchImpl)
  } catch {
    throw new RequestError(503, 'authentication_unavailable')
  }
  if (!tokenResponse.ok) throw new RequestError(401, 'unauthorized')
  const payload = await readLimitedJson(tokenResponse, 64 * 1024)
  if (!payload || typeof payload.id_token !== 'string') throw new RequestError(401, 'unauthorized')
  return payload
}

async function fetchTelemetry(query, config, fetchImpl) {
  const target = new URL(config.telemetryUrl)
  target.search = query.toString()
  let upstream
  try {
    upstream = await fetchWithTimeout(target, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.telemetryToken}`,
      },
    }, config.upstreamTimeoutMs, fetchImpl)
  } catch (error) {
    if (error?.name === 'AbortError') throw new RequestError(504, 'telemetry_timeout')
    throw new RequestError(502, 'telemetry_unavailable')
  }
  if (!upstream.ok) {
    if (upstream.status === 400) throw new RequestError(400, 'invalid_query')
    throw new RequestError(502, 'telemetry_unavailable')
  }
  try {
    const payload = await readLimitedJson(upstream, config.maxResponseBytes)
    if (!payload || typeof payload !== 'object' || typeof payload.summary !== 'object') {
      throw new Error('invalid payload')
    }
    return payload
  } catch {
    throw new RequestError(502, 'telemetry_unavailable')
  }
}

function allowedQuery(searchParams) {
  const clean = new URLSearchParams()
  for (const [key, value] of searchParams) {
    if (!QUERY_ALLOWLIST.has(key) || searchParams.getAll(key).length !== 1 || value.length > 200) {
      throw new RequestError(400, 'invalid_query')
    }
    clean.set(key, value)
  }
  return clean
}

function authorizationToken(request) {
  const authorization = String(request.headers.authorization || '')
  const match = /^Bearer ([^\s]+)$/.exec(authorization)
  if (!match) throw new RequestError(401, 'unauthorized')
  return match[1]
}

function requireExactOrigin(request, config) {
  if (request.headers.origin !== config.missionControlOrigin) {
    throw new RequestError(403, 'forbidden_origin')
  }
}

function corsHeaders(request, config, extra = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', ...extra }
  if (request.headers.origin === config.missionControlOrigin) {
    headers['Access-Control-Allow-Origin'] = config.missionControlOrigin
  }
  return headers
}

function sendJson(response, status, payload, request, config, extraHeaders = {}) {
  if (response.headersSent) return
  response.writeHead(status, corsHeaders(request, config, extraHeaders))
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request, limit) {
  let total = 0
  const chunks = []
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new RequestError(413, 'request_too_large')
    chunks.push(chunk)
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid')
    return payload
  } catch {
    throw new RequestError(400, 'invalid_request')
  }
}

function boundedString(value, name, maximum) {
  if (typeof value !== 'string' || !value || value.length > maximum) {
    throw new RequestError(400, 'invalid_request')
  }
  return value
}

async function readLimitedJson(response, limit) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > limit) throw new Error('response too large')
  if (!response.body) throw new Error('missing response body')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new Error('response too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function clientAddress(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || request.socket.remoteAddress || 'unknown'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig()
    const server = createGatewayServer({ config })
    const port = Number(process.env.PORT || 3000)
    server.listen(port, '0.0.0.0')
  } catch (error) {
    process.stderr.write(`Telemetry gateway configuration error: ${error.message}\n`)
    process.exitCode = 1
  }
}
