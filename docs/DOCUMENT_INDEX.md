# 插件开发文档索引

本索引汇总了当前模板推荐阅读的文档，以及 xrugc 主系统中的补充参考资料。

---

## 模板文档（优先）

| 文档 | 位置 | 说明 |
|------|------|------|
| 模板概览 | `README.md` | 模板定位、能力边界与目录概览 |
| 快速上手 | `docs/QUICK_START.md` | 从复制模板到本地开发、Docker 部署 |
| 架构说明 | `docs/ARCHITECTURE.md` | 握手、代理、会话和权限模型 |
| 开发清单 | `docs/CHECKLIST.md` | 改名、联调、部署前自查项 |

## 主系统参考

| 文档 | 位置 | 说明 |
|------|------|------|
| 插件系统总览 | `docs/plugin-system.md` | 当前插件治理、清单和文档入口 |
| 插件开发指南 | `web/docs/plugin-development-guide.md` | 主系统中插件开发的整体指南 |
| 插件设计指南 | `web/docs/plugin-design-guide.md` | 主题和 CSS 变量设计规范 |
| 认证 API 参考 | `web/docs/plugin-auth-api-reference.md` | 主后端认证接口规范 |
| 认证 API 用法 | `web/docs/plugin-auth-api-usage.md` | `verify-token` 等接口示例 |
| iframe 通信协议 | `web/docs/blockly-iframe-protocol.md` | postMessage 握手协议定义 |

## 参考实现

| 文档 | 位置 | 说明 |
|------|------|------|
| user-management 实现指南 | `plugins/user-management/docs/PLUGIN-IMPLEMENTATION-GUIDE.md` | 可对照完整业务插件结构，非通用协议权威来源 |
| user-management 设计参考 | `plugins/user-management/docs/PLUGIN-DESIGN-REFERENCE.md` | 可对照复杂业务页面组织方式 |

---

## 说明

- 如果历史文档与当前模板实现不一致，以本模板 README / QUICK_START / ARCHITECTURE / CHECKLIST 为准。
- 当前模板默认采用 `verify-token + 本地权限矩阵 + /api` 代理模型，不再以 `/api-config` 或 `allowed-actions` 为标准路径。
