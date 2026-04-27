export default {
  pluginMeta: {
    name: 'AR SLAM Localization',
    description: 'Upload scan packages, preview GLB models, and create scene binding drafts',
    groupName: 'AR Tools',
  },
  common: {
    loading: 'Loading...',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    back: 'Back',
    success: 'Success',
    failed: 'Failed',
    actions: 'Actions',
    status: 'Status',
    language: 'Language',
  },
  nav: {
    workbench: 'Localization Workbench',
    apiDiagnostics: 'API Diagnostics',
  },
  workbench: {
    title: 'Localization Workbench',
    description: 'Upload Immersal or Area Target Scanner scan packages, inspect the GLB model, and create scene binding drafts.',
  },
  handshake: {
    notInIframe: 'Not Running in iframe',
    notInIframeDesc: 'This plugin must be embedded within the host system. Direct access cannot complete handshake authorization.',
    pageLoaded: 'Page loaded',
    pluginReady: 'Sent PLUGIN_READY',
    waitingInit: 'Waiting for INIT — no parent window, will never arrive',
    connecting: 'Connecting to host system...',
    goToDiagnostics: 'Go to API Diagnostics →',
  },
  permission: {
    noPermission: 'You do not have any permissions for this plugin. Please contact your administrator.',
  },
}
