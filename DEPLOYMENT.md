# Git Deployment

This plugin uses a three-branch deployment model:

| Branch | Purpose | Docker tag |
| --- | --- | --- |
| `develop` | Development integration | `develop` |
| `main` | Mainline stable branch | `main` |
| `publish` | Release branch | `publish`, `latest` |

## CI

Workflow: `.github/workflows/ci.yml`

CI runs on pushes to `main`, `develop`, and `publish`, and on pull requests targeting `main` or `develop`.

It follows the frontend-only plugin template:

- Node.js 24
- pnpm 9
- `pnpm install --frozen-lockfile`
- `pnpm run build`
- `pnpm test`
- upload `dist/` as a 7-day artifact

## Deploy

Workflow: `.github/workflows/deploy.yml`

Deploy runs on pushes to `main`, `develop`, and `publish`, and supports manual `workflow_dispatch`.

Before pushing an image it runs the same build and test commands as CI. If validation passes, it builds the plugin Docker image and pushes it to:

```text
hkccr.ccs.tencentyun.com/plugins/ar-slam-localization
```

Required GitHub Actions secrets:

- `TENCENT_REGISTRY_USERNAME` or `TENCENT_REGISTRY_USER`
- `TENCENT_REGISTRY_PASSWORD`

## Release Flow

1. Merge feature work into `develop`.
2. After validation, promote `develop` into `main`.
3. When ready to release, merge `main` into `publish`.
4. Use the `publish` or `latest` image tag for release deployment.
