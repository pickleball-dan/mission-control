# Mission Control

Mission Control is the operating dashboard for Dan's portfolio of products, projects, and priorities.

## Current scope

The first release provides a clean, local-first dashboard with:

- Portfolio overview
- Project status and priority tracking
- Next-action queue
- Launch-readiness indicators
- Quick links for active products
- Persistent browser storage

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Build

```bash
npm run build
```

## Technology

- React
- TypeScript
- Vite
- CSS
- Local browser storage

No database or external service is required for the first release.

## NamEngine OpenAI usage

The `/namengine/openai-usage` route remains part of the static Vite application. It authenticates
with Google using Authorization Code with PKCE and calls the dedicated telemetry gateway. The
gateway validates the Google ID token and server-side email allowlist before making an
authenticated server-to-server request to NamEngine. Only aggregate telemetry is returned.

Mission Control public build configuration:

```text
VITE_TELEMETRY_GATEWAY_URL
VITE_GOOGLE_OIDC_CLIENT_ID
VITE_GOOGLE_OIDC_ISSUER
VITE_GOOGLE_OIDC_AUDIENCE
```

Gateway configuration:

```text
NAMENGINE_TELEMETRY_URL
NAMENGINE_TELEMETRY_TOKEN
GOOGLE_OIDC_ISSUER
GOOGLE_OIDC_AUDIENCE
GOOGLE_OIDC_CLIENT_SECRET
TELEMETRY_ALLOWED_EMAILS
MISSION_CONTROL_ORIGIN
```

`TELEMETRY_ALLOWED_EMAILS` is a comma-separated list. All secrets belong in Render environment
configuration and must not use a `VITE_` prefix.

For local review, configure the public Vite variables in an ignored `.env.local`, run the gateway
with matching local environment variables, then run `npm run dev`. The Google OAuth client must
include `http://localhost:5173` as an authorized JavaScript origin and
`http://localhost:5173/namengine/openai-usage` as an authorized redirect URI.
