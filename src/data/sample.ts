import { addDays, addMonths } from '../engine/units';
import { structuredCloneSafe } from '../engine/scenarios';
import { emptyScenario } from './defaults';
import {
  CURRENT_SCENARIO_ID,
  type ActualRecord,
  type Dependency,
  type ChronicleEntry,
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
  chronicle: ChronicleEntry[];
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
    { ...mkGoal('s-trip', '北海道旅行の資金', 'd-hobby', 20, null, ''), kind: 'money', moneyPurpose: 'buy', savedAmount: 30000 },
    { ...mkGoal('s-move', '職場の近くへ引っ越す費用', 'd-living', 17, 20, ''), kind: 'money', moneyPurpose: 'buy', savedAmount: 50000 },
    { ...mkGoal('s-emergency', '生活防衛資金', 'd-money', 60, null, ''), kind: 'money', moneyPurpose: 'save', savedAmount: 600000 },
    { ...mkGoal('s-toeic', 'TOEIC 700点', 'd-learning', 100, 120, '700点以上を取る'), completedAt: addDays(today, -41) },
  ];

  const goalPlans: Record<string, GoalPlan> = {
    's-cert': { included: true, deadline: `${addMonths(ym, 6)}-19`, weeklyHours: 8, timeSource: 'study', budget: 30000, priority: 1 },
    's-job': { included: true, deadline: `${addMonths(ym, 11)}-28`, weeklyHours: 3, timeSource: 'free', budget: 50000, priority: 2 },
    's-run': { included: true, deadline: `${addMonths(ym, 5)}-15`, weeklyHours: 4, timeSource: 'hobby', budget: 25000, priority: 3 },
    's-trip': { included: true, deadline: `${addMonths(ym, 10)}-28`, weeklyHours: 0, timeSource: 'free', budget: 150000, priority: 4 },
    's-move': { included: true, deadline: `${addMonths(ym, 14)}-28`, weeklyHours: 1, timeSource: 'free', budget: 300000, priority: 5 },
    's-toeic': { included: true, deadline: addDays(today, -30), weeklyHours: 0, timeSource: 'study', budget: 0, priority: 7 },
    's-emergency': { included: true, deadline: `${addMonths(ym, 17)}-28`, weeklyHours: 0, timeSource: 'free', budget: 1000000, priority: 6 },
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
    incomeItems: [{ id: 'in-salary', label: '給与（手取り）', amount: 280000 }],
    fixedCosts: 110000,
    fixedItems: [
      { id: 'fx-rent', label: '家賃', amount: 68000 },
      { id: 'fx-electric', label: '電気代', amount: 6000 },
      { id: 'fx-gas', label: 'ガス代', amount: 3500 },
      { id: 'fx-water', label: '水道代', amount: 2500 },
      { id: 'fx-phone', label: 'スマホ', amount: 3000 },
      { id: 'fx-net', label: 'インターネット回線', amount: 5000 },
      { id: 'fx-medical', label: '医療保険・がん保険', amount: 4000 },
      { id: 'fx-houseins', label: '火災保険・その他の保険', amount: 1000 },
      { id: 'fx-transport', label: '定期代', amount: 0 },
      { id: 'fx-scholarship', label: '奨学金の返済', amount: 12000 },
      { id: 'fx-subscription', label: '動画・音楽などのサブスク', amount: 2000 },
      { id: 'fx-membership', label: 'ジム・会費', amount: 3000 },
    ],
    variableCosts: 90000,
    variableItems: [
      { id: 'vr-grocery', label: '食料品（自炊）', amount: 35000 },
      { id: 'vr-eatout', label: '外食', amount: 15000 },
      { id: 'vr-cafe', label: 'カフェ・おやつ・飲み物', amount: 3000 },
      { id: 'vr-daily', label: '日用品', amount: 8000 },
      { id: 'vr-clothes', label: '衣服・靴', amount: 7000 },
      { id: 'vr-beauty', label: '美容・理容', amount: 4000 },
      { id: 'vr-medical', label: '医療費・薬', amount: 2000 },
      { id: 'vr-social', label: '交際費', amount: 8000 },
      { id: 'vr-hobby', label: '趣味・娯楽', amount: 5000 },
      { id: 'vr-books', label: '本・学習', amount: 3000 },
    ],
    monthlySavings: 50000,
    savingsItems: [
      { id: 'sv-deposit', label: '預金（普通・定期）', amount: 20000 },
      { id: 'sv-nisa', label: 'つみたてNISA（つみたて投資枠）', amount: 30000 },
    ],
    savingsTargetMode: 'auto',
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

  // 年代記
  const ce = (id: string, back: number, kind: ChronicleEntry['kind'], title: string, body: string, extra: Partial<ChronicleEntry> = {}): ChronicleEntry => ({
    id,
    kind,
    date: addDays(today, -back),
    title,
    body,
    photos: [],
    goalId: null,
    createdAt: now,
    updatedAt: now,
    isSample: true,
    ...extra,
  });
  const chronicle: ChronicleEntry[] = [
    ce('s-c1', 41, 'milestone', 'TOEIC 700点に届いた', '半年かけた勉強が形になった。', { goalId: 's-toeic' }),
    ce('s-c2', 26, 'journal', '朝の川沿いを走った', '少し寒かったけれど、走り終えたあとのコーヒーがおいしかった。', { goalId: 's-run' }),
    ce('s-c3', 15, 'journal', '過去問で6割', '午前問題でやっと6割。ネットワーク分野がまだ弱い。', { goalId: 's-cert' }),
    ce('s-c4', 9, 'quiet', '', '今週は少し詰め込みすぎた。週末は何も予定を入れない。', { quietKind: 'reflection' }),
    ce('s-c5', 3, 'quiet', '', '', { quietKind: 'nothing', minutes: 40 }),
    ce('s-c6', 1, 'quiet', '', '', { quietKind: 'tomorrow', steps: ['過去問を1回分', '洗濯', '早めに寝る'] }),
  ];

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
      // 変動費 90,000 → 72,000円、毎月の貯金 50,000 → 75,000円
      setAmounts(s.finance, 'variableItems', 'variableCosts', { 'vr-eatout': 5000, 'vr-cafe': 0, 'vr-clothes': 2000 });
      setAmounts(s.finance, 'savingsItems', 'monthlySavings', { 'sv-deposit': 25000, 'sv-nisa': 50000 });
      s.goalPlans['s-trip'].included = false;
    }),
    mk('s-sc-free', '自由時間優先', '残業を減らして趣味と休息を増やす', (s) => {
      s.time.items.work = { hoursPerDay: 8, daysPerWeek: 5 };
      s.time.items.hobby = { hoursPerDay: 2, daysPerWeek: 7 };
      setAmounts(s.finance, 'incomeItems', 'monthlyIncome', { 'in-salary': 265000 });
      s.goalPlans['s-run'].weeklyHours = 6;
    }),
  ];

  return { goals, dependencies, actuals, chronicle, time, finance, goalPlans, scenarios };
}

export const SAMPLE_GOAL_PREFIX = 's-';

/** 内訳の金額を変えて、合計も計算し直す */
function setAmounts(
  fin: FinancialProfile,
  itemsKey: 'incomeItems' | 'fixedItems' | 'variableItems' | 'savingsItems',
  totalKey: 'monthlyIncome' | 'fixedCosts' | 'variableCosts' | 'monthlySavings',
  amounts: Record<string, number>,
) {
  const items = (fin[itemsKey] ?? []).map((i) => (i.id in amounts ? { ...i, amount: amounts[i.id] } : i));
  fin[itemsKey] = items;
  fin[totalKey] = items.reduce((sum, i) => sum + i.amount, 0);
}
