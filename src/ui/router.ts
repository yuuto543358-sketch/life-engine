import { useEffect, useState } from 'react';

export type TabKey = 'home' | 'sim' | 'map' | 'log' | 'settings';
export const TABS: TabKey[] = ['home', 'sim', 'map', 'log', 'settings'];

export interface Route {
  tab: TabKey;
  sub: string;
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [tab, sub = ''] = path.split('/');
  return {
    tab: (TABS as string[]).includes(tab) ? (tab as TabKey) : 'home',
    sub,
    params: new URLSearchParams(query),
  };
}

/** ハッシュでの画面遷移（再読み込みしても同じ画面に戻る） */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(tab: TabKey, sub = '', params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  const next = `#/${tab}${sub ? `/${sub}` : ''}${q ? `?${q}` : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
  window.scrollTo({ top: 0 });
}

export function href(tab: TabKey, sub = '', params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  return `#/${tab}${sub ? `/${sub}` : ''}${q ? `?${q}` : ''}`;
}
