import { useEffect, type ReactNode } from 'react';
import { useStore } from './data/store';
import { Icon } from './ui/Icon';
import { href, useRoute, type TabKey } from './ui/router';
import { HomeScreen } from './screens/Home';
import { SimulatorScreen } from './screens/Simulator';
import { LifeMapScreen } from './screens/LifeMap';
import { ChronicleScreen } from './screens/Chronicle';
import { SettingsScreen } from './screens/Settings';
import { QuietScreen } from './screens/Quiet';

/** 世界の5つの場所。設定（世界の調律）は世界の中心の右上から開く */
const TAB_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'home', label: '世界の中心', icon: 'center' },
  { key: 'map', label: '世界地図', icon: 'map' },
  { key: 'sim', label: '開拓の間', icon: 'compass' },
  { key: 'log', label: '年代記', icon: 'hall' },
  { key: 'quiet', label: '静寂の地', icon: 'moon' },
];

export function App() {
  const route = useRoute();
  const { data } = useStore();
  const { theme, motion, textSize } = data.settings;

  // 表示設定を <html> に反映する
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    if (motion === 'system') delete root.dataset.motion;
    else root.dataset.motion = motion;
    root.dataset.text = textSize;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      root.dataset.reduced = String(motion === 'reduce' || (motion === 'system' && mq.matches));
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f4f3ef');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, motion, textSize]);

  let screen: ReactNode;
  switch (route.tab) {
    case 'sim':
      screen = <SimulatorScreen route={route} />;
      break;
    case 'map':
      screen = <LifeMapScreen />;
      break;
    case 'log':
      screen = <ChronicleScreen route={route} />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'quiet':
      screen = <QuietScreen />;
      break;
    default:
      screen = <HomeScreen />;
  }

  return (
    <div className="app">
      <main className={`screen screen-${route.tab}`} key={route.tab}>
        {screen}
      </main>
      <nav className="tabbar" aria-label="メインメニュー">
        {TAB_ITEMS.map((t) => (
          <a key={t.key} href={href(t.key)} className="tab" aria-current={route.tab === t.key || (t.key === 'home' && route.tab === 'settings') ? 'page' : undefined}>
            <Icon name={t.icon} size={24} stroke={route.tab === t.key ? 2 : 1.6} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={18} />
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="閉じる" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
