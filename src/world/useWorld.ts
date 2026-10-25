import { useMemo } from 'react';
import { useStore } from '../data/store';
import { computeWorld, type WorldInput } from '../engine/world';

/** ストアのデータから世界の状態を計算する（asOf を省略すると今日） */
export function useWorld(asOf?: string) {
  const { data, today, current } = useStore();
  const input: WorldInput = useMemo(
    () => ({ goals: data.goals, domains: data.domains, actuals: data.actuals, dependencies: data.dependencies, chronicle: data.chronicle, current }),
    [data.goals, data.domains, data.actuals, data.dependencies, data.chronicle, current],
  );
  const state = useMemo(() => computeWorld(input, asOf ?? today), [input, asOf, today]);
  return { state, input };
}
