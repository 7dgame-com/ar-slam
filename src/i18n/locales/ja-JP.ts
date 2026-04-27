export default {
  pluginMeta: {
    name: 'AR SLAM ローカライズ',
    description: 'スキャンパッケージをアップロードし、GLB モデルをプレビューしてシーン紐付け草案を作成します',
    groupName: 'AR ツール',
  },
  common: {
    loading: '読み込み中...',
    confirm: '確認',
    cancel: 'キャンセル',
    save: '保存',
    delete: '削除',
    edit: '編集',
    add: '追加',
    back: '戻る',
    success: '成功',
    failed: '失敗',
    actions: '操作',
    status: 'ステータス',
    language: '言語',
  },
  nav: {
    workbench: 'ローカライズワークベンチ',
    apiDiagnostics: 'API診断',
  },
  workbench: {
    title: 'ローカライズワークベンチ',
    description: 'Immersal または Area Target Scanner のスキャンパッケージをアップロードし、GLB モデルを確認してシーン紐付け草案を作成します。',
  },
  handshake: {
    notInIframe: 'iframeで実行されていません',
    notInIframeDesc: 'このプラグインはホストシステムに埋め込んで使用する必要があります。直接アクセスではハンドシェイク認証を完了できません。',
    pageLoaded: 'ページ読み込み完了',
    pluginReady: 'PLUGIN_READY 送信済み',
    waitingInit: 'INIT を待機中 — 親ウィンドウなし、到達不可',
    connecting: 'ホストシステムに接続中...',
    goToDiagnostics: 'API診断ページへ →',
  },
  permission: {
    noPermission: 'このプラグインの操作権限がありません。管理者にお問い合わせください。',
  },
}
