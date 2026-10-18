import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Heart, Library, Link2, MonitorPlay } from 'lucide-react';
import { api } from '@/lib/api';
import { readGeneratorPlatform, writeGeneratorPlatform } from '@/lib/storage';
import type { GeneratedLink, Platform } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/input';
import { CoverArt, PlaylistCard } from '@/components/playlist-card';
import { ListItem, ListReveal, Segmented } from '@/motion/primitives';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { useUi } from '@/stores/ui';

function RecentGrid({ platform }: { platform: Platform }) {
  const loggedIn = useAuth(state => !!state.users[platform]);
  const openLogin = useUi(state => state.openLogin);
  const openPlaylist = usePlayer(state => state.open);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['recent', platform, 'home'],
    queryFn: () => api.recent(platform, 0, 6),
    enabled: loggedIn,
    staleTime: 60_000,
  });

  async function play(playlistId: string) {
    await openPlaylist(platform, playlistId);
    navigate('/preview');
  }

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">最近播放</h2>
        <Link to="/user" className="text-[12.5px] font-medium text-primary hover:underline">查看全部 →</Link>
      </div>

      {!loggedIn ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-5 py-6 text-[13px] text-muted-foreground">
          登录后这里会显示最近播放的歌单。
          <Button variant="outline" size="sm" onClick={() => openLogin(platform)}>登录音乐账号</Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-xl" />)}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-6 text-[13px] text-muted-foreground">
          最近 30 天还没有播放记录。生成一个链接并播放后会出现在这里。
        </div>
      ) : (
        <ListReveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {data.data.map(item => (
            <ListItem key={item.playlistId}>
              <PlaylistCard
                id={item.playlistId}
                name={item.name}
                cover={item.cover}
                meta={`${item.playCount} 次播放`}
                onOpen={() => void play(item.playlistId)}
              />
            </ListItem>
          ))}
        </ListReveal>
      )}
    </section>
  );
}

