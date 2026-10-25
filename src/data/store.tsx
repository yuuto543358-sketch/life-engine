import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toDateString } from '../engine/units';
import { cloneScenario } from '../engine/scenarios';
import { loadAll, replaceAll, requestPersistence, write, StorageError, type StoreName, type WriteOp } from './db';
import { defaultDomains, defaultProfile, defaultSettings, emptyScenario } from './defaults';
import { buildSample } from './sample';
import {
  CURRENT_SCENARIO_ID,
  type AppData,
  type AppSettings,
  type Scenario,
  type UserProfile,
} from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
  action?: { label: string; run: () => void };
  sticky?: boolean;
}

type CollectionKey = 'domains' | 'goals' | 'scenarios' | 'actuals' | 'dependencies';
const COLLECTIONS: CollectionKey[] = ['domains', 'goals', 'scenarios', 'actuals', 'dependencies'];

/** 2つの状態の差分から、保存すべき追加・更新・削除を求める（オブジェクトの参照で比較する） */
export function diffData(prev: AppData, next: AppData): WriteOp[] {
  const ops: WriteOp[] = [];
  const meta: { id: string }[] = [];
  if (prev.profile !== next.profile) meta.push(next.profile);
  if (prev.settings !== next.settings) meta.push(next.settings);
  if (meta.length) ops.push({ store: 'meta', put: meta });
  for (const key of COLLECTIONS) {
    const a = prev[key] as { id: string }[];
    const b = next[key] as { id: string }[];
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const after = new Set(b.map((x) => x.id));
    const put = b.filter((x) => before.get(x.id) !== x);
    const remove = a.filter((x) => !after.has(x.id)).map((x) => x.id);
    if (put.length || remove.length) ops.push({ store: key as StoreName, put, remove });
  }
  return ops;
}

/** prev→next で変わった項目だけを、current の上で prev の状態に戻す（元に戻す用） */
function revertChanges(current: AppData, prev: AppData, next: AppData): AppData {
  const out: AppData = { ...current };
  if (prev.profile !== next.profile) out.profile = prev.profile;
  if (prev.settings !== next.settings) out.settings = prev.settings;
  for (const key of COLLECTIONS) {
    const a = prev[key] as { id: string }[];
    const b = next[key] as { id: string }[];
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const after = new Map(b.map((x) => [x.id, x]));
    const changed = new Set<string>();
    for (const [id, v] of after) if (before.get(id) !== v) changed.add(id);
    for (const id of before.keys()) if (!after.has(id)) changed.add(id);
    let list = (current[key] as { id: string }[]).filter((x) => !changed.has(x.id));
    const restore = a.filter((x) => changed.has(x.id));
    list = [...list, ...restore];
    (out as unknown as Record<string, unknown>)[key] = list;
  }
  return out;
}

