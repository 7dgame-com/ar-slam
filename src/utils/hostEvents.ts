interface HostEventMessage {
  type: 'EVENT'
  id: string
  payload: {
    event: string
    pluginUrl?: string
    [key: string]: unknown
  }
}

function postHostEvent(payload: HostEventMessage['payload']): void {
  window.parent.postMessage(
    {
      type: 'EVENT',
      id: `${payload.event}-${Date.now()}`,
      payload,
    },
    '*',
  )
}

export function notifyHostPluginUrlChanged(pluginUrl: string): void {
  postHostEvent({
    event: 'plugin-url-changed',
    pluginUrl,
  })
}
