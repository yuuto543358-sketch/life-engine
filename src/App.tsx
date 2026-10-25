import { useEffect, useState, type ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { useStore } from './data/store';
import { Icon } from './ui/Icon';
import { href, useRoute, type TabKey } from './ui/router';
import { HomeScreen } from './screens/Home';
import { SimulatorScreen } from './screens/Simulator';
import { LifeMapScreen } from './screens/LifeMap';
import { ChronicleScreen } from './screens/Chronicle';
import { SettingsScreen } from './screens/Settings';
import { QuietScreen } from './screens/Quiet';
import { GuideSheet } from './ui/GuideSheet';

/** 世界の5つの場所。設定（世界の調律）は世界の中心の右上から開く */
/** タブの名前は「何をする場所か」が分かる言葉にし、世界での名前は読み上げと各画面の見出しで伝える */
const TAB_ITEMS: { key: TabKey; label: string; world: string; icon: string }[] = [
  { key: 'home', label: 'ホーム', world: '世界の中心', icon: 'center' },
  { key: 'map', label: '地図', world: '世界地図', icon: 'map' },
  { key: 'sim', label: '計画', world: '開拓の間', icon: 'compass' },
  { key: 'log', label: '記録', world: '年代記の館', icon: 'hall' },
  { key: 'quiet', label: '休む', world: '静寂の地', icon: 'moon' },
];

export function App() {
  const route = useRoute();
  const { data } = useStore();
  const { theme, motion: motionSetting, textSize } = data.settings;
  const [reduced, setReduced] = useState(false);

  // 表示設定を <html> に反映する
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    if (motionSetting === 'system') delete root.dataset.motion;
    else root.dataset.motion = motionSetting;
    root.dataset.text = textSize;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const r = motionSetting === 'reduce' || (motionSetting === 'system' && mq.matches);
      root.dataset.reduced = String(r);
      setReduced(r);
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f4f3ef');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, motionSetting, textSize]);

  // 別の場所（タブ）へ移ったら、いちばん上から見せる
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.tab, route.sub]);

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
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="app">
        <main className={`screen screen-${route.tab}`} key={route.tab}>
          {screen}
        </main>
        <nav className="tabbar" aria-label="メインメニュー">
          <div className="tabbar-inner">
            {TAB_ITEMS.map((t) => {
              const active = route.tab === t.key || (t.key === 'home' && route.tab === 'settings');
              return (
                <a key={t.key} href={href(t.key)} className="tab" aria-current={active ? 'page' : undefined} aria-label={`${t.label}（${t.world}）`}>
                  {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.9 }} />}
                  <motion.span className="tab-icon" animate={active ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
                    <Icon name={t.icon} size={22} stroke={active ? 2 : 1.6} />
                  </motion.span>
                  <span className="tab-label">{t.label}</span>
                </a>
              );
            })}
          </div>
        </nav>
        <Toasts />
        <GuideSheet />
      </div>
    </MotionConfig>
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
