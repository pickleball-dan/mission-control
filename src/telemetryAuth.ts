const SESSION_KEY = 'mission-control-telemetry-session'
const OAUTH_STATE_KEY = 'mission-control-oauth-state'
const OAUTH_VERIFIER_KEY = 'mission-control-oauth-verifier'
const OAUTH_NONCE_KEY = 'mission-control-oauth-nonce'

export type TelemetrySession = {
  idToken: string
  email: string
  expiresAt: number
}

type PublicConfig = {
  gatewayUrl: string
  clientId: string
  issuer: string
  audience: string
  callbackUrl: string
}

let callbackPromise: Promise<TelemetrySession | null> | null = null

export function telemetryPublicConfig(): PublicConfig | null {
  const gatewayUrl = String(import.meta.env.VITE_TELEMETRY_GATEWAY_URL || '').replace(/\/$/, '')
  const clientId = String(import.meta.env.VITE_GOOGLE_OIDC_CLIENT_ID || '').trim()
  const issuer = String(import.meta.env.VITE_GOOGLE_OIDC_ISSUER || '').replace(/\/$/, '')
  const audience = String(import.meta.env.VITE_GOOGLE_OIDC_AUDIENCE || '').trim()
  if (!gatewayUrl || !clientId || !issuer || !audience || clientId !== audience) return null
  return {
    gatewayUrl,
    clientId,
    issuer,
    audience,
    callbackUrl: `${window.location.origin}/namengine/openai-usage`,
  }
}

export async function beginGoogleSignIn(): Promise<void> {
  const config = telemetryPublicConfig()
  if (!config) throw new Error('Telemetry sign-in is not configured.')
  const state = randomUrlSafe(32)
  const verifier = randomUrlSafe(64)
  const nonce = randomUrlSafe(32)
  const challenge = await sha256UrlSafe(verifier)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OAUTH_NONCE_KEY, nonce)

  const authorizationUrl = new URL('/o/oauth2/v2/auth', config.issuer)
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    prompt: 'select_account',
  }).toString()
  window.location.assign(authorizationUrl)
}

export function completeGoogleSignIn(): Promise<TelemetrySession | null> {
  if (callbackPromise) return callbackPromise
  callbackPromise = completeGoogleSignInOnce()
  return callbackPromise
}

async function completeGoogleSignInOnce(): Promise<TelemetrySession | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const oauthError = params.get('error')
  if (!code && !oauthError) return storedTelemetrySession()

  cleanCallbackUrl()
  if (oauthError) throw new Error('Google sign-in was not completed.')
  const config = telemetryPublicConfig()
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY)
  const nonce = sessionStorage.getItem(OAUTH_NONCE_KEY)
  clearOAuthTransaction()
  if (!config || !expectedState || !verifier || !nonce || returnedState !== expectedState) {
    throw new Error('The sign-in response could not be verified.')
  }

  const response = await fetch(`${config.gatewayUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      nonce,
      redirect_uri: config.callbackUrl,
    }),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('This Google account is not authorized for telemetry.')
    }
    throw new Error('Google sign-in is temporarily unavailable.')
  }
  const payload = await response.json() as { id_token?: unknown; email?: unknown; expires_at?: unknown }
  if (
    typeof payload.id_token !== 'string'
    || typeof payload.email !== 'string'
    || typeof payload.expires_at !== 'number'
  ) {
    throw new Error('The sign-in response was invalid.')
  }
  const session = { idToken: payload.id_token, email: payload.email, expiresAt: payload.expires_at }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function storedTelemetrySession(): TelemetrySession | null {
  const value = sessionStorage.getItem(SESSION_KEY)
  if (!value) return null
  try {
    const session = JSON.parse(value) as TelemetrySession
    if (
      typeof session.idToken !== 'string'
      || typeof session.email !== 'string'
      || typeof session.expiresAt !== 'number'
      || session.expiresAt <= Date.now() / 1000 + 30
    ) {
      signOutTelemetry()
      return null
    }
    return session
  } catch {
    signOutTelemetry()
    return null
  }
}

export function signOutTelemetry(): void {
  sessionStorage.removeItem(SESSION_KEY)
  clearOAuthTransaction()
  callbackPromise = null
}

function clearOAuthTransaction(): void {
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_NONCE_KEY)
}

function cleanCallbackUrl(): void {
  window.history.replaceState({}, document.title, '/namengine/openai-usage')
}

function randomUrlSafe(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64Url(bytes)
}

async function sha256UrlSafe(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
