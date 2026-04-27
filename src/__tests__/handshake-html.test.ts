import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('early INIT handler', () => {
  it('caches INIT payload without sending a duplicate PLUGIN_READY', () => {
    const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const start = source.indexOf('function earlyHandler')
    const end = source.indexOf('// 从 URL 参数初始化主题')
    const earlyHandler = source.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(earlyHandler).toContain('__EARLY_INIT_PAYLOAD__')
    expect(earlyHandler).toContain("localStorage.setItem('ar-slam-localization-token'")
    expect(earlyHandler).not.toContain('PLUGIN_READY')
    expect(earlyHandler).not.toContain('ready-early')
  })

  it('keeps the diagnostics link development-only', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(source).toContain('v-if="showDiagnosticsLink"')
    expect(source).toContain('const showDiagnosticsLink = import.meta.env.DEV')
  })
})
