import { beforeEach, describe, expect, it, vi } from 'vitest'

import { notifyHostPluginUrlChanged } from '../utils/hostEvents'

describe('hostEvents', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts plugin-url-changed events to the host', () => {
    const postMessage = vi
      .spyOn(window.parent, 'postMessage')
      .mockImplementation(() => undefined)

    notifyHostPluginUrlChanged('/sample?tab=detail#top')

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EVENT',
        payload: {
          event: 'plugin-url-changed',
          pluginUrl: '/sample?tab=detail#top',
        },
      }),
      '*',
    )
  })
})
