import { useMemo } from 'react';
import { useStore } from '../data/store';
import type { Scenario } from '../data/types';
import { calculateGoalFeasibility, projectSavings, resolveFinance } from '../engine';

/** シナリオの計算結果をまとめて求める（同じ入力ならメモ化した結果を使う） */
export function useScenarioModel(scenario: Scenario, months = 60) {
  const { data, today } = useStore();
  const feasibility = useMemo(
    () => calculateGoalFeasibility(scenario, data.goals, data.actuals, today),
    [scenario, data.goals, data.actuals, today],
  );
  /** 貯金の目標を自動で決める設定なら、お金の目標から目標額・期限を入れたお金の計画 */
  const finance = useMemo(() => resolveFinance(scenario, data.goals, today), [scenario, data.goals, today]);
  const projection = useMemo(() => projectSavings(finance, today, months), [finance, today, months]);
  return { feasibility, projection, finance };
}
