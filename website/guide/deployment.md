# 部署方式与前端版本

## 前端与发布目录

| 部署路径 | 发布内容 | 状态 |
| --- | --- | --- |
| Workers Static Assets | `web/` 构建为 `web/dist`，Worker 同时处理 API | React 主线，推荐 |
| Node.js / Docker | `server.js` 提供 `public/` | 冻结的旧前端 |
| Cloudflare Pages Functions | `web/dist` + 仓库根目录 `functions/` | React 前端，现有 Pages 项目无需迁移平台 |
| GitHub Pages | `website/.vitepress/dist` | 仅项目文档站，不运行音乐 API |

## 后端兼容范围

| 能力 | Workers / Pages Functions | 自有 Node.js / Docker |
| --- | --- | --- |
| 登录、歌单、收藏、账号管理 | D1 + AES-GCM | SQLite + 原有加密模块 |
| 网页音质选择、封面、队列 | MP3 档位 | MP3 / FLAC，取决于浏览器 |
| 私有音频缓存 | R2 绑定 | 可选本地磁盘缓存 |
| 轻量音频 M3U8 | Packed Audio | 保留旧输出接口 |
| FFmpeg HLS / MP4 | 无 | 安装 FFmpeg 后使用 |
| 历史清理 | Worker Cron（Pages 需另配维护 Worker） | Node 进程内清理 |

共享 `/api/player/*`、音质策略和流式代理，前端通过 `/capabilities` 自动识别环境。两种数据库、加密密钥和播放签名不能直接互换，迁移需重新登录或单独编写受控数据迁移。

## 推荐：Workers + D1（可选 R2）

在 `cloudflare/` 执行，Node.js 24+：

```sh
npm --prefix ../web ci
npm ci
npx wrangler login
npx wrangler d1 create music-for-url
```

将新库的 ID 写入 `wrangler.jsonc`，保留 `DB` 绑定名；删除仓库站点的 `routes` 或改为自己的域名。

**先选择是否使用 R2**：

- 不使用：删除整个 `r2_buckets` 配置，并将 `vars.AUDIO_CACHE_ENABLED` 设为 `"false"`。只设为 `false` 仍会要求配置中的桶存在。
- 使用：创建自己的私有桶，更新 `bucket_name` 并保留 `AUDIO_CACHE` 绑定名，将 `AUDIO_CACHE_ENABLED` 设为 `"true"`，配置生命周期：

```sh
npx wrangler r2 bucket create music-for-url-private-cache
npx wrangler r2 bucket lifecycle add music-for-url-private-cache expire-audio --prefix audio/v2/ --expire-days 1
npx wrangler r2 bucket lifecycle add music-for-url-private-cache expire-cover --prefix cover/v2/ --expire-days 2
```

然后初始化新库并首次发布：

```sh
npm run db:remote
cp .dev.vars.example .dev.vars.production
# 编辑 ENCRYPTION_KEY 为独立的至少 32 字符随机密钥并安全备份；不要提交此文件
npm run build:assets
npx wrangler deploy --secrets-file .dev.vars.production
```

直接调用 Wrangler 不会触发 npm 的 `predeploy`，因此首次发布必须显式构建 `web/dist`。之后使用 `npm run deploy` 会自动构建并保留已有 Secret。完整说明见 [Cloudflare 仓库文档](../generated/cloudflare)。已有数据库升级先备份 D1，再按实际结构选择该文档中所需的迁移，不能把新库初始化替代旧库迁移；已有密钥不应随更新轮换。

## 现有 Pages 项目接入 React

保留现有 Pages 项目、域名、D1 数据库与 `ENCRYPTION_KEY`，不用新建资源或迁到 Workers。根目录 `functions/[[path]].js` 复用 `cloudflare/src/index.js`，负责同源 `/api/*`；React 前端发布 `web/dist`，不是旧版 `public/`，也不是文档站 `website/.vitepress/dist`。

### Git 构建设置

| 设置 | 值 |
| --- | --- |
| 生产分支 | `master`（发布前核对目标提交） |
| 根目录 | 仓库根目录，留空或 `/`；**不要设为 `web` 或 `cloudflare`** |
| 构建命令 | `npm --prefix cloudflare ci && npm --prefix web ci && npm run build:pages` |
| 构建输出目录 | `web/dist` |
| 构建变量 | `NODE_VERSION=24.22.1`、`SKIP_DEPENDENCY_INSTALL=1` |

