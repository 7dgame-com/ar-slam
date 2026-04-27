import { afterEach, describe, expect, it, vi } from 'vitest'

import router, { createPluginRoutes } from '../router'

afterEach(async () => {
  vi.restoreAllMocks()
  await router.push('/workbench')
})

describe('plugin URL sync', () => {
  it('keeps the diagnostics route out of production route tables', () => {
    const routes = createPluginRoutes({ includeDiagnostics: false })

    expect(JSON.stringify(routes)).not.toContain('/api-diagnostics')
  })

  it('sends plugin-url-changed events after route changes', async () => {
    const postMessage = vi
      .spyOn(window.parent, 'postMessage')
      .mockImplementation(() => undefined)

    await router.push('/api-diagnostics?debug=1#env')

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EVENT',
        payload: {
          event: 'plugin-url-changed',
          pluginUrl: '/api-diagnostics?debug=1#env',
        },
      }),
      '*',
    )
  })
})
