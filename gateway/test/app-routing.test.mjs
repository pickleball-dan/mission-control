import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appPath = resolve(__dirname, '..', '..', 'src', 'App.tsx')

async function appSource() {
  return readFile(appPath, 'utf8')
}

test('/operating-pulse routes to the existing NamEngineOpenAIUsage component', async () => {
  const source = await appSource()

  assert.match(source, /path === '\/operating-pulse'/)
  assert.match(source, /path === '\/operating-pulse'[\s\S]*NamEngineOpenAIUsage/)
})

test('/namengine/openai-usage keeps routing to the existing NamEngineOpenAIUsage component', async () => {
  const source = await appSource()

  assert.match(source, /path === '\/namengine\/openai-usage'/)
  assert.match(source, /path === '\/namengine\/openai-usage'[\s\S]*NamEngineOpenAIUsage/)
})

test('Operating pulse navigation targets /operating-pulse', async () => {
  const source = await appSource()

  assert.match(source, /href="\/operating-pulse"/)
  assert.match(source, /> Operating pulse<\/a>/)
})

test('/ falls back to the existing portfolio dashboard', async () => {
  const source = await appSource()

  assert.match(source, /const path = window\.location\.pathname\.replace/)
  assert.match(source, /return <PortfolioDashboard \/>/)
})
