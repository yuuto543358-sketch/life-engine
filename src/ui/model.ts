import { useMemo } from 'react';
import { useStore } from '../data/store';
import type { Scenario } from '../data/types';
import { calculateGoalFeasibility, projectSavings } from '../engine';

/** シナリオの計算結果をまとめて求める（同じ入力ならメモ化した結果を使う） */
export function useScenarioModel(scenario: Scenario, months = 60) {
  const { data, today } = useStore();
  const feasibility = useMemo(
    () => calculateGoalFeasibility(scenario, data.goals, data.actuals, today),
    [scenario, data.goals, data.actuals, today],
  );
  const projection = useMemo(() => projectSavings(scenario.finance, today, months), [scenario.finance, today, months]);
  return { feasibility, projection };
}
