import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 last:pb-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{children}</span>
    </div>
  );
}

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
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <PageHeader
        eyebrow="About"
        title="关于 MusicForUrl"
        description="把网易云音乐与 QQ 音乐歌单转换为轻量音频 M3U8 播放链接，并提供账号管理、收藏与媒体预览。"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">构建信息</CardTitle></CardHeader>
          <CardContent>
            <Row label="前端版本"><span className="font-mono text-[12.5px]">{__APP_VERSION__}</span></Row>
            <Row label="播放后端"><span className="font-mono text-[12.5px]">{capabilities?.backend ?? '—'}</span></Row>
            <Row label="无损音源">
              <Badge variant={capabilities?.mp3Only ? 'outline' : 'success'}>
                {capabilities?.mp3Only ? '当前部署不支持' : '可用'}
              </Badge>
            </Row>
            <Row label="私有音频缓存">
              <Badge variant={capabilities?.privateCache ? 'success' : 'outline'}>
                {capabilities?.privateCache ? '已启用' : '未启用'}
              </Badge>
            </Row>
            <Row label="服务状态">
              {DEGRADE_LABELS[health?.degradeMode ?? 'normal'] ?? health?.degradeMode ?? '—'}
            </Row>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">链接</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary underline-offset-2 hover:underline"
              >
                {link.label}<ExternalLink className="size-3.5" />
              </a>
            ))}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              项目代码采用 MIT License。网易云与 QQ 音乐接口并非官方开放平台服务，可能随上游调整而失效。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
