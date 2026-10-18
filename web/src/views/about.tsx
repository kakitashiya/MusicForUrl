import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCapabilities } from '@/hooks/use-capabilities';

interface Health {
  status: string;
  degradeMode?: string;
  version?: string;
  features?: { analytics?: boolean; audioCache?: boolean };
}

const LINKS = [
  { href: 'https://github.com/znc15/MusicForUrl', label: '项目仓库' },
  { href: 'https://znc15.github.io/MusicForUrl/', label: '官网与文档' },
  { href: 'https://github.com/znc15/MusicForUrl/issues', label: '问题反馈' },
];

const DEGRADE_LABELS: Record<string, string> = {
  normal: '正常',
  'links-only': '仅提供链接（额度接近上限，已关闭站内播放器）',
  shed: '暂停新会话（额度接近上限，已签发的链接仍可播放）',
};

export function AboutView() {
  const { data: capabilities } = useCapabilities();
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const response = await fetch('/api/health', { cache: 'no-store' });
      return response.json() as Promise<Health>;
    },
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">About</p>
        <h1 className="text-xl font-semibold">关于 MusicForUrl</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          把网易云音乐与 QQ 音乐歌单转换为轻量音频 M3U8 播放链接，并提供账号管理、收藏与媒体预览。
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>构建信息</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">前端版本</span>
            <span className="font-mono">{__APP_VERSION__}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">播放后端</span>
            <span className="font-mono">{capabilities?.backend ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">无损音源</span>
            <Badge variant={capabilities?.mp3Only ? 'outline' : 'success'}>
              {capabilities?.mp3Only ? '当前部署不支持' : '可用'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">私有音频缓存</span>
            <Badge variant={capabilities?.privateCache ? 'success' : 'outline'}>
              {capabilities?.privateCache ? '已启用' : '未启用'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">服务状态</span>
            <span>{DEGRADE_LABELS[health?.degradeMode ?? 'normal'] ?? health?.degradeMode ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>链接</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-primary underline-offset-2 hover:underline"
            >
              {link.label}<ExternalLink className="size-3.5" />
            </a>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        项目代码采用 MIT License。网易云与 QQ 音乐接口并非官方开放平台服务，可能随上游调整而失效。
      </p>
    </div>
  );
}
