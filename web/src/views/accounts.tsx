import * as React from 'react';
import { toast } from 'sonner';
import { LogOut, RefreshCw, UserRoundPlus } from 'lucide-react';
import { imageSrc, platformLabel } from '@/lib/utils';
import { readAccountPreferences, writeAccountPreferences } from '@/lib/workspace-rules';
import type { AccountUser, Platform } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

const PLATFORMS: Platform[] = ['netease', 'qq'];

/** 名称与备注只保存在当前浏览器，键为「平台 + 账号 ID」，不修改平台资料也不跨设备同步。 */
function AccountAnnotation({ platform, user }: { platform: Platform; user: AccountUser }) {
  const account = React.useMemo(() => ({ platform, user }), [platform, user]);
  const [value, setValue] = React.useState(() => readAccountPreferences(localStorage, account));

  React.useEffect(() => {
    setValue(readAccountPreferences(localStorage, account));
  }, [account]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      writeAccountPreferences(localStorage, account, value);
      toast.success('账号资料已保存到此浏览器');
    } catch {
      toast.error('无法保存，请检查浏览器存储权限');
    }
  }

  return (
    <form className="mt-1 flex flex-col gap-3 border-t border-border pt-4" onSubmit={save}>
      <p className="text-[11.5px] text-muted-foreground">本机备注 · 不会同步，也不修改平台资料</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${platform}`}>名称</Label>
          <Input
            id={`name-${platform}`}
            value={value.name}
            maxLength={40}
            onChange={event => setValue(current => ({ ...current, name: event.target.value }))}
            placeholder="例如：工作账号"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`remark-${platform}`}>备注</Label>
          <Input
            id={`remark-${platform}`}
            value={value.remark}
            maxLength={200}
            onChange={event => setValue(current => ({ ...current, remark: event.target.value }))}
            placeholder="例如：主要用于歌单 A"
          />
        </div>
      </div>
      <div>
        <Button type="submit" size="sm" variant="outline">保存备注</Button>
      </div>
    </form>
  );
}

function AccountCard({ platform }: { platform: Platform }) {
  const user = useAuth(state => state.users[platform]);
  const token = useAuth(state => state.tokens[platform]);
  const logout = useAuth(state => state.logout);
  const refresh = useAuth(state => state.refresh);
  const openLogin = useUi(state => state.openLogin);
  const [busy, setBusy] = React.useState(false);

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-[15px]">{platformLabel(platform)}</CardTitle>
        {user ? <Badge variant="success">已登录</Badge> : <Badge variant="outline">未登录</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <img
              src={imageSrc(user.avatar)}
              alt=""
              className="size-12 rounded-full border border-border object-cover"
              onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.nickname || '未命名账号'}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                ID {user.userId}{user.vipType ? ` · VIP ${user.vipType}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">登录后可以生成链接、收藏歌单并查看播放记录。</p>
        )}

        <div className="flex flex-wrap gap-2">
          {user ? (
            <>
              <Button variant="outline" size="sm" onClick={() => openLogin(platform)}>
                <RefreshCw />重新登录
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await logout(platform);
                  setBusy(false);
                  toast.success(`已退出${platformLabel(platform)}`);
                }}
              >
                <LogOut />退出登录
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void refresh(platform)} disabled={!token}>
                刷新状态
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => openLogin(platform)}><UserRoundPlus />登录</Button>
          )}
        </div>

        {user && <AccountAnnotation platform={platform} user={user} />}
      </CardContent>
    </Card>
  );
}

export function AccountsView() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <PageHeader
        eyebrow="Accounts"
        title="账号管理"
        description="每个平台保留一个当前登录账号。Cookie 在服务端加密保存，退出登录会立即撤销已生成的播放链接。"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map(platform => <AccountCard key={platform} platform={platform} />)}
      </div>
    </div>
  );
}
