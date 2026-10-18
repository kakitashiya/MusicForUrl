import * as React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginDialog } from '@/components/login-dialog';
import { MiniPlayer } from '@/components/mini-player';
import { PageTransition } from '@/motion/primitives';
import { Skeleton } from '@/components/ui/input';
import { VIEW_TITLES, routeFromPath } from '@/lib/routes';

export function AppShell() {
  const location = useLocation();
  const view = routeFromPath(location.pathname);

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>工作台</span>
            <span aria-hidden="true">/</span>
            <strong className="font-medium text-foreground">{VIEW_TITLES[view]}</strong>
          </div>
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
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
