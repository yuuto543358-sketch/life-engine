import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { Icon } from './Icon';

/** 画面上部の見出しと保存状態 */
export function ScreenHead({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="screen-head">
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
  if (saveStatus === 'saving') return <span className="savebadge">保存中…</span>;
  if (saveStatus === 'saved')
    return (
      <span className="savebadge savebadge-ok">
        <Icon name="check" size={14} /> 端末に保存済み
      </span>
    );
  return null;
}
