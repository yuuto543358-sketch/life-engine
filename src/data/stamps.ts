import { isMoneyGoal } from '../engine/moneyGoals';
import { CURRENT_SCENARIO_ID, type AppData, type Goal } from './types';

/** 目標が達成済みか（お金の目標は「現在の計画」の目標金額に対して判定する） */
export function isGoalComplete(goal: Goal, d: Pick<AppData, 'scenarios'>): boolean {
  if (isMoneyGoal(goal)) {
    const target = d.scenarios.find((s) => s.id === CURRENT_SCENARIO_ID)?.goalPlans[goal.id]?.budget ?? 0;
    return target > 0 && (goal.savedAmount ?? 0) >= target;
  }
  return goal.progress >= 100;
}

/**
 * 節目の記録: 目標が達成になった日を completedAt に記録する。達成でなくなった場合は取り消す。
 * 目標・シナリオが変わったときだけ確認する（同じ入力なら同じ結果）。
 */
export function stampCompletions(prev: AppData, next: AppData, today: string): AppData {
  if (prev.goals === next.goals && prev.scenarios === next.scenarios) return next;
  let changed = false;
  const goals = next.goals.map((g) => {
    const done = isGoalComplete(g, next);
    if (done && !g.completedAt) {
      changed = true;
      return { ...g, completedAt: today };
    }
    if (!done && g.completedAt) {
      changed = true;
      const rest = { ...g };
      delete rest.completedAt;
      return rest;
    }
    return g;
  });
  return changed ? { ...next, goals } : next;
}
