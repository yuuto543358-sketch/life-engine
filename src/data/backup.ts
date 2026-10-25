import { isValidDate, isValidMonth } from '../engine/units';
import { defaultProfile, defaultSettings, emptyFinance, emptyTimeBudget } from './defaults';
import {
  CURRENT_SCENARIO_ID,
  SCHEMA_VERSION,
  TIME_CATEGORY_KEYS,
  type ActualRecord,
  type AppData,
  type AppSettings,
  type BackupFile,
  type Dependency,
  type FinancialProfile,
  type Goal,
  type GoalPlan,
  type LifeDomain,
  type NodeRef,
  type Scenario,
  type TimeBudget,
  type TimeSource,
  type UserProfile,
} from './types';

export function createBackup(data: AppData, now: string): BackupFile {
  return { app: 'life-engine', schemaVersion: SCHEMA_VERSION, exportedAt: now, data };
}

export type ImportResult =
  | { ok: true; data: AppData; summary: Record<string, number>; warnings: string[] }
  | { ok: false; errors: string[] };

/** 検証用の小さなヘルパー。問題があれば errors に追加して例外で中断する */
class Invalid extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const MAX_ITEMS = 50000;
const MAX_TEXT = 2000;

function makeReader(errors: string[]) {
  const fail = (where: string, msg: string): never => {
    errors.push(`${where}: ${msg}`);
    throw new Invalid();
  };
  const obj = (v: unknown, where: string): Obj => (isObj(v) ? v : fail(where, 'オブジェクトではありません'));
  const str = (v: unknown, where: string, opts: { allowEmpty?: boolean; fallback?: string } = {}): string => {
    if (v === undefined && opts.fallback !== undefined) return opts.fallback;
    if (typeof v !== 'string') return fail(where, '文字列ではありません');
    if (!opts.allowEmpty && v.trim() === '') return fail(where, '空です');
    return v.slice(0, MAX_TEXT);
  };
  const numIn = (v: unknown, where: string, min: number, max: number, fallback?: number): number => {
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail(where, '数値ではありません');
    if (v < min || v > max) return fail(where, `${min}〜${max} の範囲外です`);
    return v;
  };
  const bool = (v: unknown, where: string, fallback?: boolean): boolean => {
    if (v === undefined && fallback !== undefined) return fallback;
    return typeof v === 'boolean' ? v : fail(where, '真偽値ではありません');
  };
  const oneOf = <T extends string>(v: unknown, where: string, options: readonly T[], fallback?: T): T => {
    if (v === undefined && fallback !== undefined) return fallback;
    return options.includes(v as T) ? (v as T) : fail(where, '想定外の値です');
  };
  const arr = (v: unknown, where: string): unknown[] => {
    if (!Array.isArray(v)) return fail(where, '配列ではありません');
    if (v.length > MAX_ITEMS) return fail(where, '件数が多すぎます');
    return v;
  };
  const date = (v: unknown, where: string, allowEmpty = false): string => {
    if (allowEmpty && (v === '' || v === undefined)) return '';
    return isValidDate(v) ? v : fail(where, '日付の形式（YYYY-MM-DD）ではありません');
  };
  const month = (v: unknown, where: string, allowEmpty = false): string => {
    if (allowEmpty && (v === '' || v === undefined)) return '';
    return isValidMonth(v) ? v : fail(where, '年月の形式（YYYY-MM）ではありません');
  };
  const pos = (v: unknown, where: string): { x: number; y: number } | undefined => {
    if (v === undefined) return undefined;
    const o = obj(v, where);
    return { x: numIn(o.x, `${where}.x`, -1e6, 1e6), y: numIn(o.y, `${where}.y`, -1e6, 1e6) };
  };
  return { fail, obj, str, numIn, bool, oneOf, arr, date, month, pos };
}

const MONEY_MAX = 1e12;
const TIME_SOURCES: readonly TimeSource[] = [...TIME_CATEGORY_KEYS, 'free'];

/**
 * バックアップファイルを検証する。
 * 1か所でも不正があれば全体を受け付けない（既存データを部分的に壊さないため）。
 */
