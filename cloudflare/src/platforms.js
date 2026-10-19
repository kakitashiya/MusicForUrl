// 平台注册表：所有与平台相关的差异（路径前缀、鉴权头、ID 形状、允许的音频域名、
// 能力边界）都收敛到这里。新增平台只需要在 PLATFORMS 里加一项，路由、校验、
// 音源白名单、遥测与前端能力表都会跟着走。
//
// 兼容性红线：`/api/...` 必须继续等于网易云、`/api/qq/...` 必须继续等于 QQ 音乐。
// 线上 VRChat 里已经签发的 M3U8 链接就是这个形状，改前缀等于全部失效。

/**
 * account  —— 支持账号登录（有 users 行与 Cookie；登录弹窗里会出现入口）
 * library  —— 「我的音乐」是否可用（歌单 / 收藏 / 播放记录都依赖账号）
 * playback —— 是否能在站内播放与生成 M3U8
 * guestPlayback —— 未登录也能解析与播放；登录只补充账号身份（酷狗 / 酷我）
 */
const PLATFORMS = {
  netease: {
    id: 'netease',
    label: '网易云音乐',
    prefix: '/api',
    tokenHeader: 'x-token',
    account: true,
    library: true,
    playback: true,
    // 歌单 ID 与歌曲 ID 都是纯数字
    songIdPattern: /^\d{1,20}$/,
    playlistIdPattern: /^\d{1,20}$/,
    // 上游 CDN 域名白名单。上游返回的任何 URL 都必须落在这里面才会被代理。
    audioHosts: /(^|\.)music\.126\.net$/,
    imageHosts: /(^|\.)(music\.126\.net|music\.163\.com|126\.net)$/,
  },

  qq: {
    id: 'qq',
    label: 'QQ 音乐',
    prefix: '/api/qq',
    tokenHeader: 'x-qq-token',
    account: true,
    library: true,
    playback: true,
    // QQ 音乐用 songmid（字母数字）而不是数字 ID
    songIdPattern: /^[A-Za-z0-9]{1,30}$/,
    playlistIdPattern: /^\d{1,20}$/,
    audioHosts: /(^|\.)(qq\.com|gtimg\.cn|mcobj\.com)$/,
    imageHosts: /(^|\.)(qq\.com|gtimg\.cn|qlogo\.cn)$/,
  },

  // 酷狗：支持扫码登录（账号身份），但歌单与音源仍走游客公开接口，
  // 所以没有「我的音乐」；未登录时照常解析与播放。
  kugou: {
    id: 'kugou',
    label: '酷狗音乐',
    prefix: '/api/kugou',
    tokenHeader: 'x-kugou-token',
    account: true,
    library: false,
    playback: true,
    guestPlayback: true,
    // 酷狗用 32 位 hash 标识歌曲；适配器会把 320 与无损两档的 hash 用「-」拼在后面，
    // 这样 M3U8 里的单个 ID 也能带上音质信息
    songIdPattern: /^[A-Fa-f0-9]{32}(?:-[A-Fa-f0-9]{32}){0,2}$/,
    playlistIdPattern: /^\d{1,20}$/,
    audioHosts: /(^|\.)(kugou\.com|kglink\.cn|kgimg\.com|kugou\.net)$/,
    imageHosts: /(^|\.)(kugou\.com|kgimg\.com|kglink\.cn)$/,
  },

  // 酷我：站点没有扫码登录接口（只有账号密码 / 短信 / 微信 OAuth），
  // 因此保持纯游客能力；未登录照常解析与播放。
  kuwo: {
    id: 'kuwo',
    label: '酷我音乐',
    prefix: '/api/kuwo',
    tokenHeader: 'x-kuwo-token',
    account: false,
    library: false,
    playback: true,
    guestPlayback: true,
    songIdPattern: /^\d{1,20}$/,
    playlistIdPattern: /^\d{1,20}$/,
    audioHosts: /(^|\.)(kuwo\.cn|kwcdn\.cn|kuwo\.com)$/,
    imageHosts: /(^|\.)(kuwo\.cn|kwcdn\.cn|kuwo\.com)$/,
  },
};

const PLATFORM_IDS = Object.keys(PLATFORMS);

// 最长前缀优先，否则 /api/qq 会被 /api 抢先匹配
const PREFIXES = PLATFORM_IDS
  .map((id) => ({ id, prefix: PLATFORMS[id].prefix }))
  .sort((a, b) => b.prefix.length - a.prefix.length);

const DEFAULT_PLATFORM = 'netease';

function platform(id) {
  return PLATFORMS[id] || null;
}

function isPlatform(id) {
  return Object.hasOwn(PLATFORMS, id);
}

/** 从请求路径解析平台。返回 null 表示这个路径不属于任何平台的命名空间。 */
function platformFromPath(pathname) {
  for (const entry of PREFIXES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      return {
        id: entry.id,
        // 去掉平台前缀后的剩余路径，例如 /api/qq/playlist/parse → /playlist/parse
        path: pathname.slice(entry.prefix.length) || '/',
      };
    }
  }
  return null;
}

function tokenHeader(platformId) {
  return PLATFORMS[platformId]?.tokenHeader || 'x-token';
}

/** 游客平台不读 Cookie，解析音源时统一传空串。 */
function cookieFor(user) {
  return user?.guest ? '' : null;
}

/** 游客用户对象：id 为 0，不带任何 Cookie，仅用于复用播放链路。 */
function guestUser(platformId) {
  return {
    id: 0,
    platform: platformId,
    platform_user_id: '',
    nickname: '',
    avatar: '',
    vip_type: 0,
    cookie_cipher: '',
    token_hash: 'guest',
    guest: true,
  };
}

/** 供前端渲染能力矩阵，也是「平台支持范围」的唯一事实来源。 */
function capabilityMatrix() {
  return PLATFORM_IDS.map((id) => {
    const item = PLATFORMS[id];
    return {
      id,
      label: item.label,
      account: item.account,
      library: item.library,
      playback: item.playback,
    };
  });
}

export {
  DEFAULT_PLATFORM, PLATFORMS, PLATFORM_IDS,
  capabilityMatrix, cookieFor, guestUser, isPlatform, platform, platformFromPath, tokenHeader,
};
