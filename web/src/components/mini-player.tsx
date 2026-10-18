import * as React from 'react';
import { ListMusic, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { cn, formatBitrate, formatDuration } from '@/lib/utils';
import type { QualityOption } from '@/lib/types';
import { Badge } from '@/components/ui/card';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/tabs';
import { CoverArt } from '@/components/playlist-card';
import { useCapabilities } from '@/hooks/use-capabilities';
import { usePlayer } from '@/stores/player';

export function MiniPlayer() {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const playlist = usePlayer(state => state.playlist);
  const index = usePlayer(state => state.index);
  const source = usePlayer(state => state.source);
  const status = usePlayer(state => state.status);
  const message = usePlayer(state => state.message);
  const quality = usePlayer(state => state.quality);
  const autoplay = usePlayer(state => state.autoplay);
  const next = usePlayer(state => state.next);
  const prev = usePlayer(state => state.prev);
  const playIndex = usePlayer(state => state.playIndex);
  const setQuality = usePlayer(state => state.setQuality);
  const retry = usePlayer(state => state.retry);
  const markPlaying = usePlayer(state => state.markPlaying);
  const markPaused = usePlayer(state => state.markPaused);
  const markEnded = usePlayer(state => state.markEnded);
  const fail = usePlayer(state => state.fail);
  const clear = usePlayer(state => state.clear);
  const { data: capabilities } = useCapabilities();

  const [queueOpen, setQueueOpen] = React.useState(false);
  const [progress, setProgress] = React.useState({ time: 0, duration: 0 });
  const positionRef = React.useRef(0);
  const retriedRef = React.useRef(false);
  const trackRef = React.useRef('');

  const track = playlist?.tracks[index] ?? null;
  const trackKey = `${playlist?.id ?? ''}:${index}`;

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    // 同一首歌重新解析（切换音质、出错重试）时保留进度，切歌则从头播放
    const sameTrack = trackRef.current === trackKey;
    trackRef.current = trackKey;
    retriedRef.current = false;
    audio.src = source.mediaUrl;
    if (sameTrack) audio.currentTime = positionRef.current;
    if (autoplay) {
      void audio.play().catch(() => {
        // 浏览器可能拦截自动播放，此时交给用户手动点击
        usePlayer.setState({ status: 'paused' });
      });
    }
  }, [source?.mediaUrl, autoplay, trackKey]);

  if (!playlist || !track) return null;

  const paused = status === 'paused' || status === 'ended';
  const percent = progress.duration > 0 ? (progress.time / progress.duration) * 100 : 0;

  function handleError() {
    if (!retriedRef.current) {
      retriedRef.current = true;
      void retry();
      return;
    }
    fail('无法播放这首歌曲，可能受版权、VIP 或地区限制');
  }

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !progress.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * progress.duration;
  }

  return (
    <div className="shrink-0 border-t border-border bg-card shadow-[0_-14px_34px_-26px_rgb(20_70_105/60%)]">
      <audio
        ref={audioRef}
        onPlay={markPlaying}
        onPause={markPaused}
        onEnded={markEnded}
        onError={handleError}
        onTimeUpdate={event => {
          positionRef.current = event.currentTarget.currentTime;
          setProgress({ time: event.currentTarget.currentTime, duration: event.currentTarget.duration || 0 });
        }}
        preload="metadata"
      />

      <div className="flex items-center gap-4 px-4 py-3 md:px-6">
        <CoverArt src={track.cover || playlist.cover} seed={track.id} className="size-11 shrink-0 rounded-lg" />

        <div className="min-w-0 w-[9rem] shrink-0 md:w-[13rem]">
          <p className="truncate text-[13.5px] font-medium">{track.name}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {track.artist || playlist.name}
            {source ? ` · ${source.format.toUpperCase()} ${formatBitrate(source.bitrate)}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void prev()}
            disabled={index === 0}
            aria-label="上一首"
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <SkipBack className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label={paused ? '播放' : '暂停'}
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (audio.paused) void audio.play().catch(() => fail('播放被浏览器阻止'));
              else audio.pause();
            }}
            className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_20px_-10px_var(--primary)] transition-transform hover:scale-105"
          >
            {paused ? <Play className="size-[18px] fill-current" /> : <Pause className="size-[18px] fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => void next()}
            disabled={index + 1 >= playlist.tracks.length}
            aria-label="下一首"
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <SkipForward className="size-[18px]" />
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
          <span className="text-[11.5px] tabular-nums text-muted-foreground">{formatDuration(progress.time)}</span>
          <div
            role="slider"
            tabIndex={0}
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(progress.duration)}
            aria-valuenow={Math.round(progress.time)}
            onClick={seek}
            className="group relative h-1 flex-1 cursor-pointer rounded-full bg-muted"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_srgb,var(--primary)_60%,white)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11.5px] tabular-nums text-muted-foreground">{formatDuration(progress.duration)}</span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Select value={quality} onValueChange={value => void setQuality(value as QualityOption['id'])}>
            <SelectTrigger className="hidden h-8 w-[8.5rem] lg:flex" aria-label="音质">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(capabilities?.qualities ?? []).map(option => (
                <SelectItem key={option.id} value={option.id} disabled={!option.enabled}>
                  {option.label} {option.format}
                  {option.enabled ? '' : '（不可用）'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setQueueOpen(value => !value)}
            aria-label="播放队列"
            aria-expanded={queueOpen}
            className={cn(
              'grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground',
              queueOpen && 'bg-accent text-accent-foreground',
            )}
          >
            <ListMusic className="size-[18px]" />
          </button>
          <button
            type="button"
            onClick={clear}
            aria-label="关闭播放器"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-[18px]" />
          </button>
        </div>
      </div>

      {(message || status === 'error' || source?.trial) && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 md:px-6">
          {source?.trial && <Badge variant="outline">试听片段</Badge>}
          {message && (
            <p className={cn('text-[11.5px]', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
              {message}
            </p>
          )}
        </div>
      )}

      {queueOpen && (
        <ul className="max-h-64 overflow-y-auto border-t border-border p-2">
          {playlist.tracks.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void playIndex(position)}
                aria-current={position === index}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                  position === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
              >
                <span className="w-6 shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{position + 1}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                  {formatDuration(item.duration)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
