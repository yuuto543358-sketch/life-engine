import { useEffect, useRef, useState } from 'react';
import { scrollToAnchor } from './guide';

/**
 * 長い画面の「目次」。押すとその見出しへ移動し、いま見ている場所が色で分かる。
 * 画面の上に貼りついて、スクロールしてもいつでも使える。
 */
export function SectionNav({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  const [present, setPresent] = useState(items);
  const [active, setActive] = useState(items[0]?.id ?? '');
  const navRef = useRef<HTMLElement>(null);
  const key = items.map((i) => i.id).join(',');

  useEffect(() => {
    // 実際に表示されている見出しだけを目次に出す（条件によって出ない見出しもあるため）
    const shown = items.filter((i) => document.getElementById(i.id));
    setPresent(shown);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const i of shown) io.observe(document.getElementById(i.id)!);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // いま見ている項目が、目次の中で見えるようにする
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    const nav = navRef.current;
    if (el && nav) nav.scrollTo({ left: el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [active]);

  if (present.length < 2) return null;
  return (
    <nav className="section-nav" aria-label={label} ref={navRef}>
      {present.map((i) => (
        <button
          key={i.id}
          type="button"
          data-id={i.id}
          className="section-nav-item"
          aria-current={active === i.id ? 'true' : undefined}
          onClick={() => {
            setActive(i.id);
            scrollToAnchor(i.id);
          }}
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}