`build:pages` 先做 React 类型检查/构建，再编译根 `functions/`，验证服务端依赖可解析；校验产物放入忽略的 `.pages-build/`，不会把 `_worker.js` 混入 `web/dist` 或切换成 Advanced mode。Pages 发布时仍自动编译根 `functions/`。只上传 `web/dist` 静态文件、遗漏 `functions/`，会导致页面可见但 API 不可用。

`web/public/_routes.json` 随 Vite 复制到输出，仅让 `/api/*` 调用 Functions，静态资源和 `/user`、`/accounts` 等 SPA 路由交给 Pages。产物不提供顶层 `404.html`，使用 Pages 默认 SPA 回退。不要把 API 重写到 `index.html`。

参考 [Functions 项目根目录要求](https://developers.cloudflare.com/pages/functions/get-started/)、[Pages SPA 路由](https://developers.cloudflare.com/pages/configuration/serving-pages/)和[构建变量](https://developers.cloudflare.com/pages/configuration/build-image/)。

### 配置与数据检查（发布前）

- 确认 Pages 的 `DB` 仍绑定原数据库，保留原 `ENCRYPTION_KEY` Secret，不重新生成或提交密钥。
- `AUDIO_CACHE` / `AUDIO_CACHE_ENABLED` 沿用原有设置；R2 不使用时不需要新建桶。不要为切换 UI 改其他绑定或权限。
- `cloudflare/wrangler.pages.jsonc` 是**显式 CLI 示例**，不是可直接覆盖生产的配置：项目名和 D1 ID 需要核实，不能保留占位 ID 部署。Git 根目录不存在默认 Wrangler 配置时，使用 Dashboard 的既有绑定。不要假定嵌套的自定义文件会自动接管控制台设置。
- 若选择显式 `--config cloudflare/wrangler.pages.jsonc` 的 CLI 发布，必须先核对其项目名、DB、可选 R2 与现有项目一致；输出相对该配置为 `../web/dist`。本指南不建议为了切 UI 顺便切换配置管理来源。
- 先只读确认实际表结构：`users.platform` 必须允许四平台、`qr_sessions` 允许酷狗、`play_stats` 有 `duration_ms`、存在 `site_stats`。旧库不能靠重跑 `CREATE TABLE IF NOT EXISTS` 放宽 CHECK。仅对确认缺失项安排备份与相应迁移，**不要盲跑全部迁移**；新库/已升级库不需要重复迁移。

Pages 不会自动执行 Worker 的 `scheduled`。既有维护任务应保留；若尚无清理任务，另行规划维护 Worker，不应为本次前端接入自动创建资源。也不要运行 `npm --prefix cloudflare run deploy`，那会部署独立 Worker，而不是现有 Pages。

### 发布验收与回退

先在使用独立测试绑定的预览环境验证；没有隔离绑定时，不用真实登录/写入来测试生产库。检查：首页 HTML 引用 `/assets/*.js` 模块而非 `/js/main.js`；首页和 `/accounts` 有四平台；`/user` 仍只显示支持个人音乐库的网易云与 QQ（酷狗/酷我暂不支持个人歌单库）；直接刷新 `/user`、`/accounts` 正常；`/api/health` 与 `/api/player/capabilities` 返回 JSON 而非 HTML。再在获授权后验证登录、生成、播放和退出。

发布失败可回退到原 Pages 部署，不切换数据库或密钥。数据库迁移须单独备份和审核，不能把回退旧前端当作数据库回滚。相关数据库步骤见 [Cloudflare 文档](../generated/cloudflare)。

## 自有服务器

Node.js / Docker 直接提供冻结的 `public/` 界面，不需要构建 `web/dist`。在仓库根目录执行：

```sh
npm ci
cp env.example .env
npm start
```

设置独立 `ENCRYPTION_KEY`、`PORT`，可选 `DATA_DIR`、`AUDIO_CACHE_ENABLED=true`、`PLAYER_CACHE_DIR` 和 `MUSIC_QUALITY`。持久化 SQLite、缓存目录并备份密钥。网页逐首 MP3 / FLAC 预览不依赖 FFmpeg，旧 HLS / MP4 仍需安装 FFmpeg。Docker 命令见 [服务器部署说明](../generated/server)。

发布后检查 `/api/health`、`/api/player/capabilities`，再使用真实账号测试登录、低 / 高音质、封面、拖动进度与退出撤销。R2 缓存可先关闭用于排障。
