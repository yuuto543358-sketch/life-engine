import { useCallback, useState } from 'react';
import { patchScenario, useStore } from '../data/store';
import { CURRENT_SCENARIO_ID, type Scenario } from '../data/types';
import { AnimatedNumber, Segmented, Sheet } from '../ui/controls';
import { fmtH, fmtYen } from '../ui/format';
import { Icon } from '../ui/Icon';
import { useScenarioModel } from '../ui/model';
import { navigate, type Route } from '../ui/router';
import { ScreenHead } from '../ui/ScreenHead';
import { NewScenarioSheet } from '../ui/ScenarioSheets';
import { TimeTab } from './sim/TimeTab';
import { MoneyTab } from './sim/MoneyTab';
import { GoalsTab } from './sim/GoalsTab';
import { CompareTab } from './sim/CompareTab';

type SimTab = 'time' | 'money' | 'goals' | 'compare';
const SIM_TABS: { value: SimTab; label: string }[] = [
  { value: 'time', label: '時間' },
  { value: 'money', label: '蓄え・お金' },
  { value: 'goals', label: '開拓計画' },
  { value: 'compare', label: '比較' },
];

export type EditScenario = (fn: (s: Scenario) => Scenario) => void;

export function SimulatorScreen({ route }: { route: Route }) {
  const { data, update } = useStore();
  const sub = (SIM_TABS.some((t) => t.value === route.sub) ? route.sub : 'time') as SimTab;
  const requested = route.params.get('s') ?? CURRENT_SCENARIO_ID;
  const scenario = data.scenarios.find((s) => s.id === requested) ?? data.scenarios.find((s) => s.id === CURRENT_SCENARIO_ID)!;
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  const edit = useCallback<EditScenario>(
    (fn) => update((d) => patchScenario(d, scenario.id, fn), { debounce: true }),
    [update, scenario.id],
  );
  const go = (tab: SimTab, sid = scenario.id) => navigate('sim', tab, sid === CURRENT_SCENARIO_ID ? {} : { s: sid });

  return (
    <>
      <ScreenHead place="sim" eyebrow="開拓の間 · 計画とシミュレーション" title="これからの道筋を試す">
        <button type="button" className="scenario-switch" onClick={() => setPicker(true)} aria-haspopup="dialog">
          <span className="scenario-switch-label">編集中のシナリオ</span>
          <span className="scenario-switch-name">
            {scenario.name}
            <Icon name="chevron-down" size={18} />
          </span>
        </button>
      </ScreenHead>

      <EngineBar scenario={scenario} onJump={(t) => go(t)} />

      <div className="sim-tabs">
        <Segmented label="シミュレーターの項目" options={SIM_TABS} value={sub} onChange={(t) => go(t)} />
      </div>

      <div className="sim-body" key={scenario.id}>
        {sub === 'time' && <TimeTab scenario={scenario} edit={edit} />}
        {sub === 'money' && <MoneyTab scenario={scenario} edit={edit} />}
        {sub === 'goals' && <GoalsTab scenario={scenario} edit={edit} />}
        {sub === 'compare' && <CompareTab activeId={scenario.id} onOpen={(id) => go('time', id)} />}
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="シナリオを選ぶ">
        <p className="sheet-lead">選んだシナリオの時間・お金・目標を編集します。シナリオはそれぞれ独立して保存されます。</p>
        <ul className="pick-list">
          {data.scenarios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="pick-item"
                aria-current={s.id === scenario.id ? 'true' : undefined}
                onClick={() => {
                  setPicker(false);
                  go(sub === 'compare' ? 'time' : sub, s.id);
                }}
              >
                <span>
                  <span className="pick-name">{s.name}</span>
                  {s.note && <span className="pick-note">{s.note}</span>}
                </span>
                {s.id === scenario.id && <Icon name="check" size={18} />}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            setPicker(false);
            setCreating(true);
          }}
        >
          <Icon name="copy" size={18} /> 「{scenario.name}」を複製して新しいシナリオを作る
        </button>
      </Sheet>
      <NewScenarioSheet open={creating} onClose={() => setCreating(false)} sourceId={scenario.id} onCreated={(id) => go(sub === 'compare' ? 'time' : sub, id)} />
    </>
  );
}

/** 時間・お金・目標の現在値を常に表示するバー。値を動かすとここも即座に変わる */
function EngineBar({ scenario, onJump }: { scenario: Scenario; onJump: (t: SimTab) => void }) {
  const { data } = useStore();
  const compact = data.settings.compactMoney;
  const { feasibility: f } = useScenarioModel(scenario);
  const free = f.time.freeHours - f.freeUsedByGoals;
  const timeShort = f.timeShortage;
  const left = f.money.unallocated - f.budgetDemandMonthly;
  const goalsOk = f.activeCount === 0 || f.fitCount === f.activeCount;
  return (
    <div className="engine-bar" role="region" aria-label="計算結果の要約">
      <button type="button" className={`engine-cell ${timeShort > 0 ? 'is-bad' : ''}`} onClick={() => onJump('time')}>
        <span className="engine-label">
          <Icon name={timeShort > 0 ? 'alert' : 'clock'} size={14} /> {timeShort > 0 ? '時間の不足' : '残る自由時間'}
        </span>
        <span className="engine-value">
          <AnimatedNumber value={timeShort > 0 ? timeShort : free} format={(v) => fmtH(v)} className="num" />
          <span className="unit">h/週</span>
        </span>
      </button>
      <button type="button" className={`engine-cell ${left < 0 ? 'is-bad' : ''}`} onClick={() => onJump('money')}>
        <span className="engine-label">
          <Icon name={left < 0 ? 'alert' : 'yen'} size={14} /> {left < 0 ? 'お金の不足' : '月の残り'}
        </span>
        <span className="engine-value">
          <AnimatedNumber value={Math.abs(left)} format={(v) => fmtYen(v, compact).replace(/円$/, '')} className="num" />
          <span className="unit">円/月</span>
        </span>
      </button>
      <button type="button" className={`engine-cell ${goalsOk ? '' : 'is-bad'}`} onClick={() => onJump('goals')}>
        <span className="engine-label">
          <Icon name={goalsOk ? 'flag' : 'alert'} size={14} /> 計画の両立
        </span>
        <span className="engine-value">
          <span className="num">{f.fitCount}</span>
          <span className="unit">/ {f.activeCount}件</span>
        </span>
      </button>
    </div>
  );
}
