# MusicForUrl

[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/znc15/MusicForUrl/blob/master/LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-3c873a)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/cloudflare-workers%20%2B%20d1-f38020)](https://developers.cloudflare.com/workers/)

把网易云音乐、QQ 音乐、酷狗与酷我的歌单转换成轻量音频 M3U8 直链，自带账号管理、收藏、播放记录和站内播放器。前端 React + Vite，后端可运行在 **Cloudflare Workers + D1**（可选私有 R2）或 **自有 Node.js / Docker + SQLite**，两种部署共用播放器、音质策略与媒体代理。

- 在线使用：<https://music.nyasakura.com/>
- 文档站：<https://znc15.github.io/MusicForUrl/>

![MusicForUrl 工作台与媒体预览](.github/assets/workspace-preview.jpg)

## 功能

- **歌单直链**：四个平台的歌单生成签名 M3U8，可复制、可站内预览。
- **多账号**：同一平台记住多个账号，歌单缓存、收藏与播放记录按账号严格隔离。
- **站内播放器**：逐首播放、音质切换、自动续播、封面队列与单一音量控制。
- **音质回退**：标准 / 较高 / 高品质 MP3 逐级尝试，无损 FLAC 仅自有服务器提供。
- **VRChat / 台 K**：链接默认有效 24 小时（最长 48 小时），房间播放器需切到 **AVPro / Stream** 模式。
- **界面**：可收起侧边栏、亮 / 暗 / 跟随系统主题、motion 过渡并尊重「减少动态效果」。

## 平台支持

| 平台 | 登录方式 | 歌单解析 | 音源播放 |
| --- | --- | --- | --- |
| 网易云音乐 | 扫码 / 验证码 / 密码 / Cookie | 支持 | 支持 |
| QQ 音乐 | 扫码 | 支持 | 支持 |
| 酷狗音乐 | 扫码 | 支持 | 支持 |
| 酷我音乐 | 密码 / 手机短信 | 支持 | 支持 |

酷狗与酷我的登录只用于识别账号身份，歌单和音源仍走公开接口：登录不提升音质，付费曲目无法播放，也暂未接入个人歌单、收藏与播放记录。未登录同样可以生成播放链接。

能力矩阵由 `cloudflare/src/platforms.js` 与 `web/src/lib/platform-data.js` 定义并由测试锁定，上游接口与扩展方式见[平台说明](cloudflare/PLATFORMS.md)。

## 快速开始

需要 Node.js 24+ 与 npm。`web/`（前端）与 `cloudflare/`（Worker）是两套依赖：

```powershell
git clone https://github.com/znc15/MusicForUrl.git
cd MusicForUrl/web
npm ci
cd ../cloudflare
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

将 `.dev.vars` 中的 `ENCRYPTION_KEY` 换成至少 32 字符的随机密钥，占位值会被拒绝：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`npm run dev` 会先构建 `web/` 再以本地 D1 启动 Wrangler。回归测试在 `cloudflare/` 执行 `npm test`。

## 部署

Cloudflare 版由同一个 Worker 发布静态资源与 API，不能用纯静态 Pages 上传：

```powershell
cd cloudflare
npx wrangler login
npx wrangler d1 create music-for-url   # 把 database_id 写入 wrangler.jsonc
npm run db:remote
Copy-Item .dev.vars.example .dev.vars.production
npx wrangler deploy --secrets-file .dev.vars.production
npm run deploy                          # 后续更新
```

首次部署前务必删除或替换 `wrangler.jsonc` 中属于在线站点的 `routes`。升级顺序、环境变量与自定义域名见[部署文档](cloudflare/README.md)，自有服务器与 Docker 见 [README.node-docker.md](README.node-docker.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [cloudflare/README.md](cloudflare/README.md) | Worker 实现、R2 音频缓存、D1 表结构与站点记录 |
| [cloudflare/PLATFORMS.md](cloudflare/PLATFORMS.md) | 四个平台的上游接口、风控与扩展方式 |
| [cloudflare/ANIMATION.md](cloudflare/ANIMATION.md) | 动画时长、参数与复用示例 |
| [website/guide](website/guide/start.md) | 使用指南、音质限制、性能、部署与选型 |
| [README.node-docker.md](README.node-docker.md) | Node.js / Docker 部署与冻结的旧前端 |
| [Issues](https://github.com/znc15/MusicForUrl/issues) | 问题反馈 |

## 项目结构

```text
web/          Cloudflare 版前端（React + Vite + Tailwind + shadcn/ui）
cloudflare/   Worker API、平台适配、D1 结构与回归测试
public/       冻结的旧前端，仅随 Node.js / Docker 部署提供
lib/          播放器策略与 QQ 音乐适配（两个运行时共用）
server.js     Node.js 服务端入口（routes/、deploy/）
website/      VitePress 文档站
```

## License

[MIT](LICENSE)
