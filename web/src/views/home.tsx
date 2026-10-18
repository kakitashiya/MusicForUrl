import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Heart, Library, MonitorPlay, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { readGeneratorPlatform, writeGeneratorPlatform } from '@/lib/storage';
import type { GeneratedLink, Platform } from '@/lib/types';
import { imageSrc } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/motion/primitives';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { useUi } from '@/stores/ui';

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
    switchPlatform(target);
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Music links</p>
          <h1 className="text-xl font-semibold">链接生成</h1>
        </div>
        <Button variant="outline" asChild>
          <Link to="/user"><Library />我的歌单</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Segmented
            ariaLabel="音乐平台"
            value={platform}
            onChange={switchPlatform}
            options={[
              { value: 'netease', label: '网易云音乐' },
              { value: 'qq', label: 'QQ 音乐' },
            ]}
          />
          <form
            className="flex gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (!loggedIn) { openLogin(platform); return; }
              void generate(input, platform);
            }}
          >
            <Input
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="粘贴歌单链接或 ID"
              aria-label="歌单链接或 ID"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={busy}>{busy ? '生成中…' : '生成'}</Button>
          </form>
          {!loggedIn && (
            <p className="text-xs text-muted-foreground">
              需要先登录{platform === 'qq' ? 'QQ 音乐' : '网易云音乐'}账号。
              <button type="button" className="ml-1 text-primary underline-offset-2 hover:underline"
                onClick={() => openLogin(platform)}>立即登录</button>
            </p>
          )}
        </CardContent>
      </Card>

      {result?.playlist && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <img
                src={imageSrc(result.playlist.cover)}
                alt=""
                className="size-14 rounded-md border border-border object-cover"
                referrerPolicy="no-referrer"
                onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
              />
              <div className="min-w-0">
                <CardTitle className="truncate">{result.playlist.name}</CardTitle>
                <p className="text-[13px] text-muted-foreground">
                  {result.playlist.songCount ?? result.playlist.trackCount ?? 0} 首
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.urls.map(option => (
              <div key={option.type} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{option.label}</Badge>
                  {option.type === result.default && <Badge variant="outline">默认</Badge>}
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{option.url}</p>
                {option.note && <p className="mt-1 text-xs text-muted-foreground">{option.note}</p>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyLink}><Copy />复制链接</Button>
              <Button variant="outline" onClick={() => void preview()}><MonitorPlay />预览播放</Button>
              <Button variant="outline" onClick={() => void toggleFavorite()}>
                <Heart className={favorited ? 'fill-current' : undefined} />
                {favorited ? '已收藏' : '收藏'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              生成的是本站签名链接，默认 24 小时有效；退出对应账号会立即撤销。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/preview" className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <span className="flex items-center gap-2 text-sm font-medium"><MonitorPlay className="size-4" />媒体预览</span>
          <span className="mt-1 block text-[13px] text-muted-foreground">打开媒体链接或本地文件</span>
        </Link>
        <Link to="/accounts" className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <span className="flex items-center gap-2 text-sm font-medium"><UserRound className="size-4" />账号管理</span>
          <span className="mt-1 block text-[13px] text-muted-foreground">网易云音乐 · QQ 音乐</span>
        </Link>
      </div>
    </div>
  );
}
