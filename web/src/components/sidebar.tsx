import { NavLink } from 'react-router-dom';
import { CircleUserRound, Info, Library, Link2, MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ORDER, VIEW_TITLES, viewPath, type ViewName } from '@/lib/routes';
import { imageSrc, platformLabel } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { Badge } from '@/components/ui/card';

const ICONS: Record<ViewName, typeof Link2> = {
  home: Link2,
  user: Library,
  preview: MonitorPlay,
  accounts: CircleUserRound,
  about: Info,
};

export function Sidebar() {
  const users = useAuth(state => state.users);
  const ready = useAuth(state => state.ready);
  const openLogin = useUi(state => state.openLogin);
  const active = users.qq ? 'qq' : users.netease ? 'netease' : '';

  return (
    <nav className="flex flex-col gap-4 border-border bg-card p-3 md:h-full md:w-56 md:border-r" aria-label="主导航">
      <NavLink to="/" className="flex items-center gap-2 px-1 py-1.5">
        <img src="/brand.svg" alt="" className="size-6" />
        <span className="text-sm font-semibold tracking-tight">MusicForUrl</span>
      </NavLink>

      <ul className="grid grid-cols-5 gap-1 md:grid-cols-1">
        {NAV_ORDER.map(view => {
          const Icon = ICONS[view];
          return (
            <li key={view}>
              <NavLink
                to={viewPath(view)}
                end={view === 'home'}
                className={({ isActive }) => cn(
                  'flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors md:flex-row md:gap-2 md:text-[13px]',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{VIEW_TITLES[view]}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-border pt-3">
        {active ? (
          <NavLink
            to="/accounts"
            className="flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-accent"
          >
            <img
              src={imageSrc(users[active]?.avatar)}
              alt=""
              className="size-7 rounded-full border border-border object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {users[active]?.nickname || '已登录'}
              </span>
              <span className="block text-[11px] text-muted-foreground">{platformLabel(active)}</span>
            </span>
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={() => openLogin('netease')}
            className="flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors hover:bg-accent"
          >
            <CircleUserRound className="size-6 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">
                {ready ? '登录音乐账号' : '账号信息待确认'}
              </span>
              <span className="block text-[11px] text-muted-foreground">网易云音乐 · QQ 音乐</span>
            </span>
          </button>
        )}
        {users.netease && users.qq ? (
          <div className="mt-2 px-2">
            <Badge variant="outline">两个平台均已登录</Badge>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
