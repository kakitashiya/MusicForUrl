import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { Toaster } from 'sonner';
import App from './App';
import { useAuth } from './stores/auth';
import { useTheme } from './stores/theme';
import './fonts.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 列表页在标签之间来回切换不应重复发请求，这是配额决策而非 DX 决策
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Bootstrap() {
  const refreshAll = useAuth(state => state.refreshAll);
  const applyTheme = useTheme(state => state.apply);

  React.useEffect(() => {
    applyTheme();
    void refreshAll();
  }, [applyTheme, refreshAll]);

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" 跟随系统设置，CSS 层另外尊重 dataset.motion。
          domMax 提供布局动画，分段控件的 layoutId 滑块依赖它。 */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domMax} strict>
          <BrowserRouter>
            <Bootstrap />
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
