# 快速开始指南

## 1. 复制模板

```bash
cp -r plugins/plugin-template-frontend-only plugins/my-plugin
cd plugins/my-plugin
```

## 2. 修改插件标识和会话前缀

需要修改以下位置的插件标识：

### package.json
```json
{ "name": "my-plugin" }
```

### src/utils/token.ts
修改 localStorage key 前缀，避免与其他插件冲突：
```typescript
const TOKEN_KEY = 'my-plugin-token'
const REFRESH_TOKEN_KEY = 'my-plugin-refresh-token'
```

### index.html
修改 early token handler 中的 `localStorage.setItem` key：
```javascript
localStorage.setItem('my-plugin-token', data.payload.token);
```

### src/api/index.ts
修改业务 API 的 baseURL：
```typescript
const sampleApi = axios.create({
  baseURL: '/api/v1/plugin-my-plugin',
  timeout: 10000
})
```

模板内置的身份接口默认走主后端，通常保留为：
```typescript
const mainApi = axios.create({
  baseURL: '/api/v1',
  timeout: 10000
})
```

不要再额外创建 `pluginApi` 或 `/api-config` 代理。模板当前约定是：

- 业务接口走插件自己的 `/api/v1/plugin-xxx`
- 身份与角色统一走主后端 `/api/v1/plugin/verify-token`

### src/composables/usePermissions.ts
按业务需要定义本地权限矩阵：
```typescript
export interface Permissions {
  'my-action-1': boolean
  'my-action-2': boolean
}
```

常见做法是基于 `useAuthSession()` 返回的会话结果，在插件本地映射成业务动作：

```typescript
const permissions = computed<Permissions>(() => ({
  'my-action-1': loaded.value && isAuthenticated.value,
  'my-action-2': loaded.value && user.value?.roles.includes('root') === true,
}))
```

### vite.config.ts
修改 manifest id 和开发端口：
```typescript
// manifest id
id: 'my-plugin',
// 开发端口（避免冲突）
port: 3007,
```

## 3. 修改语言包

编辑 `src/i18n/locales/` 下的 5 个语言文件，替换 `pluginMeta` 字段和业务文案。

## 4. 添加业务页面和导航

1. 在 `src/views/` 下创建新页面组件
2. 在 `src/router/index.ts` 中添加路由
3. 在 `src/composables/usePermissions.ts` 中添加本地权限项
4. 在 `src/layout/AppLayout.vue` 中添加导航链接
5. 如需公开调试页，可参考 `/api-diagnostics` 使用 `meta.public: true`

模板的 `src/router/index.ts` 已内置 URL 同步：每次内部路由变化都会发送 `plugin-url-changed` 事件给宿主，宿主把插件内部路径写入 `/plugins/{id}?pluginUrl=...`。新增页面时保留这段 `router.afterEach` 逻辑，刷新浏览器后才能恢复到当前插件页面。

## 5. 注册到主系统

参考 `plugins.json.example`，将插件配置添加到主系统的 `plugins.json` 中。至少要确认以下字段与实际部署一致：

- `id`
- `url`
- `allowedOrigin`
- `group`
- `icon`

## 6. 本地开发

```bash
npm install
npm run dev
```

开发服务器默认运行在 http://localhost:3006。

- `/api` 会代理到 `http://localhost:8081`（主后端）
- `/plugin-manifest.json` 会输出当前插件清单信息
- `/health` 与 `/debug-env` 在 dev 模式下由 Vite 中间件模拟
- 推荐先打开 `http://localhost:3006/api-diagnostics` 检查代理与 token 状态

## 7. Docker 部署

```bash
# 构建并启动
docker compose up -d --build

# 配置后端地址
APP_API_1_URL=http://your-api:80 \
docker compose up -d
```

如果需要主后端故障切换，可以继续追加：

```bash
APP_API_1_URL=http://primary-api:80 \
APP_API_1_WEIGHT=80 \
APP_API_2_URL=http://backup-api:80 \
APP_API_2_WEIGHT=20 \
docker compose up -d
```

旧模板里出现过的 `APP_BACKEND_*`、`APP_CONFIG_*` 不再是当前模板文档推荐的配置方式。
