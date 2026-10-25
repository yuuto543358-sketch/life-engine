import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { Icon } from './Icon';
import { LivingWorld } from '../paint/world/LivingWorld';
import { useWorld } from '../world/useWorld';
import { TopActions } from './GuideSheet';

/** それぞれの場所から見える、世界の一部分（世界の座標と、見える横幅） */
export const PLACE_VIEWS = {
  map: { x: 500, y: 960, span: 980 },
  sim: { x: 560, y: 440, span: 640 },
  log: { x: 770, y: 700, span: 460 },
  settings: { x: 420, y: 470, span: 820 },
} as const;

/** 画面上部の、その場所から見える世界の景色 */
function PlaceBanner({ view }: { view: (typeof PLACE_VIEWS)[keyof typeof PLACE_VIEWS] }) {
  const { state } = useWorld();
  return (
    <div className="place-banner" aria-hidden="true">
      <LivingWorld state={state} frame={view} />
    </div>
  );
}

/** 画面上部の見出しと保存状態 */
export function ScreenHead({ eyebrow, title, children, place }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; place?: keyof typeof PLACE_VIEWS }) {
  return (
    <header className={`screen-head${place ? ' has-banner' : ''}`}>
      {place && <PlaceBanner view={PLACE_VIEWS[place]} />}
      <TopActions tone={place ? 'glass' : 'plain'} />
      <div className="screen-head-row">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="title">{title}</h1>
        </div>
        <SaveBadge />
      </div>
      {children}
    </header>
  );
}

function SaveBadge() {
  const { saveStatus, retrySave } = useStore();
  if (saveStatus === 'error') {
    return (
      <button type="button" className="savebadge savebadge-error" onClick={retrySave}>
        <Icon name="alert" size={14} /> 未保存・再試行
      </button>
    );
  }
  // 保存できているときは何も出さない（保存できなかったときだけ知らせる）
  return null;
}