let idCounter = 0;
export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 13)
      : `${Date.now().toString(36)}${(idCounter++).toString(36)}`;
  return `${prefix}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function emptyData(now: string): AppData {
  return {
    profile: defaultProfile(now),
    settings: defaultSettings(),
    domains: defaultDomains(),
    goals: [],
    scenarios: [emptyScenario(now)],
    actuals: [],
    dependencies: [],
  };
}

/** 読み込んだデータの欠けている部分を補う */
function normalize(raw: Awaited<ReturnType<typeof loadAll>>): { data: AppData; changed: boolean } {
  const now = nowIso();
  let changed = false;
  const profile = (raw.meta.find((m) => m.id === 'profile') as UserProfile | undefined) ?? (changed = true, defaultProfile(now));
  const settingsRaw = raw.meta.find((m) => m.id === 'settings') as Partial<AppSettings> | undefined;
  const settings: AppSettings = { ...defaultSettings(), ...(settingsRaw ?? {}) };
  if (!settingsRaw) changed = true;
  let scenarios = raw.scenarios;
  if (!scenarios.some((s) => s.id === CURRENT_SCENARIO_ID)) {
    scenarios = [emptyScenario(now), ...scenarios];
    changed = true;
  }
  let domains = raw.domains;
  if (domains.length === 0 && !profile.onboarded) {
    domains = defaultDomains();
    changed = true;
  }
  return {
    data: {
      profile,
      settings,
      domains: [...domains].sort((a, b) => a.order - b.order),
      goals: raw.goals,
      scenarios,
      actuals: raw.actuals,
      dependencies: raw.dependencies,
    },
    changed,
  };
}

interface StoreValue {
  data: AppData;
  today: string;
  saveStatus: SaveStatus;
  /** 状態を更新して保存する。debounce = true はスライダーなど連続した操作向け */
  update: (fn: (d: AppData) => AppData, opts?: { debounce?: boolean; undo?: string; success?: string }) => void;
  retrySave: () => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  current: Scenario;
  // まとめて行う操作
  importData: (data: AppData) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  addSample: () => void;
  removeSample: () => void;
  duplicateScenario: (sourceId: string, name: string) => string;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider がありません');
  return v;
}

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: (s: LoadState, retry: () => void) => ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [data, setData] = useState<AppData>(() => emptyData(nowIso()));
  const [today, setToday] = useState(() => toDateString(new Date()));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dataRef = useRef(data);
  const persistedRef = useRef(data);
  const timer = useRef<number | null>(null);
  const flushing = useRef<Promise<void> | null>(null);
  const dirtyAgain = useRef(false);
  const toastId = useRef(1);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++;
    setToasts((list) => [...list.filter((x) => !(x.kind === 'error' && t.kind === 'error')), { ...t, id }].slice(-3));
    if (!t.sticky) window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 6000 : 2800);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const doLoad = useCallback(() => {
    setLoad({ status: 'loading' });
    loadAll()
      .then(async (raw) => {
        const { data: d, changed } = normalize(raw);
        if (changed) await replaceAll(d);
        dataRef.current = d;
        persistedRef.current = d;
        setData(d);
        setLoad({ status: 'ready' });
        void requestPersistence();
      })
      .catch((e: unknown) => {
        setLoad({ status: 'failed', message: e instanceof StorageError ? e.message : 'データを読み込めませんでした' });
      });
  }, []);

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  // 日付が変わったら「今日」を更新する
  useEffect(() => {
    const refresh = () => setToday(toDateString(new Date()));
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (flushing.current) {
      dirtyAgain.current = true;
      return flushing.current;
    }
    const target = dataRef.current;
    const ops = diffData(persistedRef.current, target);
    if (ops.length === 0) return Promise.resolve();
    setSaveStatus('saving');
    const p = write(ops)
      .then(() => {
        persistedRef.current = target;
        setSaveStatus('saved');
        setToasts((list) => list.filter((t) => !(t.kind === 'error' && t.sticky)));
      })
      .catch((e: unknown) => {
        setSaveStatus('error');
        pushToast({
          kind: 'error',
          sticky: true,
          message: `${e instanceof StorageError ? e.message : '保存に失敗しました'}。変更はまだ保存されていません。`,
          action: { label: '再試行', run: () => void flush() },
        });
      })
      .finally(() => {
        flushing.current = null;
        if (dirtyAgain.current) {
          dirtyAgain.current = false;
          void flush();
        }
      });
    flushing.current = p;
    return p;
  }, [pushToast]);

  const update = useCallback<StoreValue['update']>(
    (fn, opts = {}) => {
      const prev = dataRef.current;
      const next = fn(prev);
      if (next === prev) return;
      dataRef.current = next;
      setData(next);
      if (opts.debounce) {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), 450);
      } else {
        void flush();
      }
      if (opts.undo) {
        pushToast({
          kind: 'info',
          message: opts.undo,
          action: {
            label: '元に戻す',
            run: () => {
              const cur = dataRef.current;
              const restored = revertChanges(cur, prev, next);
              dataRef.current = restored;
              setData(restored);
              void flush();
            },
          },
        });
      } else if (opts.success) {
        pushToast({ kind: 'success', message: opts.success });
      }
    },
    [flush, pushToast],
  );

  // 画面を閉じる前に保存を確定する
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const replaceWith = useCallback(
    async (next: AppData, okMessage: string): Promise<boolean> => {
      await flushing.current;
      try {
        await replaceAll(next);
      } catch (e) {
        pushToast({ kind: 'error', message: e instanceof StorageError ? e.message : '保存に失敗しました。データは変更されていません。' });
        return false;
      }
      dataRef.current = next;
      persistedRef.current = next;
      setData(next);
      setSaveStatus('saved');
      pushToast({ kind: 'success', message: okMessage });
      return true;
    },
    [pushToast],
  );

  const importData = useCallback((d: AppData) => replaceWith(d, 'バックアップを読み込みました'), [replaceWith]);
  const clearAll = useCallback(() => replaceWith(emptyData(nowIso()), 'すべてのデータを削除しました'), [replaceWith]);

  const addSample = useCallback(() => {
    update(
      (d) => {
        const now = nowIso();
        const sample = buildSample(today, now);
        const existingIds = new Set(d.goals.map((g) => g.id));
        if (sample.goals.some((g) => existingIds.has(g.id))) return d; // 追加済み
        const seed = !d.profile.onboarded;
        const domains = d.domains.length ? d.domains : defaultDomains();
        const scenarios = d.scenarios.map((s) => {
          if (s.id !== CURRENT_SCENARIO_ID) return s;
          return {
            ...s,
            ...(seed ? { time: structuredClone(sample.time), finance: structuredClone(sample.finance) } : {}),
            goalPlans: { ...s.goalPlans, ...structuredClone(sample.goalPlans) },
            updatedAt: now,
          };
        });
        return {
          ...d,
          profile: { ...d.profile, onboarded: true, sampleSeededPlan: seed || d.profile.sampleSeededPlan },
          domains,
          goals: [...d.goals, ...sample.goals],
          dependencies: [...d.dependencies, ...sample.dependencies],
          actuals: [...d.actuals, ...sample.actuals],
          scenarios: [...scenarios, ...sample.scenarios],
        };
      },
      { success: 'サンプルデータを追加しました' },
    );
  }, [today, update]);

  const removeSample = useCallback(() => {
    update(
      (d) => {
        const sampleGoalIds = new Set(d.goals.filter((g) => g.isSample).map((g) => g.id));
        const now = nowIso();
        const scenarios = d.scenarios
          .filter((s) => !s.isSample)
          .map((s) => {
            const plans = Object.fromEntries(Object.entries(s.goalPlans).filter(([id]) => !sampleGoalIds.has(id)));
            let next: Scenario = { ...s, goalPlans: plans, updatedAt: now };
            if (s.id === CURRENT_SCENARIO_ID && d.profile.sampleSeededPlan) {
              const empty = emptyScenario(now);
              next = { ...next, time: empty.time, finance: empty.finance };
            }
            return next;
          });
        const onlySample = d.goals.every((g) => g.isSample) && d.actuals.every((a) => a.isSample);
        return {
          ...d,
          profile: {
            ...d.profile,
            sampleSeededPlan: false,
            onboarded: d.profile.sampleSeededPlan && onlySample ? false : d.profile.onboarded,
          },
          goals: d.goals.filter((g) => !g.isSample),
          actuals: d.actuals.filter((a) => !a.isSample).map((a) => (a.goalId && sampleGoalIds.has(a.goalId) ? { ...a, goalId: null } : a)),
          dependencies: d.dependencies.filter(
            (x) => !x.isSample && !(x.from.kind === 'goal' && sampleGoalIds.has(x.from.id)) && !(x.to.kind === 'goal' && sampleGoalIds.has(x.to.id)),
          ),
          domains: d.domains.filter((x) => !x.isSample),
          scenarios,
        };
      },
      { success: 'サンプルデータを削除しました' },
    );
  }, [update]);

  const duplicateScenario = useCallback(
    (sourceId: string, name: string) => {
      const id = newId('sc-');
      update(
        (d) => {
          const src = d.scenarios.find((s) => s.id === sourceId);
          if (!src) return d;
          return { ...d, scenarios: [...d.scenarios, cloneScenario(src, { id, name, now: nowIso() })] };
        },
        { success: `「${name}」を作成しました` },
      );
      return id;
    },
    [update],
  );

  const current = useMemo(
    () => data.scenarios.find((s) => s.id === CURRENT_SCENARIO_ID) ?? emptyScenario(nowIso()),
    [data.scenarios],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      today,
      saveStatus,
      update,
      retrySave: () => void flush(),
      toasts,
      pushToast,
      dismissToast,
      current,
      importData,
      clearAll,
      addSample,
      removeSample,
      duplicateScenario,
    }),
    [data, today, saveStatus, update, flush, toasts, pushToast, dismissToast, current, importData, clearAll, addSample, removeSample, duplicateScenario],
  );

  if (load.status !== 'ready') return <>{fallback(load, doLoad)}</>;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** シナリオを1件書き換える小さなヘルパー */
export function patchScenario(d: AppData, id: string, fn: (s: Scenario) => Scenario): AppData {
  return {
    ...d,
    scenarios: d.scenarios.map((s) => (s.id === id ? { ...fn(s), updatedAt: nowIso() } : s)),
  };
}
