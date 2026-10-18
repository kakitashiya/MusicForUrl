import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 直链与本地文件的播放舞台。本站歌单不走这里，由常驻的 MiniPlayer 负责。
 * HLS 优先使用 hls.js（按需加载，约 185 kB gzip，不进首屏），
 * 不支持 MediaSource 时回退到浏览器原生 HLS。
 */
export function MediaStage({ src, isHls, className }: { src: string; isHls: boolean; className?: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState('');
  const [audioOnly, setAudioOnly] = React.useState(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError('');
    let cancelled = false;
    let hls: import('hls.js').default | null = null;
    let recovered = false;

    async function attach() {
      if (!isHls) {
        video!.src = src;
        return;
      }
      const { default: Hls } = await import('hls.js');
      if (cancelled) return;
      if (!Hls.isSupported()) {
        if (video!.canPlayType('application/vnd.apple.mpegurl')) video!.src = src;
        else setError('当前浏览器不支持 HLS 播放。');
        return;
      }
      hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 40, backBufferLength: 30, debug: false });
      hls.loadSource(src);
      hls.attachMedia(video!);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // 只尝试恢复一次，避免在损坏的源上反复重试
        if (!recovered && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          recovered = true;
          hls?.recoverMediaError();
          return;
        }
        setError('无法播放这个 HLS 源。请确认链接允许跨域访问，或改用本站生成的播放链接。');
      });
    }

    void attach();

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, isHls]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={event => setAudioOnly(event.currentTarget.videoWidth === 0)}
        onError={() => setError('无法播放这个媒体链接。')}
        className={cn(
          'w-full rounded-md border border-border bg-black',
          audioOnly ? 'h-16' : 'aspect-video',
        )}
      />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
