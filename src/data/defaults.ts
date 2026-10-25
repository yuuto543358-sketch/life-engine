import {
  CURRENT_SCENARIO_ID,
  type AppSettings,
  type FinancialProfile,
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
