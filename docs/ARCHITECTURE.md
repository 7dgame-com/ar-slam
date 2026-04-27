# 架构说明

## 整体架构

纯前端插件模板采用单容器架构：Vue 3 SPA + nginx 反向代理。

```
┌─────────────────────────────────────────────┐
│ 主系统 web/ (Vue 3)                          │
│   PluginLayout.vue → iframe → 插件           │
│   MessageBus → postMessage                   │
└──────────────────┬──────────────────────────┘
                   │ iframe + postMessage
┌──────────────────▼──────────────────────────┐
│ 插件容器 (Docker: nginx:alpine)              │
│ ┌───────────────────────────────────────┐   │
│ │ nginx                                  │   │
│ │  / → 静态文件 (try_files → SPA)        │   │
│ │  /api/ → 反向代理 → 主后端             │   │
│ │  /plugin-manifest.json → 插件清单      │   │
│ │  /health → health.json                 │   │
│ │  /debug-env → debug-env.json           │   │
│ └───────────────────────────────────────┘   │
│ ┌───────────────────────────────────────┐   │
│ │ Vue 3 SPA                              │   │
│ │  usePluginMessageBridge → 通信桥       │   │
│ │  useTheme → 主题同步                   │   │
│ │  useAuthSession → verify-token 会话     │   │
│ │  usePermissions → 本地权限矩阵          │   │
│ │  axios 双实例 → API 请求               │   │
│ │  token.ts → localStorage 管理          │   │
│ └───────────────────────────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │ /api/ 反向代理
┌──────────────────▼──────────────────────────┐
│ 主后端 (Yii2 PHP)                            │
│  业务 API + verify-token                     │
└─────────────────────────────────────────────┘
```

## 认证握手流程

1. 主系统创建 iframe，加载插件 URL（含 `?lang=zh-CN&theme=modern-blue`）
2. 插件 `index.html` 中的 early handler 尽早注册 message 监听，避免错过首个 `INIT`
3. Vue 挂载后，`usePluginMessageBridge` 发送 `PLUGIN_READY`
4. 主系统收到后回复 `INIT { token, config }`
5. 插件把 token 写入 localStorage，并把主题配置同步到运行时状态

## 插件 URL 同步与刷新恢复

主系统插件页使用 `?pluginUrl=` 保存插件内部路由。首次加载时，宿主会把该值合并进 iframe 的入口 URL；插件内路由变化后，模板在 `src/router/index.ts` 的 `router.afterEach` 中向父窗口发送：

```ts
{
  type: 'EVENT',
  payload: {
    event: 'plugin-url-changed',
    pluginUrl: to.fullPath
  }
}
```

宿主收到同一已挂载插件 iframe 的事件后，会把当前地址栏更新为 `/plugins/{pluginId}?pluginUrl=...`。因此浏览器刷新、复制链接或重新打开该地址时，插件会恢复到对应的内部相对路径。

约束：

- `pluginUrl` 必须是插件内部相对路径，例如 `/sample?tab=detail#top`
- 不要传完整外部 URL、协议 URL 或 `//` 开头路径
- `lang`、`theme`、`v`、`cb` 由宿主控制，插件不应把这些参数作为内部状态同步

### 401 刷新策略

1. 任意 axios 实例收到 `401`
2. iframe 模式先发送 `TOKEN_REFRESH_REQUEST` 给主系统，请求宿主刷新 token
3. 若宿主未在超时内返回 `TOKEN_UPDATE`，再回退到本地 `refresh token`
4. 两段都失败后清空本地 token，并向父窗口发送 `TOKEN_EXPIRED`

### 运行时消息

- `TOKEN_UPDATE { token }` — 主系统刷新 token 后同步
- `DESTROY` — 主系统销毁插件，清除 token
- `THEME_CHANGE { theme }` — 切换主题
- `LANG_CHANGE { lang }` — 切换语言
- `TOKEN_REFRESH_REQUEST` — 插件向主系统请求刷新 token
- `TOKEN_EXPIRED` — 插件通知主系统当前会话已经失效

## 反向代理机制

nginx 通过 `docker-entrypoint.sh` 动态生成的配置，将 `/api/` 请求转发到主后端。

上游支持 failover 配置：
```
APP_API_1_URL=http://primary-api:80
APP_API_2_URL=http://backup-api:80
```

当任一上游返回 502/503/504 时，会切换到备用后端。

补充说明：

- Docker 部署时，`/api/` 会先去掉前缀再转发给主后端
- Vite 开发环境也会模拟 `/health`、`/debug-env` 与 `/plugin-manifest.json`
- 当前模板不再生成 `/api-config/` 代理，也不依赖 `system-admin` 配置后端

## 权限系统

插件通过 `/api/v1/plugin/verify-token` 获取当前用户身份和角色。

- `useAuthSession` 负责拉取当前会话
- `usePermissions` composable 在插件本地提供 `can(action)` 和 `hasAny()` 方法
- 路由守卫通过 `meta.requiresPermission` 字段控制页面访问
- 模板默认采用 `auth-only` 语义，开发者可按需扩展为更细的本地角色判断
- 运行时不再依赖 `/api-config`、`allowed-actions`、`check-permission`

## 主题系统

支持 6 种主题：
- 亮色：modern-blue、edu-friendly、neo-brutalism、minimal-pure
- 暗色：deep-space、cyber-tech

通过 CSS 变量实现，同时覆盖 Element Plus 内置变量。

## 国际化

支持 5 种语言：zh-CN、zh-TW、en-US、ja-JP、th-TH

- 初始语言从 URL `?lang=` 读取
- 运行时通过 `LANG_CHANGE` 消息切换，无需刷新
