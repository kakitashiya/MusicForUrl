import * as React from 'react';
import { toast } from 'sonner';
import { FolderOpen, MonitorPlay, X } from 'lucide-react';
import { parseStreamUrl } from '@/lib/api';
import { imageSrc } from '@/lib/utils';
import { validateMediaUrl } from '@/lib/workspace-rules';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MediaStage } from '@/components/media-stage';
import { usePlayer } from '@/stores/player';

export function PreviewView() {
  const [input, setInput] = React.useState('');
  const [source, setSource] = React.useState<{ url: string; isHls: boolean; local: boolean } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const playlist = usePlayer(state => state.playlist);
  const openPlaylist = usePlayer(state => state.open);

  // 本地文件只通过 Object URL 预览，不上传；离开时释放
  React.useEffect(() => () => {
    if (source?.local) URL.revokeObjectURL(source.url);
  }, [source]);

  async function open(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;

    const stream = parseStreamUrl(value);
    if (stream) {
      await openPlaylist(stream.platform, stream.playlistId, stream.grant);
      toast.success('已载入本站歌单，使用下方常驻播放器控制');
      return;
    }

    try {
      const url = validateMediaUrl(value);
      setSource({ url, isHls: /\.m3u8(\?|$)/i.test(new URL(url).pathname + new URL(url).search), local: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '链接无效');
    }
  }

  function openFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (source?.local) URL.revokeObjectURL(source.url);
    setSource({ url: URL.createObjectURL(file), isHls: /\.m3u8$/i.test(file.name), local: true });
    setInput(file.name);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Preview</p>
        <h1 className="text-xl font-semibold">媒体预览</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          可以粘贴本站生成的 stream.m3u8 链接、HTTPS 媒体直链，或选择本地文件。本地文件不会上传。
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <form className="flex gap-2" onSubmit={open}>
            <Input
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="粘贴播放链接或媒体直链"
              aria-label="媒体链接"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit"><MonitorPlay />打开</Button>
          </form>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="audio/*,video/*,.m3u8" className="hidden" onChange={openFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FolderOpen />选择本地文件
            </Button>
            {source && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (source.local) URL.revokeObjectURL(source.url);
                  setSource(null);
                  setInput('');
                }}
              >
                <X />清除
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {source && <MediaStage src={source.url} isHls={source.isHls} />}

      {playlist && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <img
                src={imageSrc(playlist.cover)}
                alt=""
                className="size-12 rounded-md border border-border object-cover"
                onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
              />
              <div className="min-w-0">
                <CardTitle className="truncate">{playlist.name}</CardTitle>
                <p className="text-[13px] text-muted-foreground">{playlist.tracks.length} 首 · 使用页面底部播放器控制</p>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
