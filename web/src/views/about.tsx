import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, MinusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCount, formatDateTime, formatTotalDuration } from '@/lib/utils';
import { PLATFORMS } from '@/lib/platforms';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/input';
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

/** 统计数字块。数值在加载时用占位骨架，避免先闪一个 0 再跳到真实值。 */
function Stat({
  label, value, hint, loading, wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  loading: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-1' : undefined}>
      <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1.5 text-[27px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      )}
      {hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CapabilityCell({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={ok ? 'inline-flex items-center gap-1.5 text-foreground' : 'inline-flex items-center gap-1.5 text-muted-foreground'}>
      {ok ? <CheckCircle2 className="size-3.5 text-success" /> : <MinusCircle className="size-3.5" />}
      {text}
    </span>
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
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.stats(),
    staleTime: 5 * 60_000,
  });

  const data = stats.data;
  const loading = stats.isLoading;
  const updatedAt = data?.updatedAt ? formatDateTime(new Date(data.updatedAt).toISOString()) : '';

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <PageHeader
        eyebrow="About"
        title="关于 MusicForUrl"
        description="把网易云音乐、QQ 音乐、酷狗与酷我的歌单转换为轻量音频 M3U8 播放链接，并提供账号管理、收藏与媒体预览。"
      />

      {/* 站点统计：全站汇总口径，不含任何账号信息 */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">站点统计</h2>
          <p className="text-[11.5px] text-muted-foreground">
            全站汇总口径{updatedAt ? ` · 更新于 ${updatedAt}` : ''}
            {stats.isError ? ' · 暂时不可用' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="累计解析歌曲"
            value={`${formatCount(data?.parsedSongs ?? 0)} 首`}
            hint="按生成链接时的歌单曲目数累加"
            loading={loading}
          />
          <Stat
            label="总播放时长"
            value={formatTotalDuration(data?.playDurationMs ?? 0)}
            hint="近 30 天保留窗口内的累计值"
            loading={loading}
          />
          <Stat
            label="使用人数"
            value={`${formatCount(data?.listeners ?? 0)} 人`}
            hint="登录过的账号数"
            loading={loading}
          />
          <Stat
            label="累计播放"
            value={`${formatCount(data?.plays ?? 0)} 次`}
            hint="去重后计入的完整播放"
            loading={loading}
          />
          <Stat
            label="生成链接"
            value={`${formatCount(data?.generatedLinks ?? 0)} 个`}
            hint={`覆盖 ${formatCount(data?.playlists ?? 0)} 个歌单`}
            loading={loading}
            wide
          />
        </div>
      </section>

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
              项目代码采用 MIT License。各平台接口并非官方开放平台服务，可能随上游调整而失效。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 平台能力矩阵：把「支持到什么程度」写死在页面上，而不是让用户试出来 */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px]">平台支持范围</CardTitle>
          <p className="text-[12.5px] text-muted-foreground">
            账号接入指扫码或凭据登录；没有账号接入的平台也就没有个人歌单、收藏与播放记录。
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">平台</th>
                <th className="py-2 pr-3 font-medium">账号接入</th>
                <th className="py-2 pr-3 font-medium">歌单解析</th>
                <th className="py-2 pr-3 font-medium">音源播放</th>
                <th className="py-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map(item => (
                <tr key={item.id} className="border-b border-border last:border-0 align-top">
                  <td className="py-2.5 pr-3 font-medium">{item.label}</td>
                  <td className="py-2.5 pr-3">
                    <CapabilityCell ok={item.account} text={item.account ? '支持' : '不支持'} />
                  </td>
                  <td className="py-2.5 pr-3"><CapabilityCell ok={item.playback} text="支持" /></td>
                  <td className="py-2.5 pr-3"><CapabilityCell ok={item.playback} text="支持" /></td>
                  <td className="py-2.5 text-muted-foreground">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
