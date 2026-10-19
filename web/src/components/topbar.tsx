import { useLocation } from 'react-router-dom';
import { AccountMenu } from '@/components/account-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { VIEW_TITLES, routeFromPath } from '@/lib/routes';

/**
 * 顶栏。
 *
 * 只放当前位置与账号、主题开关。音量属于播放器，只保留在底部播放条。
 */
export function Topbar() {
  const location = useLocation();
  const view = routeFromPath(location.pathname);
  const isHome = view === 'home';

  return (
    <header className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        <span className="hidden sm:inline">工作台</span>
        <span aria-hidden="true" className="hidden sm:inline">/</span>
        <h1 className="truncate text-[15px] font-semibold text-foreground">{VIEW_TITLES[view]}</h1>
        {isHome && (
          <span className="ml-1 hidden truncate text-[12.5px] text-muted-foreground lg:inline">
            把歌单变成可直接播放的 M3U8
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
