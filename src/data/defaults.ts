import {
  CURRENT_SCENARIO_ID,
  type AppSettings,
  type FinancialProfile,
  type FixedCostItem,
  type GoalPlan,
  type LifeDomain,
  type Scenario,
  type TimeBudget,
  type UserProfile,
} from './types';

export function emptyTimeBudget(): TimeBudget {
  return {
    totalHours: 168,
    items: {
      sleep: { hoursPerDay: 7, daysPerWeek: 7 },
      work: { hoursPerDay: 8, daysPerWeek: 5 },
      commute: { hoursPerDay: 1, daysPerWeek: 5 },
      housework: { hoursPerDay: 1, daysPerWeek: 7 },
      study: { hoursPerDay: 0, daysPerWeek: 5 },
      hobby: { hoursPerDay: 1, daysPerWeek: 7 },
      other: { hoursPerDay: 1, daysPerWeek: 7 },
    },
  };
}

/** 固定費の内訳の初期項目（ID・名前・スライダーの上限） */
export const FIXED_PRESETS: { id: string; label: string; max: number }[] = [
  { id: 'fx-rent', label: '家賃・住宅ローン', max: 300000 },
  { id: 'fx-utilities', label: '水道光熱費', max: 50000 },
  { id: 'fx-phone', label: '通信費（スマホ・ネット）', max: 30000 },
  { id: 'fx-insurance', label: '保険', max: 50000 },
  { id: 'fx-subscription', label: 'サブスク', max: 20000 },
  { id: 'fx-transport', label: '交通費（定期・車など）', max: 50000 },
  { id: 'fx-loan', label: 'ローン返済', max: 100000 },
  { id: 'fx-other', label: 'その他の固定費', max: 100000 },
];

/** 初期項目の内訳。otherAmount は「その他の固定費」に入れる金額（内訳がない古いデータの移行用） */
export function defaultFixedItems(otherAmount = 0): FixedCostItem[] {
  return FIXED_PRESETS.map((p) => ({ id: p.id, label: p.label, amount: p.id === 'fx-other' ? otherAmount : 0 }));
}

/** 内訳を返す。内訳がない古いデータは、合計額を「その他の固定費」に入れた初期項目で表す */
export function ensureFixedItems(fin: Pick<FinancialProfile, 'fixedCosts' | 'fixedItems'>): FixedCostItem[] {
  return fin.fixedItems && fin.fixedItems.length > 0 ? fin.fixedItems : defaultFixedItems(Math.max(0, fin.fixedCosts || 0));
}

export function emptyFinance(): FinancialProfile {
  return {
    monthlyIncome: 0,
    fixedCosts: 0,
    variableCosts: 0,
    monthlySavings: 0,
    currentSavings: 0,
    savingsTarget: 0,
    targetMonth: '',
    annualReturnRate: 0,
    oneOffs: [],
  };
}

export function defaultGoalPlan(priority = 3): GoalPlan {
  return { included: true, deadline: '', weeklyHours: 0, timeSource: 'free', budget: 0, priority };
}

export function emptyScenario(now: string): Scenario {
  return {
    id: CURRENT_SCENARIO_ID,
    name: '現在の計画',
    note: '',
    time: emptyTimeBudget(),
    finance: emptyFinance(),
    goalPlans: {},
    sourceId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultProfile(now: string): UserProfile {
  return { id: 'profile', name: '', onboarded: false, sampleSeededPlan: false, createdAt: now };
}

export function defaultSettings(): AppSettings {
  return { id: 'settings', theme: 'system', motion: 'system', textSize: 'standard', compactMoney: true };
}

/** 人生の領域の初期値 */
export function defaultDomains(): LifeDomain[] {
  const list: [string, string, string][] = [
    ['work', '仕事', 'briefcase'],
    ['money', 'お金', 'coin'],
    ['learning', '学習', 'book'],
    ['health', '健康', 'heart'],
    ['hobby', '趣味', 'spark'],
    ['relations', '人間関係', 'people'],
    ['living', '生活環境', 'home'],
  ];
  return list.map(([id, name, icon], order) => ({ id: `d-${id}`, name, icon, note: '', order }));
}
