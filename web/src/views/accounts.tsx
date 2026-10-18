import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Info, LogOut, RefreshCw, ShieldCheck, Trash2, UserRoundPlus, Users,
} from 'lucide-react';
import { cn, imageSrc } from '@/lib/utils';
import { ACCOUNT_PLATFORMS, PLATFORMS, platformInfo } from '@/lib/platforms';
import { readAccountPreferences, writeAccountPreferences } from '@/lib/workspace-rules';
import type { AccountUser, Platform } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

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
          <Label htmlFor={`name-${platform}-${user.userId}`}>名称</Label>
          <Input
            id={`name-${platform}-${user.userId}`}
            value={value.name}
            maxLength={40}
            onChange={event => setValue(current => ({ ...current, name: event.target.value }))}
            placeholder="例如：工作账号"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`remark-${platform}-${user.userId}`}>备注</Label>
          <Input
            id={`remark-${platform}-${user.userId}`}
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

/** 账号头像 + 昵称 + 账号标识 + 登录状态，这是账号区域要求展示的最小集合。 */
function AccountIdentity({ user, active }: { user: AccountUser; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={imageSrc(user.avatar)}
        alt=""
        className={cn('size-12 shrink-0 rounded-full border object-cover', active ? 'border-primary' : 'border-border')}
        onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-semibold">
          {user.nickname || '未命名账号'}
          {active && <Badge variant="success" className="gap-1"><CheckCircle2 className="size-3" />当前生效</Badge>}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          ID {user.userId}{user.vipType ? ` · VIP ${user.vipType}` : ' · 非会员'}
        </p>
      </div>
    </div>
  );
}

function AccountCard({ platform }: { platform: Platform }) {
  const user = useAuth(state => state.users[platform]);
  const token = useAuth(state => state.tokens[platform]);
  const accounts = useAuth(state => state.accounts);
  const logout = useAuth(state => state.logout);
  const refresh = useAuth(state => state.refresh);
  const switchTo = useAuth(state => state.switchTo);
  const forget = useAuth(state => state.forget);
  const openLogin = useUi(state => state.openLogin);
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const info = platformInfo(platform);

  // 同一平台在本机登录过的其它账号。当前生效的那个不重复列出。
  const others = accounts.filter(item => item.platform === platform && item.userId !== user?.userId);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      // 数据是按账号隔离的，换账号后所有列表都要重新取
      await queryClient.invalidateQueries();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-[15px]">{info.label}</CardTitle>
        <div className="flex items-center gap-1.5">
          {others.length > 0 && <Badge variant="outline">本机 {others.length + (user ? 1 : 0)} 个账号</Badge>}
          {user ? <Badge variant="success">已登录</Badge> : <Badge variant="outline">未登录</Badge>}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {user ? (
          <AccountIdentity user={user} active={!!token} />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            登录后可以生成链接、收藏歌单并查看播放记录。同一平台登录新账号会切换数据，旧账号的收藏与记录仍然保留在它自己名下。
          </p>
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
                onClick={() => void run(() => logout(platform), `已退出${info.label}`)}
              >
                <LogOut />退出登录
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!token || busy}
                onClick={() => void run(async () => { await refresh(platform); }, '已刷新账号状态')}
              >
                <ShieldCheck />刷新状态
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => openLogin(platform)}><UserRoundPlus />登录</Button>
          )}
        </div>

        {others.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <Users className="size-3.5" />本机登录过的其它账号
            </p>
            <ul className="flex flex-col gap-1.5">
              {others.map(item => (
                <li key={item.userId} className="flex items-center gap-2.5">
                  <img
                    src={imageSrc(item.avatar)}
                    alt=""
                    className="size-7 shrink-0 rounded-full border border-border object-cover"
                    onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{item.nickname || '未命名账号'}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">ID {item.userId}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      const result = await switchTo(platform, item.userId);
                      if (!result.ok) throw new Error(result.message || '切换失败');
                    }, `已切换到 ${item.nickname || item.userId}`)}
                  >
                    切换
                  </Button>
                  <button
                    type="button"
                    aria-label={`从本机移除 ${item.nickname || item.userId}`}
                    title="从本机移除（不会影响平台上的账号）"
                    onClick={() => forget(platform, item.userId)}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user && <AccountAnnotation platform={platform} user={user} />}
      </CardContent>
    </Card>
  );
}

function GuestPlatformCard({ platform }: { platform: Platform }) {
  const info = platformInfo(platform);
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-[15px]">{info.label}</CardTitle>
        <Badge variant="outline">免登录</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">{info.note}</p>
        <ul className="flex flex-col gap-1.5 text-[12.5px]">
          <li className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-success" />歌单解析与音源播放：可用，无需登录
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <Info className="size-3.5" />账号接入：未实现，因此没有个人歌单、收藏与播放记录
          </li>
        </ul>
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
        description="Cookie 在服务端加密保存。每个平台可以记住多个账号，同一时间只有一个生效。"
      />

      {/* 多账号的数据归属规则：与其让用户猜，不如直接写清楚 */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Users className="size-4 text-primary" />多账号的数据归属
        </h2>
        <ul className="mt-2.5 grid gap-2 text-[12.5px] text-muted-foreground lg:grid-cols-2">
          <li>
            <strong className="font-medium text-foreground">按账号隔离。</strong>
            歌单缓存、收藏与播放记录的主键都以账号为单位，换账号就等于换一份数据，不会串号，也不会互相覆盖。
          </li>
          <li>
            <strong className="font-medium text-foreground">跨平台不混合。</strong>
            网易云与 QQ 音乐各自独立统计；「我的音乐」只显示当前选中平台、当前生效账号的数据。
          </li>
          <li>
            <strong className="font-medium text-foreground">切换即切换视图。</strong>
            切换账号后，歌单、收藏与播放记录会立即换成该账号的数据；原账号的数据保留在它自己名下，随时可以切回。
          </li>
          <li>
            <strong className="font-medium text-foreground">链接跟随账号。</strong>
            播放链接绑定签发它的账号，退出登录会立即撤销；切换账号不会影响已签发的链接。
          </li>
          <li>
            <strong className="font-medium text-foreground">关于页是汇总口径。</strong>
            「关于」里的累计解析数、播放时长与使用人数是全站汇总，不区分账号，也不包含任何个人信息。
          </li>
          <li>
            <strong className="font-medium text-foreground">游客平台不参与。</strong>
            酷狗与酷我免登录使用，因此没有账号维度，播放只计入匿名汇总。
          </li>
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACCOUNT_PLATFORMS.map(item => <AccountCard key={item.id} platform={item.id} />)}
        {PLATFORMS.filter(item => !item.account).map(item => (
          <GuestPlatformCard key={item.id} platform={item.id} />
        ))}
      </div>
    </div>
  );
}
