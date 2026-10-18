import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Link2, MonitorPlay, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { readPersonalPlatform, writePersonalPlatform } from '@/lib/storage';
import type { FavoriteItem, HistoryItem, Paged, Platform, PlaylistSummary, TopSong } from '@/lib/types';
import { formatDateTime, imageSrc } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListItem, ListReveal, Segmented } from '@/motion/primitives';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { useUi } from '@/stores/ui';

const PAGE_SIZE = 20;

function usePagedList<T>(
  queryKey: unknown[],
  fetcher: (offset: number, limit: number) => Promise<Paged<T>>,
  enabled: boolean,
) {
  const [page, setPage] = React.useState(0);
  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () => fetcher(page * PAGE_SIZE, PAGE_SIZE),
    enabled,
    placeholderData: previous => previous,
  });
  return {
    items: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    page,
    setPage,
    pageCount: Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE)),
  };
}

function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        <ChevronLeft />上一页
      </Button>
      <span className="text-xs text-muted-foreground">{page + 1} / {pageCount}</span>
      <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => onChange(page + 1)}>
        下一页<ChevronRight />
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-16 w-full" />)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">{text}</p>;
}

function PlaylistRow({ cover, name, meta, children }: {
  cover: string;
  name: string;
  meta: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
      <img
        src={imageSrc(cover)}
        alt=""
        className="size-11 shrink-0 rounded-md border border-border object-cover"
        referrerPolicy="no-referrer"
        onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  );
}

export function UserView() {
  const [platform, setPlatform] = React.useState<Platform>(readPersonalPlatform() || 'netease');
  const users = useAuth(state => state.users);
  const openLogin = useUi(state => state.openLogin);
  const openPlaylist = usePlayer(state => state.open);
  const navigate = useNavigate();
  const loggedIn = !!users[platform];

  React.useEffect(() => { writePersonalPlatform(platform); }, [platform]);
  React.useEffect(() => {
    if (!users[platform]) setPlatform(platform === 'qq' ? 'netease' : 'qq');
    // 仅在当前平台未登录且另一个平台已登录时切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users[platform]]);

  const playlists = usePagedList<PlaylistSummary>(
    ['playlists', platform], (offset, limit) => api.userPlaylists(platform, offset, limit), loggedIn,
  );
  const favorites = usePagedList<FavoriteItem>(
    ['favorites', platform], (offset, limit) => api.favorites(platform, offset, limit), loggedIn,
  );
  const recent = usePagedList<HistoryItem>(
    ['recent', platform], (offset, limit) => api.recent(platform, offset, limit), loggedIn,
  );
  const top = useQuery({
    queryKey: ['top', platform],
    queryFn: () => api.top(platform, 20),
    enabled: loggedIn,
  });

  if (!loggedIn) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">登录后可以查看歌单、收藏和最近播放。</p>
            <Button onClick={() => openLogin(platform)}>登录音乐账号</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">My music</p>
          <h1 className="text-xl font-semibold">我的音乐</h1>
        </div>
        <Segmented
          ariaLabel="音乐平台"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'netease', label: '网易云音乐' },
            { value: 'qq', label: 'QQ 音乐' },
          ]}
        />
      </div>

      <Tabs defaultValue="playlists">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="playlists">我的歌单</TabsTrigger>
          <TabsTrigger value="favorites">我的收藏</TabsTrigger>
          <TabsTrigger value="recent">最近播放</TabsTrigger>
          <TabsTrigger value="top">最常播放</TabsTrigger>
        </TabsList>

        <TabsContent value="playlists">
          {playlists.loading ? <ListSkeleton /> : playlists.items.length === 0 ? <Empty text="这个账号下没有歌单" /> : (
            <ListReveal className="flex flex-col gap-2">
              {playlists.items.map(item => (
                <ListItem key={item.id}>
                  <PlaylistRow
                    cover={item.cover}
                    name={item.name}
                    meta={`${item.trackCount ?? item.songCount ?? 0} 首`}
                  >
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/?play=${item.id}&platform=${platform}`}><Link2 />生成链接</Link>
                    </Button>
                  </PlaylistRow>
                </ListItem>
              ))}
            </ListReveal>
          )}
          <Pager page={playlists.page} pageCount={playlists.pageCount} onChange={playlists.setPage} />
        </TabsContent>

        <TabsContent value="favorites">
          {favorites.loading ? <ListSkeleton /> : favorites.items.length === 0 ? <Empty text="还没有收藏歌单" /> : (
            <ListReveal className="flex flex-col gap-2">
              {favorites.items.map(item => (
                <ListItem key={item.playlistId}>
                  <PlaylistRow
                    cover={item.cover}
                    name={item.name}
                    meta={item.createdAt ? `收藏于 ${formatDateTime(item.createdAt)}` : ''}
                  >
                    <Button variant="ghost" size="icon" aria-label="播放" onClick={() => {
                      void openPlaylist(platform, item.playlistId);
                      navigate('/preview');
                    }}><MonitorPlay /></Button>
                    <Button variant="ghost" size="icon" aria-label="取消收藏" onClick={async () => {
                      try {
                        await api.removeFavorite(platform, item.playlistId);
                        toast.success('已取消收藏');
                        void favorites.setPage(favorites.page);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : '操作失败');
                      }
                    }}><Trash2 /></Button>
                  </PlaylistRow>
                </ListItem>
              ))}
            </ListReveal>
          )}
          <Pager page={favorites.page} pageCount={favorites.pageCount} onChange={favorites.setPage} />
        </TabsContent>

        <TabsContent value="recent">
          {recent.loading ? <ListSkeleton /> : recent.items.length === 0 ? <Empty text="最近 30 天没有播放记录" /> : (
            <ListReveal className="flex flex-col gap-2">
              {recent.items.map(item => (
                <ListItem key={item.playlistId}>
                  <PlaylistRow
                    cover={item.cover}
                    name={item.name}
                    meta={`${formatDateTime(item.playedAt)} · 播放 ${item.playCount} 次`}
                  >
                    <Button variant="ghost" size="icon" aria-label="播放" onClick={() => {
                      void openPlaylist(platform, item.playlistId);
                      navigate('/preview');
                    }}><MonitorPlay /></Button>
                  </PlaylistRow>
                </ListItem>
              ))}
            </ListReveal>
          )}
          <Pager page={recent.page} pageCount={recent.pageCount} onChange={recent.setPage} />
        </TabsContent>

        <TabsContent value="top">
          {top.isLoading ? <ListSkeleton /> : !top.data?.length ? <Empty text="还没有足够的播放记录" /> : (
            <ul className="flex flex-col gap-2">
              {top.data.map((song: TopSong, index) => (
                <li key={song.songId} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
                  <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{song.songName}</p>
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{song.playCount} 次</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
