export default {
  pluginMeta: {
    name: 'AR SLAM 定位',
    description: '上传空间扫描包，预览 GLB 模型，并创建场景绑定草稿',
    groupName: 'AR 工具',
  },
  common: {
    loading: '加载中...',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    back: '返回',
    success: '成功',
    failed: '失败',
    actions: '操作',
    status: '状态',
    language: '语言',
  },
  nav: {
    workbench: '定位工作台',
    apiDiagnostics: 'API 诊断',
  },
  workbench: {
    title: '定位工作台',
    description: '上传 Immersal 或 Area Target Scanner 扫描包，查看 GLB 模型并创建场景绑定草稿。',
  },
  handshake: {
    notInIframe: '未在 iframe 中运行',
    notInIframeDesc: '此插件需要嵌入主系统中使用，直接访问无法完成握手授权。',
    pageLoaded: '页面加载完成',
    pluginReady: '发送 PLUGIN_READY',
    waitingInit: '等待 INIT — 无父窗口，永不到达',
    connecting: '正在与主系统握手…',
    goToDiagnostics: '前往 API 诊断页面 →',
  },
  permission: {
    noPermission: '您没有此插件的任何操作权限，请联系管理员配置',
  },
}
