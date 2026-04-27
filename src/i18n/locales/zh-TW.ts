export default {
  pluginMeta: {
    name: 'AR SLAM 定位',
    description: '上傳空間掃描包、預覽 GLB 模型，並建立場景綁定草稿',
    groupName: 'AR 工具',
  },
  common: {
    loading: '載入中...',
    confirm: '確認',
    cancel: '取消',
    save: '儲存',
    delete: '刪除',
    edit: '編輯',
    add: '新增',
    back: '返回',
    success: '成功',
    failed: '失敗',
    actions: '操作',
    status: '狀態',
    language: '語言',
  },
  nav: {
    workbench: '定位工作台',
    apiDiagnostics: 'API 診斷',
  },
  workbench: {
    title: '定位工作台',
    description: '上傳 Immersal 或 Area Target Scanner 掃描包，查看 GLB 模型並建立場景綁定草稿。',
  },
  handshake: {
    notInIframe: '未在 iframe 中執行',
    notInIframeDesc: '此外掛需要嵌入主系統中使用，直接存取無法完成握手授權。',
    pageLoaded: '頁面載入完成',
    pluginReady: '傳送 PLUGIN_READY',
    waitingInit: '等待 INIT — 無父視窗，永不到達',
    connecting: '正在與主系統握手…',
    goToDiagnostics: '前往 API 診斷頁面 →',
  },
  permission: {
    noPermission: '您沒有此外掛的任何操作權限，請聯繫管理員設定',
  },
}
