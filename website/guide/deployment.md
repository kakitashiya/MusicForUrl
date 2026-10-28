# 部署方式与前端版本

## 前端与发布目录

| 部署路径 | 发布内容 | 状态 |
| --- | --- | --- |
| Workers Static Assets | `web/` 构建为 `web/dist`，Worker 同时处理 API | React 主线，推荐 |
| Node.js / Docker | `server.js` 提供 `public/` | 冻结的旧前端 |
| Cloudflare Pages Functions | `wrangler.pages.jsonc` 发布 `public/` + 根目录 `functions/` | 旧版兼容路径，不是 React 部署 |
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

直接调用 Wrangler 不会触发 npm 的 `predeploy`，因此首次发布必须显式构建 `web/dist`。之后使用 `npm run deploy` 会自动构建并保留已有 Secret。完整说明见 [Cloudflare 仓库文档](../generated/cloudflare)。已有数据库升级先备份 D1，再按该文档的迁移顺序执行，不能把新库初始化替代旧库迁移；已有密钥不应随更新轮换。

## 旧版 Pages Functions

根目录 `functions/[[path]].js` 复用 Worker 处理器，`cloudflare/wrangler.pages.jsonc` 是旧前端示例，输出目录明确为 `public/`。此路径不使用 `web/dist`，无需安装或构建 `web/`。创建并初始化自己的 D1、修改配置中的 D1 ID；R2 可选，不使用时删除 `r2_buckets` 并保持 `AUDIO_CACHE_ENABLED=false`，使用时先创建私有桶、更新桶名并启用缓存。在 Pages 项目设置独立的 `ENCRYPTION_KEY` Secret。从仓库根目录执行：

```sh
npm --prefix cloudflare ci
npx --prefix cloudflare wrangler pages deploy public --config cloudflare/wrangler.pages.jsonc
```

Pages Functions 需要 D1 绑定与 Secret，启用缓存时还需 R2，不能仅上传静态 HTML。本项目每日清理使用 Worker `scheduled`，Pages 部署须另配维护 Worker 的 Cron 执行 schema 中过期表清理，或使用推荐的 Workers 部署。参考 [Pages Functions 绑定](https://developers.cloudflare.com/pages/functions/bindings/)与 [Workers Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。

## 自有服务器

Node.js / Docker 直接提供冻结的 `public/` 界面，不需要构建 `web/dist`。在仓库根目录执行：

```sh
npm ci
cp env.example .env
npm start
```

设置独立 `ENCRYPTION_KEY`、`PORT`，可选 `DATA_DIR`、`AUDIO_CACHE_ENABLED=true`、`PLAYER_CACHE_DIR` 和 `MUSIC_QUALITY`。持久化 SQLite、缓存目录并备份密钥。网页逐首 MP3 / FLAC 预览不依赖 FFmpeg，旧 HLS / MP4 仍需安装 FFmpeg。Docker 命令见 [服务器部署说明](../generated/server)。

发布后检查 `/api/health`、`/api/player/capabilities`，再使用真实账号测试登录、低 / 高音质、封面、拖动进度与退出撤销。R2 缓存可先关闭用于排障。
