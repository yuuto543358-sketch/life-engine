import { describe, expect, it } from 'vitest';
import { emptyFinance, emptyScenario, emptyTimeBudget, defaultGoalPlan } from '../data/defaults';
import type { ActualRecord, FinancialProfile, Goal, Scenario } from '../data/types';
import {
  aggregateSeries,
  calculateGoalFeasibility,
  calculateMonthlyBalance,
  calculatePlanDeviation,
  calculateTaskAccuracy,
  calculateWeeklyTimeBudget,
  fixedTotal,
  cloneScenario,
  compareScenarios,
  diffScenarios,
  monthsUntilInclusive,
  periodFor,
  projectSavings,
  startOfWeek,
  summarizeTrend,
  weeklyToPeriod,
  monthlyToPeriod,
} from './index';

const TODAY = '2026-10-25';
const NOW = '2026-10-25T00:00:00.000Z';

function goal(id: string, overrides: Partial<Goal> = {}): Goal {
  return {
    id,
    name: id,
    domainId: null,
    completionCriteria: '',
    progress: 0,
    totalHours: null,
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function finance(overrides: Partial<FinancialProfile> = {}): FinancialProfile {
  return { ...emptyFinance(), ...overrides };
}

describe('単位と日付', () => {
  it('週・月・日の換算が一貫している', () => {
    expect(weeklyToPeriod(7, 'day')).toBe(1);
    expect(weeklyToPeriod(12, 'month')).toBe(52);
    expect(monthlyToPeriod(52, 'week')).toBe(12);
    expect(monthlyToPeriod(365, 'day')).toBe(12);
  });
  it('期限までの月数は今月と期限の月を含む', () => {
    expect(monthsUntilInclusive('2026-10-25', '2026-12')).toBe(3);
    expect(monthsUntilInclusive('2026-10-25', '2026-10')).toBe(1);
    expect(monthsUntilInclusive('2026-10-25', '2026-09')).toBe(0);
  });
  it('週の始まりは月曜日', () => {
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19'); // 日曜 → 前の月曜
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
  });
});

describe('calculateWeeklyTimeBudget', () => {
  it('週間時間 = 1日あたり × 日数 で、自由時間 = 総時間 − 配分済み', () => {
    const r = calculateWeeklyTimeBudget(emptyTimeBudget());
    // 7×7 + 8×5 + 1×5 + 1×7 + 0 + 1×7 + 1×7
    expect(r.allocatedHours).toBe(49 + 40 + 5 + 7 + 0 + 7 + 7);
    expect(r.freeHours).toBe(168 - 115);
    expect(r.shortageHours).toBe(0);
    expect(r.issues).toHaveLength(0);
  });

  it('時間が不足する場合は不足時間を返す', () => {
    const tb = emptyTimeBudget();
    tb.items.work = { hoursPerDay: 14, daysPerWeek: 7 }; // 98h
    tb.items.study = { hoursPerDay: 3, daysPerWeek: 7 }; // 21h
    const r = calculateWeeklyTimeBudget(tb);
    // 49 + 98 + 5 + 7 + 21 + 7 + 7 = 194
    expect(r.allocatedHours).toBe(194);
    expect(r.freeHours).toBe(-26);
    expect(r.shortageHours).toBe(26);
  });

  it('不正な入力を補正して問題として報告する', () => {
    const tb = emptyTimeBudget();
    tb.items.sleep = { hoursPerDay: -3, daysPerWeek: 9 };
    tb.items.hobby = { hoursPerDay: Number.NaN, daysPerWeek: 2.5 };
    tb.totalHours = 500;
    const r = calculateWeeklyTimeBudget(tb);
    expect(r.totalHours).toBe(168);
    expect(r.items.find((i) => i.key === 'sleep')!.weeklyHours).toBe(0);
    expect(r.items.find((i) => i.key === 'hobby')!.weeklyHours).toBe(0);
    expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('同じ入力なら常に同じ結果', () => {
    const tb = emptyTimeBudget();
    expect(calculateWeeklyTimeBudget(tb)).toEqual(calculateWeeklyTimeBudget(structuredClone(tb)));
  });
});

describe('calculateMonthlyBalance', () => {
  it('月間収支 = 収入 − 固定費 − 変動費', () => {
    const r = calculateMonthlyBalance(finance({ monthlyIncome: 300000, fixedCosts: 120000, variableCosts: 80000, monthlySavings: 50000 }), TODAY);
    expect(r.surplus).toBe(100000);
    expect(r.effectiveSavings).toBe(50000);
    expect(r.unallocated).toBe(50000);
    expect(r.annualSurplus).toBe(1200000);
    expect(r.annualSavings).toBe(600000);
    expect(r.savingsRate).toBeCloseTo(16.67, 1);
  });

  it('収支がマイナスの場合は貯金できず、残高が減る扱いになる', () => {
    const r = calculateMonthlyBalance(finance({ monthlyIncome: 200000, fixedCosts: 150000, variableCosts: 80000, monthlySavings: 30000 }), TODAY);
    expect(r.surplus).toBe(-30000);
    expect(r.effectiveSavings).toBe(-30000);
    expect(r.savingsShortfall).toBe(60000);
    expect(r.annualSavings).toBe(-360000);
  });

  it('予定貯金額が収支を超える場合は収支までしか貯金できない', () => {
    const r = calculateMonthlyBalance(finance({ monthlyIncome: 250000, fixedCosts: 100000, variableCosts: 100000, monthlySavings: 80000 }), TODAY);
    expect(r.effectiveSavings).toBe(50000);
    expect(r.savingsShortfall).toBe(30000);
  });

  it('臨時収支は今後12か月分を年間収支に含める（毎年の繰り返しも）', () => {
    const r = calculateMonthlyBalance(
      finance({
        monthlyIncome: 100000,
        oneOffs: [
          { id: 'a', label: 'ボーナス', amount: 200000, type: 'income', month: '2025-12', repeatYearly: true },
          { id: 'b', label: '旅行', amount: 50000, type: 'expense', month: '2027-03', repeatYearly: false },
          { id: 'c', label: '範囲外', amount: 99999, type: 'expense', month: '2027-10', repeatYearly: false },
        ],
      }),
      TODAY,
    );
    expect(r.oneOffNext12).toBe(150000);
    expect(r.annualSurplus).toBe(1200000 + 150000);
  });

  it('負の金額は 0 として扱う', () => {
    const r = calculateMonthlyBalance(finance({ monthlyIncome: -5, fixedCosts: -100 }), TODAY);
    expect(r.income).toBe(0);
    expect(r.fixedCosts).toBe(0);
  });
});

describe('projectSavings', () => {
  it('利回り0%なら毎月の積立だけ増える', () => {
    const p = projectSavings(finance({ monthlyIncome: 300000, fixedCosts: 100000, variableCosts: 100000, monthlySavings: 50000, currentSavings: 100000 }), TODAY, 12);
    expect(p.points).toHaveLength(12);
    expect(p.points[0]).toMatchObject({ ym: '2026-10', balance: 150000 });
    expect(p.points[11].balance).toBe(700000);
  });

  it('目標達成までの月数と、期限に必要な月額を求める', () => {
    const fin = finance({
      monthlyIncome: 300000,
      fixedCosts: 100000,
      variableCosts: 100000,
      monthlySavings: 50000,
      currentSavings: 0,
      savingsTarget: 1000000,
      targetMonth: '2027-09', // 今月を含めて12回
    });
    const p = projectSavings(fin, TODAY);
    expect(p.monthsToTarget).toBe(20);
    expect(p.reachYm).toBe('2028-05');
    expect(p.monthsToDeadline).toBe(12);
    expect(p.reachableByDeadline).toBe(false);
    expect(p.requiredMonthly).toBe(Math.ceil(1000000 / 12));
    // 必要額で計算し直すと期限に届く（UIと計算結果が食い違わない）
    const again = projectSavings({ ...fin, monthlySavings: p.requiredMonthly!, monthlyIncome: 400000 }, TODAY);
    expect(again.reachableByDeadline).toBe(true);
  });

  it('貯金目標を達成できない場合（収支マイナス）は到達しない', () => {
    const p = projectSavings(
      finance({ monthlyIncome: 200000, fixedCosts: 150000, variableCosts: 80000, monthlySavings: 10000, currentSavings: 500000, savingsTarget: 1000000, targetMonth: '2027-10' }),
      TODAY,
    );
    expect(p.monthlyContribution).toBe(-30000);
    expect(p.monthsToTarget).toBeNull();
    expect(p.reachYm).toBeNull();
    expect(p.reachableByDeadline).toBe(false);
    expect(p.points[1].balance).toBe(440000);
  });

  it('期限が過去なら期限切れとして扱い、無理に計算しない', () => {
    const p = projectSavings(finance({ savingsTarget: 100, targetMonth: '2026-01', monthlySavings: 0 }), TODAY);
    expect(p.deadlinePassed).toBe(true);
    expect(p.requiredMonthly).toBeNull();
    expect(p.reachableByDeadline).toBeNull();
  });

  it('利回りがある場合も必要月額で期限に届く', () => {
    const fin = finance({ monthlyIncome: 500000, monthlySavings: 0, currentSavings: 200000, savingsTarget: 3000000, targetMonth: '2031-10', annualReturnRate: 3 });
    const p = projectSavings(fin, TODAY);
    const req = p.requiredMonthly!;
    expect(projectSavings({ ...fin, monthlySavings: req }, TODAY).reachableByDeadline).toBe(true);
    expect(projectSavings({ ...fin, monthlySavings: req - 1 }, TODAY).reachableByDeadline).toBe(false);
  });

  it('すでに目標額以上なら0か月', () => {
    const p = projectSavings(finance({ currentSavings: 2000, savingsTarget: 1000 }), TODAY);
    expect(p.alreadyReached).toBe(true);
    expect(p.monthsToTarget).toBe(0);
  });
});

function scenarioWith(edit: (s: Scenario) => void): Scenario {
  const s = emptyScenario(NOW);
  s.finance = finance({ monthlyIncome: 300000, fixedCosts: 100000, variableCosts: 100000, monthlySavings: 50000 });
  edit(s);
  return s;
}

describe('calculateGoalFeasibility', () => {
  it('枠の中に収まる目標は自由時間を使わない', () => {
    const s = scenarioWith((s) => {
      s.time.items.study = { hoursPerDay: 2, daysPerWeek: 5 }; // 10h
      s.goalPlans.a = { ...defaultGoalPlan(1), weeklyHours: 10, timeSource: 'study' };
    });
    const r = calculateGoalFeasibility(s, [goal('a')], [], TODAY);
    expect(r.goals[0]).toMatchObject({ fromCategory: 10, fromFree: 0, timeShort: 0, fits: true });
    expect(r.freeUsedByGoals).toBe(0);
  });

  it('枠を超えた分だけ自由時間から使い、二重に数えない', () => {
    const s = scenarioWith((s) => {
      s.time.items.study = { hoursPerDay: 1, daysPerWeek: 5 }; // 5h
      s.goalPlans.a = { ...defaultGoalPlan(1), weeklyHours: 8, timeSource: 'study' };
      s.goalPlans.b = { ...defaultGoalPlan(2), weeklyHours: 4, timeSource: 'study' };
    });
    const r = calculateGoalFeasibility(s, [goal('a'), goal('b')], [], TODAY);
    // 勉強枠5h: a が5h使い、a の残り3h と b の4h は自由時間から
    expect(r.goals[0]).toMatchObject({ fromCategory: 5, fromFree: 3 });
    expect(r.goals[1]).toMatchObject({ fromCategory: 0, fromFree: 4 });
    expect(r.freeUsedByGoals).toBe(7);
    expect(r.freeAfterGoals).toBe(r.time.freeHours - 7);
  });

  it('時間不足では不足量と関連する目標を、ユーザーの優先順位の順に示す', () => {
    const s = scenarioWith((s) => {
      s.time.items.work = { hoursPerDay: 12, daysPerWeek: 6 }; // 72h → 自由時間 = 168 − 147 = 21h
      s.goalPlans.low = { ...defaultGoalPlan(3), weeklyHours: 15 };
      s.goalPlans.high = { ...defaultGoalPlan(1), weeklyHours: 15 };
    });
    const r = calculateGoalFeasibility(s, [goal('low'), goal('high')], [], TODAY);
    expect(r.time.freeHours).toBe(21);
    expect(r.goals.map((g) => g.goalId)).toEqual(['high', 'low']);
    expect(r.goals[0].timeShort).toBe(0);
    expect(r.goals[1].timeShort).toBe(9);
    expect(r.timeShortage).toBe(9);
    const c = r.conflicts.find((c) => c.kind === 'time');
    expect(c?.goalIds).toEqual(['low']);
    expect(r.fitCount).toBe(1);
  });

  it('予算は貯金後の残りから期限までの月数で割って確保する', () => {
    const s = scenarioWith((s) => {
      // 収支 100,000 − 貯金 50,000 = 50,000 が目標に使える
      s.goalPlans.trip = { ...defaultGoalPlan(1), budget: 300000, deadline: '2027-03-31' }; // 6か月 → 50,000/月
      s.goalPlans.pc = { ...defaultGoalPlan(2), budget: 120000, deadline: '2026-12-31' }; // 3か月 → 40,000/月
    });
    const r = calculateGoalFeasibility(s, [goal('trip'), goal('pc')], [], TODAY);
    expect(r.goals[0]).toMatchObject({ monthsLeft: 6, monthlyNeed: 50000, monthlyShort: 0 });
    expect(r.goals[1]).toMatchObject({ monthlyNeed: 40000, monthlyShort: 40000, fits: false });
    expect(r.budgetShortageMonthly).toBe(40000);
    expect(r.conflicts.find((c) => c.kind === 'budget')?.goalIds).toEqual(['pc']);
  });

  it('実績の支出は残りの予算から差し引く', () => {
    const s = scenarioWith((s) => {
      s.goalPlans.a = { ...defaultGoalPlan(1), budget: 30000, deadline: '2026-12-31' };
    });
    const actuals: ActualRecord[] = [
      { id: 'x', type: 'expense', date: TODAY, expenseCategory: 'goal', amount: 12000, goalId: 'a', memo: '', createdAt: NOW },
    ];
    const r = calculateGoalFeasibility(s, [goal('a')], actuals, TODAY);
    expect(r.goals[0]).toMatchObject({ spent: 12000, remainingBudget: 18000, monthlyNeed: 6000 });
  });

  it('予算があるのに期限がない目標は月額を計算できないと示す', () => {
    const s = scenarioWith((s) => {
      s.goalPlans.a = { ...defaultGoalPlan(1), budget: 10000, deadline: '' };
    });
    const r = calculateGoalFeasibility(s, [goal('a')], [], TODAY);
    expect(r.goals[0].budgetUncomputable).toBe(true);
    expect(r.goals[0].fits).toBe(false);
  });

  it('総時間から完了見込み日を出し、期限と比べる', () => {
    const s = scenarioWith((s) => {
      s.goalPlans.a = { ...defaultGoalPlan(1), weeklyHours: 5, deadline: '2026-11-30' };
    });
    // 残り 100h × (1 − 0.5) = 50h → 週5h で 10週 = 70日後
    const r = calculateGoalFeasibility(s, [goal('a', { totalHours: 100, progress: 50 })], [], TODAY);
    expect(r.goals[0].remainingHours).toBe(50);
    expect(r.goals[0].estimatedFinish).toBe('2027-01-03');
    expect(r.goals[0].deadlineStatus).toBe('late');
    expect(r.goals[0].daysLate).toBe(34);
  });

  it('完了済み・計画に含めない目標は時間と予算を使わない', () => {
    const s = scenarioWith((s) => {
      s.goalPlans.done = { ...defaultGoalPlan(1), weeklyHours: 100, budget: 1e9, deadline: '2026-12-31' };
      s.goalPlans.off = { ...defaultGoalPlan(1), weeklyHours: 100, included: false };
    });
    const r = calculateGoalFeasibility(s, [goal('done', { progress: 100 }), goal('off')], [], TODAY);
    expect(r.goals).toHaveLength(1);
    expect(r.timeDemand).toBe(0);
    expect(r.budgetDemandMonthly).toBe(0);
    expect(r.conflicts).toHaveLength(0);
  });
});

describe('シナリオ', () => {
  it('複製したシナリオは元のシナリオと参照を共有しない', () => {
    const src = scenarioWith((s) => {
      s.goalPlans.a = { ...defaultGoalPlan(1), weeklyHours: 5 };
      s.finance.oneOffs = [{ id: 'o1', label: 'x', amount: 1, type: 'income', month: '2026-12', repeatYearly: false }];
    });
    const before = structuredClone(src);
    const copy = cloneScenario(src, { id: 'copy', name: '勉強優先', now: NOW });
    copy.time.items.study.hoursPerDay = 5;
    copy.finance.monthlyIncome = 1;
    copy.goalPlans.a.weeklyHours = 20;
    copy.finance.oneOffs[0].amount = 999;
    expect(src).toEqual(before);
    expect(copy.sourceId).toBe(src.id);
    expect(copy.id).toBe('copy');
    expect(copy.finance.oneOffs[0].id).not.toBe('o1');
  });

  it('元の計画から変更した項目を列挙する', () => {
    const base = scenarioWith((s) => {
      s.goalPlans.a = { ...defaultGoalPlan(1), weeklyHours: 5 };
    });
    const alt = cloneScenario(base, { id: 'alt', name: 'alt', now: NOW });
    expect(diffScenarios(base, alt, [goal('a')])).toHaveLength(0);
    alt.time.items.study.hoursPerDay = 2;
    alt.finance.monthlySavings = 70000;
    alt.goalPlans.a.weeklyHours = 10;
    const changes = diffScenarios(base, alt, [goal('a')]);
    expect(changes.map((c) => c.label)).toEqual(['勉強（1日）', '毎月の貯金額', 'a・週間時間']);
  });

  it('シナリオを比較すると、それぞれ独立して計算される', () => {
    const base = scenarioWith((s) => {
      s.finance.savingsTarget = 600000;
    });
    const alt = cloneScenario(base, { id: 'alt', name: '貯金優先', now: NOW });
    alt.finance.monthlySavings = 100000;
    const rows = compareScenarios([base, alt], base, [], [], TODAY);
    expect(rows[0].annualSavings).toBe(600000);
    expect(rows[1].annualSavings).toBe(1200000);
    expect(rows[0].monthsToTarget).toBe(12);
    expect(rows[1].monthsToTarget).toBe(6);
    expect(rows[0].changes).toHaveLength(0);
    expect(rows[1].changes).toHaveLength(1);
  });
});

describe('計画と実績の差', () => {
  const s = scenarioWith((s) => {
    s.time.items.study = { hoursPerDay: 2, daysPerWeek: 7 }; // 14h/週 → 2h/日
    s.finance.variableCosts = 52000; // 52,000円/月 → 12,000円/週
  });
  const records: ActualRecord[] = [
    { id: '1', type: 'time', date: '2026-10-19', category: 'study', hours: 3, goalId: null, memo: '', createdAt: NOW },
    { id: '2', type: 'time', date: '2026-10-21', category: 'study', hours: 1.5, goalId: null, memo: '', createdAt: NOW },
    { id: '3', type: 'time', date: '2026-10-12', category: 'study', hours: 9, goalId: null, memo: '', createdAt: NOW },
    { id: '4', type: 'expense', date: '2026-10-20', expenseCategory: 'variable', amount: 15000, goalId: null, memo: '', createdAt: NOW },
    { id: '5', type: 'task', date: '2026-10-22', title: 't', estimateHours: 2, actualHours: 3, goalId: null, memo: '', createdAt: NOW },
  ];

  it('週単位で計画と実績を比べ、記録がない項目は判断しない', () => {
    const d = calculatePlanDeviation(records, s, [], periodFor('week', TODAY));
    const study = d.time.find((r) => r.key === 'study')!;
    expect(study).toMatchObject({ planned: 14, actual: 4.5, diff: -9.5, recorded: true });
    expect(d.time.find((r) => r.key === 'work')!.recorded).toBe(false);
    const variable = d.money.find((r) => r.key === 'variable')!;
    expect(variable).toMatchObject({ planned: 12000, actual: 15000, diff: 3000 });
    expect(d.tasks).toMatchObject({ count: 1, estimate: 2, actual: 3, ratio: 1.5, sufficient: false });
  });

  it('日・月単位でも集計できる', () => {
    expect(calculatePlanDeviation(records, s, [], periodFor('day', '2026-10-19')).time.find((r) => r.key === 'study')).toMatchObject({ planned: 2, actual: 3 });
    const m = calculatePlanDeviation(records, s, [], periodFor('month', TODAY));
    expect(m.period).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(m.time.find((r) => r.key === 'study')!.actual).toBe(13.5);
    expect(m.money.find((r) => r.key === 'variable')!.planned).toBe(52000);
  });

  it('見積もり精度は単純な合計・平均で求める', () => {
    const tasks = [
      { e: 2, a: 2 },
      { e: 4, a: 5 },
      { e: 1, a: 2 },
    ].map((x, i) => ({ id: `${i}`, type: 'task' as const, date: TODAY, title: '', estimateHours: x.e, actualHours: x.a, goalId: null, memo: '', createdAt: NOW }));
    const acc = calculateTaskAccuracy(tasks);
    expect(acc.ratio).toBeCloseTo(9 / 7);
    expect(acc.meanAbsPctError).toBeCloseTo(((0 + 0.25 + 1) / 3) * 100);
    expect(acc.withinTolerancePct).toBeCloseTo(100 / 3);
    expect(acc.sufficient).toBe(false);
  });

  it('データが少ない場合は傾向を示さない', () => {
    const series = aggregateSeries(records, 'week', TODAY, 8, { kind: 'time', category: 'study' });
    expect(series).toHaveLength(8);
    expect(series[7].value).toBe(4.5);
    expect(series[6].value).toBe(9);
    const t = summarizeTrend(series);
    expect(t.sufficient).toBe(false);
    expect(t.periodsWithData).toBe(2);
    expect(t.changePct).toBeNull();
  });
});

describe('傾向の要約', () => {
  const pt = (value: number, count: number) => ({ period: periodFor('week', TODAY), value, count });
  it('前半・後半それぞれに十分な記録があるときだけ、記録のある期間の平均を比べる', () => {
    const t = summarizeTrend([pt(4, 1), pt(0, 0), pt(6, 2), pt(0, 0), pt(8, 1), pt(10, 3), pt(0, 0), pt(12, 1)]);
    expect(t.sufficient).toBe(true);
    expect(t.earlierAverage).toBe(5); // 記録のない週は 0 として扱わない
    expect(t.recentAverage).toBe(10);
    expect(t.changePct).toBe(100);
  });
  it('片方に記録が少なければ傾向を示さない', () => {
    const t = summarizeTrend([pt(0, 0), pt(0, 0), pt(0, 0), pt(6, 1), pt(8, 1), pt(10, 1), pt(9, 1), pt(12, 1)]);
    expect(t.sufficient).toBe(false);
    expect(t.changePct).toBeNull();
  });
});

describe('固定費の内訳', () => {
  it('内訳があれば内訳の合計を固定費として計算する', () => {
    const fin = finance({
      monthlyIncome: 300000,
      fixedCosts: 999999, // 内訳がある場合は使わない
      fixedItems: [
        { id: 'a', label: '家賃', amount: 70000 },
        { id: 'b', label: '通信費', amount: 8000 },
        { id: 'c', label: '保険', amount: -500 }, // 負数は 0 として扱う
      ],
    });
    expect(fixedTotal(fin)).toBe(78000);
    expect(calculateMonthlyBalance(fin, TODAY)).toMatchObject({ fixedCosts: 78000, surplus: 222000 });
  });

  it('内訳がない古いデータは合計額をそのまま使う', () => {
    expect(fixedTotal(finance({ fixedCosts: 50000 }))).toBe(50000);
    expect(fixedTotal(finance({ fixedCosts: 50000, fixedItems: [] }))).toBe(50000);
  });

  it('シナリオの比較で、固定費の項目ごとの変更を示す', () => {
    const base = scenarioWith((s) => {
      s.finance.fixedItems = [
        { id: 'rent', label: '家賃', amount: 70000 },
        { id: 'phone', label: '通信費', amount: 8000 },
      ];
    });
    const alt = cloneScenario(base, { id: 'alt', name: '引っ越し', now: NOW });
    alt.finance.fixedItems![0].amount = 55000;
    alt.finance.fixedItems!.push({ id: 'park', label: '駐車場代', amount: 10000 });
    expect(base.finance.fixedItems![0].amount).toBe(70000); // 複製元は変わらない
    const labels = diffScenarios(base, alt, []).map((c) => c.label);
    expect(labels).toEqual(['固定費（合計）', '固定費・家賃', '固定費・駐車場代']);
  });

  it('計画と実績の差では、内訳の合計を固定費の計画値にする', () => {
    const s = scenarioWith((s) => {
      s.finance.fixedItems = [{ id: 'rent', label: '家賃', amount: 60000 }];
    });
    const rec: ActualRecord[] = [{ id: 'x', type: 'expense', date: TODAY, expenseCategory: 'fixed', amount: 60000, goalId: null, memo: '', createdAt: NOW }];
    expect(calculatePlanDeviation(rec, s, [], periodFor('month', TODAY)).money.find((r) => r.key === 'fixed')).toMatchObject({ planned: 60000, actual: 60000, diff: 0 });
  });
});
