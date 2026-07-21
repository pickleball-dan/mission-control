import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

import { createGatewayServer, GoogleTokenVerifier, RequestError } from '../src/server.mjs'

const servers = []
const origin = 'https://mission-control.example.com'

function config(overrides = {}) {
  return {
    telemetryUrl: new URL('https://namengine.example.com/api/internal/mission-control/openai-usage'),
    telemetryToken: 'service-secret',
    googleIssuer: 'https://accounts.google.com',
    googleAudience: 'client-id.apps.googleusercontent.com',
    googleClientSecret: 'google-client-secret',
    allowedEmails: new Set(['allowed@example.com']),
    missionControlOrigin: origin,
    callbackUrl: `${origin}/namengine/openai-usage`,
    upstreamTimeoutMs: 50,
    maxResponseBytes: 8 * 1024,
    rateLimitMax: 60,
    rateLimitWindowMs: 60_000,
    ...overrides,
  }
}

const allowedVerifier = {
  async verify(token) {
    if (token === 'forbidden-token') throw new RequestError(403, 'forbidden')
    if (token !== 'valid-id-token') throw new RequestError(401, 'unauthorized')
    return { email: 'allowed@example.com', sub: 'google-user-1', exp: 2_000_000_000 }
  },
}

async function start(options = {}) {
  const server = createGatewayServer({ config: config(options.config), tokenVerifier: allowedVerifier, fetchImpl: options.fetchImpl || fetch })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

test('health endpoint is public and minimal', async () => {
  const base = await start()
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('Google verifier enforces signature, issuer, audience, expiration, verified email, and allowlist', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = 'test-key'
  const verifier = new GoogleTokenVerifier(config(), createLocalJWKSet({ keys: [publicJwk] }))
  const token = async (overrides = {}) => new SignJWT({
    email: 'allowed@example.com',
    email_verified: true,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer || 'https://accounts.google.com')
    .setAudience(overrides.audience || 'client-id.apps.googleusercontent.com')
    .setSubject('google-user-1')
    .setIssuedAt()
    .setExpirationTime(overrides.expiration || '5m')
    .sign(privateKey)

  assert.equal((await verifier.verify(await token())).email, 'allowed@example.com')
  assert.equal((await verifier.verify(await token({ nonce: 'expected-nonce' }), { nonce: 'expected-nonce' })).email, 'allowed@example.com')
  await assert.rejects(verifier.verify(await token({ nonce: 'expected-nonce' }), { nonce: 'wrong-nonce' }), /forbidden/)
  await assert.rejects(verifier.verify(await token({ audience: 'wrong-client' })), /unauthorized/)
  await assert.rejects(verifier.verify(await token({ issuer: 'https://issuer.example.com' })), /unauthorized/)
  await assert.rejects(verifier.verify(await token({ expiration: '0s' })), /unauthorized/)
  await assert.rejects(verifier.verify(await token({ email_verified: false })), /forbidden/)
  await assert.rejects(verifier.verify(await token({ email: 'not-allowed@example.com' })), /forbidden/)

  const { privateKey: wrongPrivateKey } = await generateKeyPair('RS256')
  const wrongSignature = await new SignJWT({ email: 'allowed@example.com', email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience('client-id.apps.googleusercontent.com')
    .setSubject('google-user-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(wrongPrivateKey)
  await assert.rejects(verifier.verify(wrongSignature), /unauthorized/)
})

test('token exchange uses PKCE and returns only a validated ID token', async () => {
  let exchangeRequest
  const base = await start({
    fetchImpl: async (url, options) => {
      exchangeRequest = { url: String(url), options }
      return Response.json({ id_token: 'valid-id-token' })
    },
  })
  const response = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'authorization-code',
      code_verifier: 'v'.repeat(64),
      nonce: 'browser-nonce',
      redirect_uri: `${origin}/namengine/openai-usage`,
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    id_token: 'valid-id-token',
    expires_at: 2_000_000_000,
    email: 'allowed@example.com',
  })
  assert.equal(exchangeRequest.url, 'https://oauth2.googleapis.com/token')
  assert.equal(exchangeRequest.options.body.get('code_verifier'), 'v'.repeat(64))
  assert.equal(exchangeRequest.options.body.get('client_secret'), 'google-client-secret')
})

test('rejects invalid origin, missing authentication, and disallowed identity', async () => {
  const base = await start()
  const wrongOrigin = await fetch(`${base}/api/namengine/openai-usage`, {
    headers: { Origin: 'https://attacker.example.com', Authorization: 'Bearer valid-id-token' },
  })
  const missingAuth = await fetch(`${base}/api/namengine/openai-usage`, { headers: { Origin: origin } })
  const forbidden = await fetch(`${base}/api/namengine/openai-usage`, {
    headers: { Origin: origin, Authorization: 'Bearer forbidden-token' },
  })

  assert.equal(wrongOrigin.status, 403)
  assert.equal(missingAuth.status, 401)
  assert.equal(forbidden.status, 403)
})

test('proxies only allowlisted telemetry queries with the service secret', async () => {
  let upstreamRequest
  const report = { summary: { request_count: 3 }, requests_by_day: [] }
  const base = await start({
    fetchImpl: async (url, options) => {
      upstreamRequest = { url: String(url), options }
      return Response.json(report)
    },
  })
  const response = await fetch(`${base}/api/namengine/openai-usage?model=gpt-4.1-mini&success=true`, {
    headers: { Origin: origin, Authorization: 'Bearer valid-id-token' },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), report)
  assert.equal(upstreamRequest.url, 'https://namengine.example.com/api/internal/mission-control/openai-usage?model=gpt-4.1-mini&success=true')
  assert.equal(upstreamRequest.options.headers.Authorization, 'Bearer service-secret')

  const rejected = await fetch(`${base}/api/namengine/openai-usage?path=secret`, {
    headers: { Origin: origin, Authorization: 'Bearer valid-id-token' },
  })
  assert.equal(rejected.status, 400)
})

test('returns safe unavailable, timeout, and response-size errors', async () => {
  const unavailableBase = await start({ fetchImpl: async () => { throw new Error('network details') } })
  const unavailable = await fetch(`${unavailableBase}/api/namengine/openai-usage`, {
    headers: { Origin: origin, Authorization: 'Bearer valid-id-token' },
  })
  assert.equal(unavailable.status, 502)
  assert.deepEqual(await unavailable.json(), { error: 'telemetry_unavailable' })

  const timeoutBase = await start({
    config: { upstreamTimeoutMs: 10 },
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }),
  })
  const timeout = await fetch(`${timeoutBase}/api/namengine/openai-usage`, {
    headers: { Origin: origin, Authorization: 'Bearer valid-id-token' },
  })
  assert.equal(timeout.status, 504)
  assert.deepEqual(await timeout.json(), { error: 'telemetry_timeout' })

  const oversizedBase = await start({
    config: { maxResponseBytes: 20 },
    fetchImpl: async () => Response.json({ summary: { request_count: 100 } }),
  })
  const oversized = await fetch(`${oversizedBase}/api/namengine/openai-usage`, {
    headers: { Origin: origin, Authorization: 'Bearer valid-id-token' },
  })
  assert.equal(oversized.status, 502)
  assert.deepEqual(await oversized.json(), { error: 'telemetry_unavailable' })
})

test('rate limits repeated requests', async () => {
  const base = await start({ config: { rateLimitMax: 1 }, fetchImpl: async () => Response.json({ summary: {} }) })
  const headers = { Origin: origin, Authorization: 'Bearer valid-id-token' }
  assert.equal((await fetch(`${base}/api/namengine/openai-usage`, { headers })).status, 200)
  assert.equal((await fetch(`${base}/api/namengine/openai-usage`, { headers })).status, 429)
})
