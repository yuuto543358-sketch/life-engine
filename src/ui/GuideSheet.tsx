import { useEffect, useMemo, useState } from 'react';
import { Sheet } from './controls';
import { Icon } from './Icon';
import { PLACES, goTo, onGuide, openGuide, searchGuide, type GuideItem } from './guide';
import { href, navigate } from './router';

/** 「どこに何がある？」: やりたいことから探して、その場所へ移動する */
export function GuideSheet() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => onGuide((o) => setOpen(o)), []);
  const groups = useMemo(() => searchGuide(q), [q]);
  const close = () => {
    setOpen(false);
    setQ('');
  };
  const pick = (it: GuideItem) => {
    close();
    goTo(it);
  };
  const count = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <Sheet open={open} onClose={close} title="メニュー">
      <div className="guide">
        <label className="guide-search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="やりたいことで探す（例: ボーナス、家賃、日記）" aria-label="やりたいことで探す" enterKeyHint="search" />
          {q && (
            <button type="button" className="guide-clear" aria-label="入力を消す" onClick={() => setQ('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        {!q && (
          <section aria-label="アプリの場所">
            <h3 className="guide-group">場所（設定もここから）</h3>
            <ul className="guide-places">
              {PLACES.map((p) => (
                <li key={p.tab}>
                  <a
                    className="guide-place"
                    href={href(p.tab)}
                    onClick={(e) => {
                      e.preventDefault();
                      close();
                      navigate(p.tab);
                    }}
                  >
                    <span className="guide-place-icon">
                      <Icon name={p.icon} size={20} />
                    </span>
                    <span className="guide-place-text">
                      <span className="guide-place-name">
                        {p.label} <span className="guide-world">{p.world}</span>
                      </span>
                      <span className="guide-place-what">{p.what}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {q && <p className="guide-count">{count > 0 ? `${count}件 見つかりました` : '見つかりませんでした。別の言葉で探してみてください。'}</p>}
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="guide-group">{g.title}</h3>
            <ul className="guide-list">
              {g.items.map((it) => (
                <li key={it.label}>
                  <button type="button" className="guide-item" onClick={() => pick(it)}>
                    <span className="guide-item-icon">
                      <Icon name={it.icon} size={18} />
                    </span>
                    <span className="guide-item-text">
                      <span className="guide-item-label">{it.label}</span>
                      <span className="guide-where">
                        {it.where.map((w, i) => (
                          <span key={i}>
                            {i > 0 && <Icon name="chevron" size={11} />}
                            {w}
                          </span>
                        ))}
                      </span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** 画面の右上のボタンはこれひとつ（メニュー: さがす・すべての場所・設定） */
export function TopActions({ tone = 'glass' }: { tone?: 'glass' | 'plain' }) {
  return (
    <div className={`top-actions top-actions-${tone}`}>
      <button type="button" className="top-action" onClick={openGuide} aria-label="メニュー（さがす・設定）">
        <Icon name="menu" size={19} />
        <span className="top-action-label">メニュー</span>
      </button>
    </div>
  );
}
