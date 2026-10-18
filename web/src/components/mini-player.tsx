import * as React from 'react';
import { ListMusic, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { formatBitrate, formatDuration, imageSrc } from '@/lib/utils';
import type { QualityOption } from '@/lib/types';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/tabs';
import { useCapabilities } from '@/hooks/use-capabilities';
import { usePlayer } from '@/stores/player';
import { cn } from '@/lib/utils';

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
  const [coverFailed, setCoverFailed] = React.useState(false);
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

  React.useEffect(() => { setCoverFailed(false); }, [track?.id]);

  if (!playlist || !track) return null;

  const paused = status === 'paused' || status === 'ended';

  function handleError() {
    if (!retriedRef.current) {
      retriedRef.current = true;
      void retry();
      return;
    }
    fail('无法播放这首歌曲，可能受版权、VIP 或地区限制');
  }

  return (
    <div className="sticky bottom-0 z-30 border-t border-border bg-card">
      <audio
        ref={audioRef}
        onPlay={markPlaying}
        onPause={markPaused}
        onEnded={markEnded}
        onError={handleError}
        onTimeUpdate={event => { positionRef.current = event.currentTarget.currentTime; }}
        preload="metadata"
      />

      <div className="flex items-center gap-3 p-3">
        <img
          src={coverFailed ? '/placeholder.svg' : imageSrc(track.cover || playlist.cover)}
          onError={() => setCoverFailed(true)}
          alt=""
          className="size-11 shrink-0 rounded-md border border-border object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{track.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {track.artist || playlist.name}
            {source ? ` · ${source.format.toUpperCase()} ${formatBitrate(source.bitrate)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => void prev()} disabled={index === 0} aria-label="上一首">
            <SkipBack />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={paused ? '播放' : '暂停'}
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (audio.paused) void audio.play().catch(() => fail('播放被浏览器阻止'));
              else audio.pause();
            }}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void next()}
            disabled={index + 1 >= playlist.tracks.length}
            aria-label="下一首"
          >
            <SkipForward />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(queueOpen && 'bg-accent')}
            onClick={() => setQueueOpen(value => !value)}
            aria-label="播放队列"
            aria-expanded={queueOpen}
          >
            <ListMusic />
          </Button>
        </div>

        <Select value={quality} onValueChange={value => void setQuality(value as QualityOption['id'])}>
          <SelectTrigger className="hidden h-8 w-36 sm:flex" aria-label="音质">
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

        <Button variant="ghost" size="icon" onClick={clear} aria-label="关闭播放器">
          <X />
        </Button>
      </div>

      {(message || status === 'error') && (
        <p className={cn('px-3 pb-2 text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {message}
        </p>
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
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  position === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
              >
                <span className="w-6 shrink-0 text-xs text-muted-foreground">{position + 1}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(item.duration)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {source?.trial && (
        <div className="px-3 pb-2">
          <Badge variant="outline">试听片段</Badge>
        </div>
      )}
    </div>
  );
}