export function HomeView() {
  const [platform, setPlatform] = React.useState<Platform>(readGeneratorPlatform);
  const [input, setInput] = React.useState('');
  const [result, setResult] = React.useState<GeneratedLink | null>(null);
  const [favorited, setFavorited] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const users = useAuth(state => state.users);
  const openLogin = useUi(state => state.openLogin);
  const openPlaylist = usePlayer(state => state.open);
  const loggedIn = !!users[platform];

  function switchPlatform(next: Platform) {
    setPlatform(next);
    writeGeneratorPlatform(next);
    setResult(null);
    setFavorited(false);
  }

  const generate = React.useCallback(async (raw: string, target: Platform) => {
    if (!raw.trim()) return;
    setBusy(true);
    try {
      const data = await api.generate(target, raw.trim());
      setResult(data);
      setFavorited(await api.favoriteCheck(target, data.playlist?.id ?? '').catch(() => false));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }, []);

  // 支持 /?play=<歌单 ID>&platform=<平台> 深链，与旧版行为一致
  React.useEffect(() => {
    const id = params.get('play');
    if (!id) return;
    const target: Platform = params.get('platform') === 'qq' ? 'qq' : 'netease';
    setPlatform(target);
    writeGeneratorPlatform(target);
    setInput(id);
    if (useAuth.getState().tokens[target]) void generate(id, target);
  }, [params, generate]);

  async function toggleFavorite() {
    const playlist = result?.playlist;
    if (!playlist) return;
    try {
      if (favorited) {
        await api.removeFavorite(platform, playlist.id);
        setFavorited(false);
        toast.success('已取消收藏');
      } else {
        await api.addFavorite(platform, {
          playlistId: playlist.id,
          playlistName: playlist.name,
          playlistCover: playlist.cover,
        });
        setFavorited(true);
        toast.success('收藏成功');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success('链接已复制');
    } catch {
      toast.error('复制失败，请手动选择链接');
    }
  }

  async function preview() {
    const playlist = result?.playlist;
    if (!playlist) return;
    await openPlaylist(platform, playlist.id);
    navigate('/preview');
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      {/* 生成器是页面唯一的核心动作，因此放在品牌色最重的横幅里 */}
      <section className="hero-surface relative overflow-hidden rounded-2xl p-6 md:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-40 size-[420px] rounded-full"
          style={{ backgroundImage: 'radial-gradient(circle, rgb(111 199 234 / 42%), transparent 66%)' }}
        />
        <div className="relative">
          <h1 className="text-[27px] font-semibold leading-tight tracking-tight">把歌单变成播放链接</h1>
          <p className="mt-2 text-[13.5px] text-[var(--hero-muted)]">
            粘贴网易云或 QQ 音乐歌单，生成可直接在 VRChat 与播放器中使用的 M3U8。
          </p>

          <Segmented
            ariaLabel="音乐平台"
            tone="hero"
            className="mt-5"
            value={platform}
            onChange={switchPlatform}
            options={[
              { value: 'netease', label: '网易云音乐' },
              { value: 'qq', label: 'QQ 音乐' },
            ]}
          />

          <form
            className="mt-3 flex flex-col gap-2.5 sm:flex-row"
            onSubmit={event => {
              event.preventDefault();
              if (!loggedIn) { openLogin(platform); return; }
              void generate(input, platform);
            }}
          >
            <div className="flex h-[52px] flex-1 items-center gap-3 rounded-xl bg-[var(--hero-field)] px-4 text-[var(--hero-field-foreground)] shadow-lg">
              <Link2 className="size-4 shrink-0" />
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="粘贴歌单链接或 ID"
                aria-label="歌单链接或 ID"
                autoComplete="off"
                spellCheck={false}
                className="h-full flex-1 bg-transparent text-sm text-[#123043] outline-none placeholder:text-[var(--hero-field-foreground)]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="h-[52px] shrink-0 rounded-xl bg-white px-8 text-sm font-bold text-[var(--hero-mid)] shadow-lg transition-transform hover:-translate-y-px disabled:opacity-70"
            >
              {busy ? '生成中…' : '生成链接'}
            </button>
          </form>

          {!loggedIn && (
            <p className="mt-3 text-[12.5px] text-[var(--hero-muted)]">
              需要先登录{platform === 'qq' ? 'QQ 音乐' : '网易云音乐'}账号。
              <button
                type="button"
                onClick={() => openLogin(platform)}
                className="ml-1 font-semibold text-white underline-offset-2 hover:underline"
              >
                立即登录
              </button>
            </p>
          )}
        </div>
      </section>

      {result?.playlist && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:flex-row md:items-center">
          <CoverArt
            src={result.playlist.cover}
            seed={result.playlist.id}
            className="size-[62px] shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15.5px] font-semibold">{result.playlist.name}</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {result.playlist.songCount ?? result.playlist.trackCount ?? 0} 首 · 链接有效期 24 小时 · 退出登录会立即撤销
            </p>
            <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">{result.url}</code>
              <button
                type="button"
                onClick={copyLink}
                aria-label="复制链接"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Copy className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={copyLink}><Copy />复制</Button>
            <Button variant="outline" onClick={() => void preview()}><MonitorPlay />预览</Button>
            <Button variant="outline" onClick={() => void toggleFavorite()}>
              <Heart className={favorited ? 'fill-current' : undefined} />
              {favorited ? '已收藏' : '收藏'}
            </Button>
          </div>
        </section>
      )}

      <RecentGrid platform={platform} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/preview"
          className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-accent"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <MonitorPlay className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">媒体预览</span>
            <span className="block text-[12.5px] text-muted-foreground">打开媒体链接或本地文件</span>
          </span>
        </Link>
        <Link
          to="/user"
          className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-accent"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Library className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">我的音乐</span>
            <span className="block text-[12.5px] text-muted-foreground">歌单、收藏与播放记录</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
