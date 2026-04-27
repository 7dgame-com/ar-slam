# AR SLAM 定位插件

iframe 插件，用于上传空间扫描 ZIP、识别 Immersal / Area Target Scanner 定位资产、预览 GLB 扫描模型，并从主后端分页选择自由行场景创建 SLAM 绑定草稿。

## MVP 范围

- 场景列表来自主后端 `GET /api/v1/verses`，使用分页响应头驱动翻页。
- 已有绑定状态来自插件业务接口 `GET /api/v1/plugin-ar-slam-localization/bindings`，绑定草稿通过 `POST /api/v1/plugin-ar-slam-localization/bindings` 提交。
- 一个 SLAM 包可一次选择多个未绑定场景。
- 已绑定到其他 SLAM 的场景会禁用，避免一个场景绑定多个 SLAM。
- 不上传扫描数据到服务端。
- 不持久化 ZIP、GLB 或定位数据。
- 刷新页面后当前上传和绑定草稿会丢失。

## 本地开发

```bash
pnpm install
npm run dev
```

默认开发地址：`http://localhost:3016`

`/api/` 默认代理到 `http://localhost:8081`。开发模式的诊断页位于 `http://localhost:3016/api-diagnostics`；生产构建不注册该路由。`/workbench` 是标准 iframe 插件页面，需要由宿主发送 INIT 握手后访问。

## Git 部署

- `develop`：开发集成分支，推送镜像 tag `develop`。
- `main`：主干稳定分支，推送镜像 tag `main`。
- `publish`：发布分支，推送镜像 tag `publish` 和 `latest`。

CI 和部署工作流位于 `.github/workflows/`，规则见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## Template References

- [docs/QUICK_START.md](docs/QUICK_START.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/CHECKLIST.md](docs/CHECKLIST.md)
- [docs/DOCUMENT_INDEX.md](docs/DOCUMENT_INDEX.md)