export function parseBackup(text: string): ImportResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSONとして読み込めませんでした。ファイルが壊れている可能性があります。'] };
  }
  const r = makeReader(errors);
  const warnings: string[] = [];
  try {
    const file = r.obj(raw, 'ファイル');
    if (file.app !== 'life-engine') r.fail('ファイル', 'LIFE ENGINE のバックアップではありません');
    const version = r.numIn(file.schemaVersion, 'schemaVersion', 1, 1000);
    if (version > SCHEMA_VERSION) r.fail('schemaVersion', 'このアプリより新しい形式です。アプリを更新してください');
    const d = r.obj(file.data, 'data');

    const now = new Date().toISOString();
    const p = r.obj(d.profile, 'profile');
    const profile: UserProfile = {
      ...defaultProfile(now),
      name: r.str(p.name, 'profile.name', { allowEmpty: true, fallback: '' }),
      onboarded: r.bool(p.onboarded, 'profile.onboarded', true),
      sampleSeededPlan: r.bool(p.sampleSeededPlan, 'profile.sampleSeededPlan', false),
      createdAt: r.str(p.createdAt, 'profile.createdAt', { fallback: now }),
    };

    const s = d.settings === undefined ? {} : r.obj(d.settings, 'settings');
    const def = defaultSettings();
    const settings: AppSettings = {
      id: 'settings',
      theme: r.oneOf(s.theme, 'settings.theme', ['system', 'light', 'dark'] as const, def.theme),
      motion: r.oneOf(s.motion, 'settings.motion', ['system', 'reduce', 'full'] as const, def.motion),
      textSize: r.oneOf(s.textSize, 'settings.textSize', ['standard', 'large'] as const, def.textSize),
      compactMoney: r.bool(s.compactMoney, 'settings.compactMoney', def.compactMoney),
    };

    const domains: LifeDomain[] = r.arr(d.domains, 'domains').map((v, i) => {
      const w = `domains[${i}]`;
      const o = r.obj(v, w);
      return {
        id: r.str(o.id, `${w}.id`),
        name: r.str(o.name, `${w}.name`),
        icon: r.str(o.icon, `${w}.icon`, { fallback: 'dot' }),
        note: r.str(o.note, `${w}.note`, { allowEmpty: true, fallback: '' }),
        order: r.numIn(o.order, `${w}.order`, -1e6, 1e6, i),
        pos: r.pos(o.pos, `${w}.pos`),
        ...(o.isSample === true ? { isSample: true } : {}),
      };
    });

    const goals: Goal[] = r.arr(d.goals, 'goals').map((v, i) => {
      const w = `goals[${i}]`;
      const o = r.obj(v, w);
      return {
        id: r.str(o.id, `${w}.id`),
        name: r.str(o.name, `${w}.name`),
        domainId: o.domainId === null || o.domainId === undefined ? null : r.str(o.domainId, `${w}.domainId`),
        completionCriteria: r.str(o.completionCriteria, `${w}.completionCriteria`, { allowEmpty: true, fallback: '' }),
        progress: r.numIn(o.progress, `${w}.progress`, 0, 100),
        totalHours: o.totalHours === null || o.totalHours === undefined ? null : r.numIn(o.totalHours, `${w}.totalHours`, 0, 1e6),
        note: r.str(o.note, `${w}.note`, { allowEmpty: true, fallback: '' }),
        createdAt: r.str(o.createdAt, `${w}.createdAt`, { fallback: now }),
        updatedAt: r.str(o.updatedAt, `${w}.updatedAt`, { fallback: now }),
        pos: r.pos(o.pos, `${w}.pos`),
        ...(o.isSample === true ? { isSample: true } : {}),
      };
    });
    const goalIds = new Set(goals.map((g) => g.id));
    const domainIds = new Set(domains.map((x) => x.id));
    for (const g of goals) {
      if (g.domainId && !domainIds.has(g.domainId)) {
        warnings.push(`目標「${g.name}」の領域が見つからないため、未分類にしました`);
        g.domainId = null;
      }
    }

    const readTime = (v: unknown, w: string): TimeBudget => {
      const o = r.obj(v, w);
      const items = r.obj(o.items, `${w}.items`);
      const base = emptyTimeBudget();
      for (const key of TIME_CATEGORY_KEYS) {
        const it = r.obj(items[key], `${w}.items.${key}`);
        const days = r.numIn(it.daysPerWeek, `${w}.items.${key}.daysPerWeek`, 0, 7);
        if (!Number.isInteger(days)) r.fail(`${w}.items.${key}.daysPerWeek`, '整数ではありません');
        base.items[key] = { hoursPerDay: r.numIn(it.hoursPerDay, `${w}.items.${key}.hoursPerDay`, 0, 24), daysPerWeek: days };
      }
      base.totalHours = r.numIn(o.totalHours, `${w}.totalHours`, 0, 168);
      return base;
    };
    const readFinance = (v: unknown, w: string): FinancialProfile => {
      const o = r.obj(v, w);
      const f = emptyFinance();
      f.monthlyIncome = r.numIn(o.monthlyIncome, `${w}.monthlyIncome`, 0, MONEY_MAX);
      f.fixedCosts = r.numIn(o.fixedCosts, `${w}.fixedCosts`, 0, MONEY_MAX);
      if (o.fixedItems === undefined) {
        delete f.fixedItems; // 内訳のない古い形式。合計額をそのまま使う
      } else {
        f.fixedItems = r.arr(o.fixedItems, `${w}.fixedItems`).map((x, i) => {
          const ww = `${w}.fixedItems[${i}]`;
          const it = r.obj(x, ww);
          return { id: r.str(it.id, `${ww}.id`), label: r.str(it.label, `${ww}.label`), amount: r.numIn(it.amount, `${ww}.amount`, 0, MONEY_MAX) };
        });
        // 合計は内訳から計算し直して、食い違いを防ぐ
        if (f.fixedItems.length > 0) f.fixedCosts = f.fixedItems.reduce((s, it) => s + it.amount, 0);
      }
      f.variableCosts = r.numIn(o.variableCosts, `${w}.variableCosts`, 0, MONEY_MAX);
      f.monthlySavings = r.numIn(o.monthlySavings, `${w}.monthlySavings`, 0, MONEY_MAX);
      f.currentSavings = r.numIn(o.currentSavings, `${w}.currentSavings`, -MONEY_MAX, MONEY_MAX);
      f.savingsTarget = r.numIn(o.savingsTarget, `${w}.savingsTarget`, 0, MONEY_MAX);
      f.targetMonth = r.month(o.targetMonth, `${w}.targetMonth`, true);
      f.annualReturnRate = r.numIn(o.annualReturnRate, `${w}.annualReturnRate`, 0, 100, 0);
      f.oneOffs = r.arr(o.oneOffs ?? [], `${w}.oneOffs`).map((x, i) => {
        const ww = `${w}.oneOffs[${i}]`;
        const oo = r.obj(x, ww);
        return {
          id: r.str(oo.id, `${ww}.id`),
          label: r.str(oo.label, `${ww}.label`, { allowEmpty: true, fallback: '' }),
          amount: r.numIn(oo.amount, `${ww}.amount`, 0, MONEY_MAX),
          type: r.oneOf(oo.type, `${ww}.type`, ['income', 'expense'] as const),
          month: r.month(oo.month, `${ww}.month`),
          repeatYearly: r.bool(oo.repeatYearly, `${ww}.repeatYearly`, false),
        };
      });
      return f;
    };
    const readPlan = (v: unknown, w: string): GoalPlan => {
      const o = r.obj(v, w);
      return {
        included: r.bool(o.included, `${w}.included`, true),
        deadline: r.date(o.deadline, `${w}.deadline`, true),
        weeklyHours: r.numIn(o.weeklyHours, `${w}.weeklyHours`, 0, 168),
        timeSource: r.oneOf(o.timeSource, `${w}.timeSource`, TIME_SOURCES, 'free'),
        budget: r.numIn(o.budget, `${w}.budget`, 0, MONEY_MAX),
        priority: r.numIn(o.priority, `${w}.priority`, 1, 99),
      };
    };

    const scenarios: Scenario[] = r.arr(d.scenarios, 'scenarios').map((v, i) => {
      const w = `scenarios[${i}]`;
      const o = r.obj(v, w);
      const plansRaw = r.obj(o.goalPlans ?? {}, `${w}.goalPlans`);
      const goalPlans: Record<string, GoalPlan> = {};
      for (const [gid, plan] of Object.entries(plansRaw)) {
        if (!goalIds.has(gid)) continue; // 存在しない目標の計画値は捨てる
        goalPlans[gid] = readPlan(plan, `${w}.goalPlans.${gid}`);
      }
      return {
        id: r.str(o.id, `${w}.id`),
        name: r.str(o.name, `${w}.name`),
        note: r.str(o.note, `${w}.note`, { allowEmpty: true, fallback: '' }),
        time: readTime(o.time, `${w}.time`),
        finance: readFinance(o.finance, `${w}.finance`),
        goalPlans,
        sourceId: o.sourceId === null || o.sourceId === undefined ? null : r.str(o.sourceId, `${w}.sourceId`),
        createdAt: r.str(o.createdAt, `${w}.createdAt`, { fallback: now }),
        updatedAt: r.str(o.updatedAt, `${w}.updatedAt`, { fallback: now }),
        ...(o.isSample === true ? { isSample: true } : {}),
      };
    });
    if (!scenarios.some((x) => x.id === CURRENT_SCENARIO_ID)) r.fail('scenarios', '「現在の計画」が含まれていません');

    const actuals: ActualRecord[] = r.arr(d.actuals, 'actuals').map((v, i) => {
      const w = `actuals[${i}]`;
      const o = r.obj(v, w);
      const goalId = o.goalId === null || o.goalId === undefined ? null : r.str(o.goalId, `${w}.goalId`);
      const base = {
        id: r.str(o.id, `${w}.id`),
        date: r.date(o.date, `${w}.date`),
        goalId: goalId && goalIds.has(goalId) ? goalId : null,
        memo: r.str(o.memo, `${w}.memo`, { allowEmpty: true, fallback: '' }),
        createdAt: r.str(o.createdAt, `${w}.createdAt`, { fallback: now }),
        ...(o.isSample === true ? { isSample: true as const } : {}),
      };
      const type = r.oneOf(o.type, `${w}.type`, ['time', 'expense', 'task', 'progress'] as const);
      switch (type) {
        case 'time':
          return { ...base, type, category: r.oneOf(o.category, `${w}.category`, TIME_CATEGORY_KEYS), hours: r.numIn(o.hours, `${w}.hours`, 0, 168) };
        case 'expense':
          return { ...base, type, expenseCategory: r.oneOf(o.expenseCategory, `${w}.expenseCategory`, ['fixed', 'variable', 'goal'] as const), amount: r.numIn(o.amount, `${w}.amount`, 0, MONEY_MAX) };
        case 'task':
          return {
            ...base,
            type,
            title: r.str(o.title, `${w}.title`, { allowEmpty: true, fallback: '' }),
            estimateHours: r.numIn(o.estimateHours, `${w}.estimateHours`, 0, 10000),
            actualHours: r.numIn(o.actualHours, `${w}.actualHours`, 0, 10000),
          };
        case 'progress':
          return { ...base, type, progress: r.numIn(o.progress, `${w}.progress`, 0, 100) };
      }
    });

    const nodeIds = { goal: goalIds, domain: domainIds };
    const readNode = (v: unknown, w: string): NodeRef => {
      const o = r.obj(v, w);
      return { kind: r.oneOf(o.kind, `${w}.kind`, ['goal', 'domain'] as const), id: r.str(o.id, `${w}.id`) };
    };
    const dependencies: Dependency[] = [];
    r.arr(d.dependencies, 'dependencies').forEach((v, i) => {
      const w = `dependencies[${i}]`;
      const o = r.obj(v, w);
      const dep: Dependency = {
        id: r.str(o.id, `${w}.id`),
        from: readNode(o.from, `${w}.from`),
        to: readNode(o.to, `${w}.to`),
        label: r.str(o.label, `${w}.label`, { allowEmpty: true, fallback: '' }),
        createdAt: r.str(o.createdAt, `${w}.createdAt`, { fallback: now }),
        ...(o.isSample === true ? { isSample: true } : {}),
      };
      if (!nodeIds[dep.from.kind].has(dep.from.id) || !nodeIds[dep.to.kind].has(dep.to.id)) {
        warnings.push('存在しない目標・領域を指すつながりを1件除外しました');
        return;
      }
      dependencies.push(dep);
    });

    // ID の重複は上書き事故につながるため受け付けない
    const dupCheck = (list: { id: string }[], name: string) => {
      const seen = new Set<string>();
      for (const x of list) {
        if (seen.has(x.id)) r.fail(name, `ID「${x.id}」が重複しています`);
        seen.add(x.id);
      }
    };
    dupCheck(domains, 'domains');
    dupCheck(goals, 'goals');
    dupCheck(scenarios, 'scenarios');
    dupCheck(actuals, 'actuals');
    dupCheck(dependencies, 'dependencies');

    const data: AppData = { profile, settings, domains, goals, scenarios, actuals, dependencies };
    return {
      ok: true,
      data,
      warnings,
      summary: {
        目標: goals.length,
        シナリオ: scenarios.length,
        実績: actuals.length,
        つながり: dependencies.length,
        領域: domains.length,
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, errors: errors.slice(0, 5) };
    return { ok: false, errors: ['ファイルの検証中に問題が起きました'] };
  }
}
