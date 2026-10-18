# 平台与账号模型

这份文档说明「支持哪些平台、支持到什么程度、账号与数据怎么归属」。它是 `cloudflare/src/platforms.js`（后端注册表）与 `web/src/lib/platform-data.js`（前端能力表）的说明，两边由 `cloudflare/tests/platform-parity.test.js` 锁定一致。

## 能力矩阵

| 平台 | 路径前缀 | 鉴权头 | 账号接入 | 歌单解析 | 音源播放 |
| --- | --- | --- | --- | --- | --- |
| 网易云音乐 | `/api` | `x-token` | 扫码 / 验证码 / 密码 / Cookie | 支持 | 支持 |
| QQ 音乐 | `/api/qq` | `x-qq-token` | 扫码 | 支持 | 支持 |
| 酷狗音乐 | `/api/kugou` | `x-kugou-token` | 未实现 | 支持 | 支持（受版权限制） |
| 酷我音乐 | `/api/kuwo` | `x-kuwo-token` | 未实现 | 受上游风控影响 | 支持 |

> **兼容性红线**：`/api/...` 必须继续等于网易云、`/api/qq/...` 必须继续等于 QQ 音乐。线上 VRChat 房间与播放器里已经签发的 M3U8 链接就是这个形状，改前缀等于全部失效。`cloudflare/tests/platforms.test.js` 的第一条测试锁定了这一点。

## 账号接入

`account: true` 的平台有完整的账号体系：服务端保存加密 Cookie、有头像与昵称、能读用户歌单、能收藏、有播放记录。

`account: false` 的平台**只有游客能力**：

- 不需要登录即可解析公开歌单并生成播放链接。
- 没有 `users` 行，因此**没有个人歌单、收藏与播放记录**；`/api/<platform>/playlist/user`、`/favorites`、`/history/*` 一律返回 403 并附带原因；`/auth/*` 返回 501（`/auth/status` 除外，它返回 `{logged:false, supported:false}`）。
- 播放链接是**无状态令牌**：载荷里 `u = 0`、`h = 'guest'`，只验 HMAC 不查库。这同时省掉了每个音频分片请求的一次 D1 读取。代价是没有「退出登录即撤销」——链接有效期内一直可用，与匿名分享链接等价。
- 播放记录不写 `play_stats`（没有 `users` 行，外键无法成立），但仍然写入 Analytics Engine，因此会计入「关于」页的匿名汇总。

### 酷狗的上游接口

| 用途 | 接口 | 备注 |
| --- | --- | --- |
| 歌单元数据 | `m.kugou.com/plist/list/{id}?json=true` | **忽略 page / pagesize，永远只返回前 10 首**，因此只用来取名称与封面 |
| 歌单曲目 | `mobiles.kugou.com/api/v3/special/song?specialid={id}&page=N&pagesize=30` | 真正可用的分页接口 |
| 音源 | `m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash={hash}` | 付费曲目返回 `error: "需要付费"` 且没有 URL |

歌曲 ID 是**复合**的：`基础hash[-320hash[-sqhash]]`。M3U8 只带一个 ID，把三档 hash 一起编码进去，播放时才能按音质选择档位；缺失的档位直接省略。同一首歌在不同分页里可能带着不同的档位（有时只有基础 hash），所以去重按**基础 hash** 做，并把档位取并集。

酷狗的 Web 播放接口（`wwwapi.kugou.com/yy/index.php?r=play/getdata`）要求 `signature` 参数，签名算法随前端发版变化，因此**没有接入官方账号**。付费曲目在游客视角下无法播放，播放器会给出统一的版权/VIP 提示。

### 酷我的上游接口

| 用途 | 接口 | 备注 |
| --- | --- | --- |
| 歌单 | `www.kuwo.cn/api/www/playlist/playListInfo` | 带风控：必须同时带 Cookie 与匹配的 `csrf` 头，数据中心 IP 常被直接拒绝 |
| 音源 | `antiserver.kuwo.cn/anti.s?type=convert_url&rid=MUSIC_{id}&format=mp3&br={br}` | 无需登录，支持 128 / 192 / 320 kbps 三档 |

