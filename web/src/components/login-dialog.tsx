import * as React from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { platformLabel } from '@/lib/utils';
import type { AccountUser, Platform } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Segmented } from '@/motion/primitives';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

const QR_POLL_MS = 3000;
// 旧版每 2 秒轮询、持续 3 分钟，一次扫码登录会产生约 90 次请求；降频并设上限
const QR_MAX_POLLS = 40;

const QR_MESSAGES: Record<number, string> = {
  800: '二维码已过期，请刷新',
  801: '等待扫码',
  802: '已扫码，请在手机上确认',
  804: '二维码状态异常，请刷新',
};

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
}

function QrPanel({ platform, onSuccess }: {
  platform: Platform;
  onSuccess: (token: string, user: AccountUser) => void;
}) {
  const [image, setImage] = React.useState('');
  const [status, setStatus] = React.useState('正在获取二维码…');
  const abortRef = React.useRef<AbortController | null>(null);

  const start = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setImage('');
    setStatus('正在获取二维码…');
    try {
      const { key, qrimg } = await api.qrcode(platform);
      if (controller.signal.aborted) return;
      setImage(qrimg);
      setStatus('请使用手机 App 扫码');
      for (let attempt = 0; attempt < QR_MAX_POLLS; attempt++) {
        await delay(QR_POLL_MS, controller.signal);
        if (controller.signal.aborted) return;
        // 后台标签页不轮询，但仍占用轮询次数上限，避免切回来时无限延长
        if (document.hidden) continue;
        const result = await api.qrcodeCheck(platform, key, controller.signal);
        if (controller.signal.aborted) return;
        if (result.code === 803 && result.data) {
          onSuccess(result.data.token, result.data.user);
          return;
        }
        setStatus(QR_MESSAGES[result.code] ?? result.message ?? '等待扫码');
        if (result.code === 800 || result.code === 804) return;
      }
      setStatus('二维码已过期，请刷新');
    } catch (error) {
      if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return;
      setStatus(error instanceof Error ? error.message : '二维码获取失败');
    }
  }, [platform, onSuccess]);

  React.useEffect(() => { void start(); }, [start]);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex size-44 items-center justify-center rounded-md border border-border bg-card">
        {image
          ? <img src={image} alt="登录二维码" className="size-40" />
          : <span className="text-[13px] text-muted-foreground">加载中…</span>}
      </div>
      <p className="text-[13px] text-muted-foreground" role="status" aria-live="polite">{status}</p>
      <Button variant="outline" size="sm" onClick={() => void start()}>刷新二维码</Button>
    </div>
  );
}

function CaptchaPanel({ platform, onSuccess }: {
  platform: Platform;
  onSuccess: (token: string, user: AccountUser) => void;
}) {
  const [phone, setPhone] = React.useState('');
  const [captcha, setCaptcha] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function send() {
    setSending(true);
    try {
      await api.sendCaptcha(platform, phone);
      toast.success('验证码已发送');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { token, user } = await api.loginCaptcha(platform, phone, captcha);
      onSuccess(token, user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-phone">手机号</Label>
        <Input id="login-phone" value={phone} onChange={event => setPhone(event.target.value)}
          inputMode="numeric" autoComplete="tel" placeholder="请输入手机号" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-captcha">验证码</Label>
        <div className="flex gap-2">
          <Input id="login-captcha" value={captcha} onChange={event => setCaptcha(event.target.value)}
            inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" required />
          <Button type="button" variant="outline" onClick={send} disabled={sending || !/^\d{6,20}$/.test(phone)}>
            {sending ? '发送中' : '发送'}
          </Button>
        </div>
      </div>
      <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
    </form>
  );
}

function PasswordPanel({ platform, onSuccess }: {
  platform: Platform;
  onSuccess: (token: string, user: AccountUser) => void;
}) {
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { token, user } = await api.loginPassword(platform, phone, password);
      onSuccess(token, user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-phone-pw">手机号</Label>
        <Input id="login-phone-pw" value={phone} onChange={event => setPhone(event.target.value)}
          inputMode="numeric" autoComplete="tel" placeholder="请输入手机号" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">密码</Label>
        <Input id="login-password" type="password" value={password}
          onChange={event => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" required />
      </div>
      <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
    </form>
  );
}

function CookiePanel({ platform, onSuccess }: {
  platform: Platform;
  onSuccess: (token: string, user: AccountUser) => void;
}) {
  const [cookie, setCookie] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { token, user } = await api.loginCookie(platform, cookie.trim());
      onSuccess(token, user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-cookie">Cookie</Label>
        <Textarea id="login-cookie" value={cookie} onChange={event => setCookie(event.target.value)}
          placeholder="粘贴浏览器中的完整 Cookie" required />
        <p className="text-xs text-muted-foreground">Cookie 会加密后保存在服务端，仅用于解析歌单与获取音源。</p>
      </div>
      <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
    </form>
  );
}

export function LoginDialog() {
  const open = useUi(state => state.loginOpen);
  const platform = useUi(state => state.loginPlatform);
  const closeLogin = useUi(state => state.closeLogin);
  const setPlatform = useUi(state => state.openLogin);
  const adopt = useAuth(state => state.adopt);

  const handleSuccess = React.useCallback((target: Platform) => (token: string, user: AccountUser) => {
    adopt(target, token, user);
    toast.success(`已登录 ${user.nickname || platformLabel(target)}`);
    closeLogin();
  }, [adopt, closeLogin]);

  const onNeteaseSuccess = React.useMemo(() => handleSuccess('netease'), [handleSuccess]);
  const onQqSuccess = React.useMemo(() => handleSuccess('qq'), [handleSuccess]);

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) closeLogin(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>登录音乐账号</DialogTitle>
          <DialogDescription>
            每个平台保留一个当前登录账号。账号信息加密保存在服务端，不会修改平台资料。
          </DialogDescription>
        </DialogHeader>

        <Segmented
          ariaLabel="选择平台"
          className="mb-4"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'netease', label: '网易云音乐' },
            { value: 'qq', label: 'QQ 音乐' },
          ]}
        />

        {platform === 'netease' ? (
          <Tabs defaultValue="qrcode">
            <TabsList className="w-full">
              <TabsTrigger value="qrcode">扫码</TabsTrigger>
              <TabsTrigger value="captcha">验证码</TabsTrigger>
              <TabsTrigger value="password">密码</TabsTrigger>
              <TabsTrigger value="cookie">Cookie</TabsTrigger>
            </TabsList>
            <TabsContent value="qrcode"><QrPanel platform="netease" onSuccess={onNeteaseSuccess} /></TabsContent>
            <TabsContent value="captcha"><CaptchaPanel platform="netease" onSuccess={onNeteaseSuccess} /></TabsContent>
            <TabsContent value="password"><PasswordPanel platform="netease" onSuccess={onNeteaseSuccess} /></TabsContent>
            <TabsContent value="cookie"><CookiePanel platform="netease" onSuccess={onNeteaseSuccess} /></TabsContent>
          </Tabs>
        ) : (
          <QrPanel platform="qq" onSuccess={onQqSuccess} />
        )}
      </DialogContent>
    </Dialog>
  );
}
