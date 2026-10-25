import { addDays, addMonths } from '../engine/units';
import { structuredCloneSafe } from '../engine/scenarios';
import { emptyScenario } from './defaults';
import {
  CURRENT_SCENARIO_ID,
  type ActualRecord,
  type Dependency,
  type Goal,
  type GoalPlan,
  type Scenario,
  type TimeBudget,
  type FinancialProfile,
} from './types';

/** サンプルデータ。すべて isSample = true で、サンプル削除時にまとめて取り除ける */
export interface SampleBundle {
  goals: Goal[];
  dependencies: Dependency[];
  actuals: ActualRecord[];
  /** 現在の計画に使う時間・お金（未設定の場合のみ適用） */
  time: TimeBudget;
  finance: FinancialProfile;
  /** 現在の計画に追加する目標の計画値 */
  goalPlans: Record<string, GoalPlan>;
  scenarios: Scenario[];
}

export function buildSample(today: string, now: string): SampleBundle {
  const ym = today.slice(0, 7);
  const mkGoal = (id: string, name: string, domainId: string, progress: number, totalHours: number | null, criteria: string): Goal => ({
    id,
    name,
    domainId,
    completionCriteria: criteria,
    progress,
    totalHours,
    note: '',
    createdAt: now,
    updatedAt: now,
    isSample: true,
  });

  const goals: Goal[] = [
    mkGoal('s-cert', '応用情報技術者に合格', 'd-learning', 35, 200, '試験に合格する'),
    mkGoal('s-job', '転職して年収を上げる', 'd-work', 10, 60, '内定を得て入社する'),
    mkGoal('s-run', 'ハーフマラソン完走', 'd-health', 40, 80, '21kmを走りきる'),
    mkGoal('s-trip', '北海道旅行', 'd-hobby', 0, null, '旅行に行く'),
    mkGoal('s-move', '職場の近くへ引っ越す', 'd-living', 0, 20, '新居に住み始める'),
  ];

  const goalPlans: Record<string, GoalPlan> = {
    's-cert': { included: true, deadline: `${addMonths(ym, 6)}-19`, weeklyHours: 8, timeSource: 'study', budget: 30000, priority: 1 },
    's-job': { included: true, deadline: `${addMonths(ym, 11)}-28`, weeklyHours: 3, timeSource: 'free', budget: 50000, priority: 2 },
    's-run': { included: true, deadline: `${addMonths(ym, 5)}-15`, weeklyHours: 4, timeSource: 'hobby', budget: 25000, priority: 3 },
    's-trip': { included: true, deadline: `${addMonths(ym, 10)}-28`, weeklyHours: 0, timeSource: 'free', budget: 150000, priority: 4 },
    's-move': { included: true, deadline: `${addMonths(ym, 14)}-28`, weeklyHours: 1, timeSource: 'free', budget: 300000, priority: 5 },
  };

  const time: TimeBudget = {
    totalHours: 168,
    items: {
      sleep: { hoursPerDay: 7, daysPerWeek: 7 },
      work: { hoursPerDay: 8.5, daysPerWeek: 5 },
      commute: { hoursPerDay: 1.5, daysPerWeek: 5 },
      housework: { hoursPerDay: 1.5, daysPerWeek: 7 },
      study: { hoursPerDay: 1.5, daysPerWeek: 6 },
      hobby: { hoursPerDay: 1.5, daysPerWeek: 7 },
      other: { hoursPerDay: 1, daysPerWeek: 7 },
    },
  };

  const decMonth = ym.slice(5) === '12' ? ym : `${ym.slice(0, 4)}-12`;
  const junMonth = +ym.slice(5) <= 6 ? `${ym.slice(0, 4)}-06` : `${+ym.slice(0, 4) + 1}-06`;
  const finance: FinancialProfile = {
    monthlyIncome: 280000,
    fixedCosts: 110000,
    fixedItems: [
      { id: 'fx-rent', label: '家賃・住宅ローン', amount: 68000 },
      { id: 'fx-utilities', label: '水道光熱費', amount: 12000 },
      { id: 'fx-phone', label: '通信費（スマホ・ネット）', amount: 8000 },
      { id: 'fx-insurance', label: '保険', amount: 7000 },
      { id: 'fx-subscription', label: 'サブスク', amount: 3000 },
      { id: 'fx-transport', label: '交通費（定期・車など）', amount: 0 },
      { id: 'fx-loan', label: 'ローン返済', amount: 0 },
      { id: 'fx-other', label: 'その他の固定費', amount: 12000 },
    ],
    variableCosts: 90000,
    monthlySavings: 50000,
    currentSavings: 850000,
    savingsTarget: 2000000,
    targetMonth: addMonths(ym, 17),
    annualReturnRate: 0,
    oneOffs: [
      { id: 's-oo1', label: '冬のボーナス', amount: 300000, type: 'income', month: decMonth, repeatYearly: true },
      { id: 's-oo2', label: '夏のボーナス', amount: 300000, type: 'income', month: junMonth, repeatYearly: true },
      { id: 's-oo3', label: '帰省の交通費', amount: 60000, type: 'expense', month: decMonth, repeatYearly: false },
    ],
  };

  const dependencies: Dependency[] = [
    { id: 's-dep1', from: { kind: 'goal', id: 's-cert' }, to: { kind: 'goal', id: 's-job' }, label: '応募の強みになる', createdAt: now, isSample: true },
    { id: 's-dep2', from: { kind: 'goal', id: 's-job' }, to: { kind: 'domain', id: 'd-money' }, label: '収入が変わる', createdAt: now, isSample: true },
    { id: 's-dep3', from: { kind: 'goal', id: 's-job' }, to: { kind: 'goal', id: 's-move' }, label: '勤務地が決まってから', createdAt: now, isSample: true },
    { id: 's-dep4', from: { kind: 'goal', id: 's-move' }, to: { kind: 'domain', id: 'd-living' }, label: '通勤時間が変わる', createdAt: now, isSample: true },
    { id: 's-dep5', from: { kind: 'goal', id: 's-run' }, to: { kind: 'domain', id: 'd-health' }, label: '体力がつく', createdAt: now, isSample: true },
  ];

  // 実績: 過去5週間ぶん。決まったパターンで作り、毎回同じ内容になる
  const actuals: ActualRecord[] = [];
  const studyPattern = [1.5, 0, 2, 1, 1.5, 3, 0];
  const expensePattern = [2800, 1200, 0, 4500, 900, 6800, 3100];
  let n = 0;
  for (let back = 34; back >= 0; back--) {
    const date = addDays(today, -back);
    const i = back % 7;
    const base = { date, memo: '', createdAt: now, isSample: true } as const;
    if (studyPattern[i] > 0) {
      actuals.push({ ...base, id: `s-a${n++}`, type: 'time', category: 'study', hours: studyPattern[i], goalId: 's-cert' });
    }
    if (i === 2 || i === 5) {
      actuals.push({ ...base, id: `s-a${n++}`, type: 'time', category: 'hobby', hours: i === 2 ? 1 : 1.5, goalId: 's-run', memo: i === 5 ? 'ジョギング 8km' : '' });
    }
    if (expensePattern[i] > 0) {
      actuals.push({ ...base, id: `s-a${n++}`, type: 'expense', expenseCategory: 'variable', amount: expensePattern[i], goalId: null });
    }
  }
  const tasks: [number, string, number, number][] = [
    [30, '午前問題 過去問1回分', 2, 2.5],
    [25, '職務経歴書の下書き', 1.5, 3],
    [18, 'ネットワーク分野の復習', 3, 3.5],
    [11, '午後問題 過去問1回分', 2.5, 3],
    [6, '転職サイトの登録', 1, 0.75],
    [2, 'データベース分野の復習', 2, 2.5],
  ];
  for (const [back, title, est, act] of tasks) {
    actuals.push({
      id: `s-a${n++}`,
      date: addDays(today, -back),
      type: 'task',
      title,
      estimateHours: est,
      actualHours: act,
      goalId: title.includes('転職') || title.includes('職務') ? 's-job' : 's-cert',
      memo: '',
      createdAt: now,
      isSample: true,
    });
  }
  actuals.push(
    { id: `s-a${n++}`, date: addDays(today, -20), type: 'expense', expenseCategory: 'goal', amount: 8000, goalId: 's-cert', memo: '参考書', createdAt: now, isSample: true },
    { id: `s-a${n++}`, date: addDays(today, -12), type: 'expense', expenseCategory: 'goal', amount: 12000, goalId: 's-run', memo: 'ランニングシューズ', createdAt: now, isSample: true },
    { id: `s-a${n++}`, date: addDays(today, -14), type: 'progress', progress: 30, goalId: 's-cert', memo: '午前問題が6割に届いた', createdAt: now, isSample: true },
    { id: `s-a${n++}`, date: addDays(today, -1), type: 'progress', progress: 35, goalId: 's-cert', memo: '', createdAt: now, isSample: true },
  );

  // シナリオ
  const base = emptyScenario(now);
  const mk = (id: string, name: string, note: string, edit: (s: Scenario) => void): Scenario => {
    const s: Scenario = {
      ...base,
      id,
      name,
      note,
      time: structuredCloneSafe(time),
      finance: structuredCloneSafe(finance),
      goalPlans: structuredCloneSafe(goalPlans),
      sourceId: CURRENT_SCENARIO_ID,
      isSample: true,
    };
    s.finance.oneOffs = s.finance.oneOffs.map((o, i) => ({ ...o, id: `${id}-oo${i}` }));
    edit(s);
    return s;
  };
  const scenarios: Scenario[] = [
    mk('s-sc-study', '勉強優先', '資格の勉強を増やし、趣味を少し減らす', (s) => {
      s.time.items.study = { hoursPerDay: 2.5, daysPerWeek: 6 };
      s.time.items.hobby = { hoursPerDay: 1, daysPerWeek: 7 };
      s.goalPlans['s-cert'].weeklyHours = 14;
      s.goalPlans['s-cert'].deadline = `${addMonths(ym, 4)}-20`;
    }),
    mk('s-sc-save', '貯金優先', '変動費を抑えて貯金を増やす。旅行は見送る', (s) => {
      s.finance.variableCosts = 72000;
      s.finance.monthlySavings = 75000;
      s.goalPlans['s-trip'].included = false;
    }),
    mk('s-sc-free', '自由時間優先', '残業を減らして趣味と休息を増やす', (s) => {
      s.time.items.work = { hoursPerDay: 8, daysPerWeek: 5 };
      s.time.items.hobby = { hoursPerDay: 2, daysPerWeek: 7 };
      s.finance.monthlyIncome = 265000;
      s.goalPlans['s-run'].weeklyHours = 6;
    }),
  ];

  return { goals, dependencies, actuals, time, finance, goalPlans, scenarios };
}

export const SAMPLE_GOAL_PREFIX = 's-';