歌单接口会先请求一次 `https://www.kuwo.cn/` 拿 Cookie，再从 `Hm_Iuvt_*` / `kw_token` 里取 csrf 值。仍然被拒时返回可操作的提示。运维可以用 `KUWO_COOKIE` 变量直接贴一份浏览器 Cookie 绕过引导：

```
npx wrangler secret put KUWO_COOKIE   # 内容形如 "kw_token=xxx; Hm_Iuvt_xxx=yyy"
```

## 多账号与数据归属

### 服务端

数据归属只有一条规则，且由 schema 保证：

```
users(id, platform, platform_user_id, ...)   UNIQUE (platform, platform_user_id)
  ↑
  ├── playlists    PRIMARY KEY (user_id, playlist_id)
  ├── favorites    PRIMARY KEY (user_id, playlist_id)
  └── play_stats   PRIMARY KEY (user_id, playlist_id, song_id)
```

- `users.id` 唯一对应一个 `(platform, platform_user_id)`，也就是一个真实账号。
- 所有个人数据的主键第一列都是 `user_id`，因此**换账号就是换一份数据**，不存在串号。
- 网易云与 QQ 音乐即使账号 ID 相同也是两条不同的 `users` 行，跨平台不会混合。
- 播放令牌绑定 `(platform, user_id, playlist_id, token_hash)`：**退出登录会立即撤销已签发的链接**；切换账号不会影响另一个账号已签发的链接。

### 浏览器

| 键 | 作用 |
| --- | --- |
| `token` / `qqToken` | **当前生效**的令牌，与旧版前端逐字节一致，请求头也照旧 |
| `mfu:accounts` | 新增的登记表：本机登录过的账号（平台、账号 ID、昵称、头像、令牌），最多 8 个，最近的排在最前 |
| `mfu:account:<platform>:<userId>` | 本机备注（名称、备注），不跨设备同步 |

`mfu:accounts` 只是「本机记住过哪些账号」的便利功能，不参与鉴权——鉴权永远只看 `token` / `qqToken`。同一个账号重新登录会轮换令牌，登记表会用新令牌覆盖旧的（旧令牌在服务端已失效，留着只会让切换时得到 401）。

### 汇总口径

「关于」页的统计是**全站汇总**，不区分账号也不含个人信息：

| 指标 | 来源 | 更新方式 |
| --- | --- | --- |
| 累计解析歌曲 | `site_stats.parsedSongs` | 生成链接时按歌单曲目数累加（实时） |
| 生成链接 | `site_stats.generatedLinks` | 同上 |
| 累计播放 / 总播放时长 / 收录曲目 / 歌单数 | 从 `play_stats` 聚合 | cron 与惰性刷新，`STATS_REFRESH_MINUTES` 控制频率（默认 60） |
| 使用人数 | `users` 行数 | 同上 |

聚合是一次全表扫描，因此绝不进入请求路径。播放量增长到扫描成本敏感时，把 `STATS_REFRESH_MINUTES` 调大即可，代价只是「关于」页的数字变旧。

## 新增一个平台要改什么

1. **`cloudflare/src/platforms.js`**：加一项——路径前缀、鉴权头、`account` / `library` / `playback`、歌曲与歌单 ID 的正则、音频与封面域名白名单。
2. **`cloudflare/src/upstream/<name>.js`**：实现 `getPlaylistDetail(playlistId, cookie, env)` 与 `getSongResource(songId, cookie, env)`，返回结构照抄现有适配器。
3. **`cloudflare/src/playlists.js`**：`adapter()` 加一个分支；`PLAYLIST_URL_RULES` 与 `PLAYLIST_QUERY_KEYS` 加该平台的链接形状。
4. **`web/src/lib/platform-data.js`**：加同名的一项，`label` / `account` / `library` / `playback` 必须与后端一致，否则 parity 测试会红。
5. 跑 `npm test`（根目录与 `cloudflare/` 各一次）。路由、校验、遥测、音源白名单、前端入口都会跟着注册表走，不需要再改别处。
