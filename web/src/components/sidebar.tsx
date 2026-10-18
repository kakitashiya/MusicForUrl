import { NavLink } from 'react-router-dom';
import { CircleUserRound, Info, Library, Link2, MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ORDER, VIEW_TITLES, viewPath, type ViewName } from '@/lib/routes';
import { imageSrc, platformLabel } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

const ICONS: Record<ViewName, typeof Link2> = {
  home: Link2,
  user: Library,
  preview: MonitorPlay,
  accounts: CircleUserRound,
  about: Info,
};

const itemClass = (active: boolean) => cn(
  'grid size-11 place-items-center rounded-lg transition-colors',
  active
    ? 'bg-rail-active text-rail-active-foreground'
    : 'text-rail-foreground hover:bg-white/8 hover:text-rail-active-foreground',
);

/** 图标轨道：窄屏时横向排在顶部，宽屏时竖向固定在左侧。 */
export function Sidebar() {
  const users = useAuth(state => state.users);
  const openLogin = useUi(state => state.openLogin);
  const active = users.qq ? 'qq' : users.netease ? 'netease' : '';
  const account = active ? users[active] : null;

  return (
    <nav
      aria-label="主导航"
      className="flex shrink-0 items-center gap-1 bg-rail px-3 py-2 md:h-full md:w-[76px] md:flex-col md:gap-1.5 md:px-0 md:py-4"
    >
      <NavLink to="/" aria-label="MusicForUrl 首页" className="mr-1 grid size-9 place-items-center md:mr-0 md:mb-3">
        <img src="/brand.svg" alt="" className="size-7" />
      </NavLink>

      {NAV_ORDER.map(view => {
        const Icon = ICONS[view];
        return (
          <NavLink
            key={view}
            to={viewPath(view)}
            end={view === 'home'}
            title={VIEW_TITLES[view]}
            aria-label={VIEW_TITLES[view]}
            className={({ isActive }) => itemClass(isActive)}
          >
            <Icon className="size-[18px]" />
          </NavLink>
        );
      })}

      <div className="ml-auto md:mt-auto md:ml-0">
        {account ? (
          <NavLink
            to="/accounts"
            title={`${account.nickname || '已登录'} · ${platformLabel(active)}`}
            aria-label="账号管理"
            className={({ isActive }) => itemClass(isActive)}
          >
            <img
              src={imageSrc(account.avatar)}
              alt=""
              className="size-7 rounded-full border border-white/20 object-cover"
              onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
            />
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={() => openLogin('netease')}
            title="登录音乐账号"
            aria-label="登录音乐账号"
            className={itemClass(false)}
          >
            <CircleUserRound className="size-[18px]" />
          </button>
        )}
      </div>
    </nav>
  );
}
