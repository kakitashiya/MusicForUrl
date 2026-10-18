import * as React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CircleUserRound } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginDialog } from '@/components/login-dialog';
import { MiniPlayer } from '@/components/mini-player';
import { PageTransition } from '@/motion/primitives';
import { Skeleton } from '@/components/ui/input';
import { imageSrc, platformLabel } from '@/lib/utils';
import { VIEW_TITLES, routeFromPath } from '@/lib/routes';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

function AccountButton() {
  const users = useAuth(state => state.users);
  const openLogin = useUi(state => state.openLogin);
  const active = users.qq ? 'qq' : users.netease ? 'netease' : '';
  const account = active ? users[active] : null;

  if (!account) {
    return (
      <button
        type="button"
        onClick={() => openLogin('netease')}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <CircleUserRound className="size-4" />
        登录音乐账号
      </button>
    );
  }

  return (
    <Link
      to="/accounts"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card pl-1.5 pr-3 text-[13px] transition-colors hover:bg-accent"
    >
      <img
        src={imageSrc(account.avatar)}
        alt=""
        className="size-6 rounded-full object-cover"
        onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
      />
      <span className="max-w-[10rem] truncate font-medium">{account.nickname || '已登录'}</span>
      <span className="text-muted-foreground">{platformLabel(active)}</span>
    </Link>
  );
}

export function AppShell() {
  const location = useLocation();
  const view = routeFromPath(location.pathname);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/70 px-4 backdrop-blur-sm md:px-8">
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>工作台</span>
            <span aria-hidden="true">/</span>
            <strong className="font-semibold text-foreground">{VIEW_TITLES[view]}</strong>
          </div>
          <div className="flex items-center gap-2">
            <AccountButton />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
          <PageTransition viewKey={view}>
            <React.Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <Outlet />
            </React.Suspense>
          </PageTransition>
        </main>

        <MiniPlayer />
      </div>

      <LoginDialog />
    </div>
  );
}
