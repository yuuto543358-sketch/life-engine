import { useStore } from '../../data/store';
import { TIME_CATEGORY_KEYS, type Scenario, type TimeCategoryKey } from '../../data/types';
import { TIME_LABELS, round } from '../../engine';
import { AnimatedNumber, Disclosure, NumberField, Stepper } from '../../ui/controls';
import { fmtH, fmtHours } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { useScenarioModel } from '../../ui/model';
import { CAT_COLOR, TimeDonut, TimeLegend } from '../../ui/viz';
import type { EditScenario } from '../Simulator';

const HINTS: Partial<Record<TimeCategoryKey, string>> = {
  work: '休憩を含めた拘束時間で入力すると、より現実に近くなります',
  other: '食事・身支度・移動など、ほかの項目に入らない時間',
};

export function TimeTab({ scenario, edit }: { scenario: Scenario; edit: EditScenario }) {
  const { data } = useStore();
  const { feasibility: f } = useScenarioModel(scenario);
  const t = f.time;
  const short = t.shortageHours > 0;
  const remainingFree = Math.max(0, t.freeHours) - f.freeUsedByGoals;

  const setItem = (key: TimeCategoryKey, patch: Partial<{ hoursPerDay: number; daysPerWeek: number }>) =>
    edit((s) => ({ ...s, time: { ...s.time, items: { ...s.time.items, [key]: { ...s.time.items[key], ...patch } } } }));

  return (
    <div className="stack-l">
      <section className="panel panel-hero" aria-label="1週間の時間配分">
        <div>
          <p className="hero-label">1週間 {fmtH(t.totalHours)}時間の使い方</p>
          <p className="hero-sub">
            {short ? (
              <strong className="is-bad">配分が {fmtH(t.shortageHours)}時間 多すぎます</strong>
            ) : (
              <>
                自由時間 {fmtH(t.freeHours)}時間（1日 {fmtH(t.freeHours / 7)}時間）
                {f.freeUsedByGoals > 0 && <> · 目標で {fmtH(f.freeUsedByGoals)}時間 使用 → 残り {fmtH(remainingFree)}時間</>}
              </>
            )}
          </p>
        </div>
        <div className="donut-wrap">
          <TimeDonut items={t.items} totalHours={t.totalHours} goalFreeHours={f.freeUsedByGoals} size={232} />
        </div>
        <p className="fineprint center">グラフの色の部分を押すと、その項目の時間と割合を表示します</p>
        <TimeLegend items={t.items} freeHours={t.freeHours} goalFreeHours={f.freeUsedByGoals} />
        <p className="formula">
          <span className="num">{fmtH(t.totalHours)}</span>h（1週間）− <span className="num">{fmtH(t.allocatedHours)}</span>h（配分済み）=
          <strong className="num"> {fmtH(t.freeHours)}</strong>h
        </p>
        {short && (
          <div className="callout callout-bad" role="alert">
            <Icon name="alert" size={18} />
            <p>
              配分の合計が1週間の総時間を <strong>{fmtHours(t.shortageHours)}</strong> 超えています。どれかの項目を減らすと、この計画は成立します。
            </p>
          </div>
        )}
        {f.timeShortage - t.shortageHours > 0 && (
          <div className="callout callout-warn">
            <Icon name="alert" size={18} />
            <p>
              目標に必要な時間が週 <strong>{fmtHours(f.timeShortage - t.shortageHours)}</strong> 足りません。上の「目標」で内訳を確認できます。
            </p>
          </div>
        )}
      </section>

      <section aria-label="時間配分の項目">
        <p className="section-note">各項目は重ならないように入力します。週間時間 = 1日あたりの時間 × 週の日数。</p>
        <div className="time-list">
          {TIME_CATEGORY_KEYS.map((key) => {
            const item = scenario.time.items[key];
            const weekly = t.items.find((i) => i.key === key)!.weeklyHours;
            const users = f.goals.filter((g) => g.timeSource === key && !g.completed && g.weeklyHours > 0);
            const demand = users.reduce((s, g) => s + g.weeklyHours, 0);
            const name = (id: string) => data.goals.find((g) => g.id === id)?.name ?? '';
            return (
              <article key={key} className="time-item" style={{ '--cat': CAT_COLOR[key] } as React.CSSProperties}>
                <header className="time-item-head">
                  <span className="time-item-name">
                    <span className="swatch" style={{ background: CAT_COLOR[key] }} />
                    {TIME_LABELS[key]}
                  </span>
                  <span className="time-item-total">
                    <AnimatedNumber value={weekly} format={(v) => fmtH(v)} className="num" />
                    <span className="unit">h/週</span>
                  </span>
                </header>
                <NumberField
                  label="1日あたり"
                  value={item.hoursPerDay}
                  onChange={(v) => setItem(key, { hoursPerDay: v })}
                  min={0}
                  max={24}
                  step={0.25}
                  unit="時間"
                  slider={{ min: 0, max: key === 'sleep' || key === 'work' ? 14 : 8, step: 0.25 }}
                  color={CAT_COLOR[key]}
                  compact
                  hint={HINTS[key]}
                />
                <div className="time-item-days">
                  <span className="field-label">週の日数</span>
                  <Stepper label={`${TIME_LABELS[key]}の日数`} value={item.daysPerWeek} min={0} max={7} onChange={(v) => setItem(key, { daysPerWeek: v })} format={(v) => `${v}日`} />
                  <span className="formula-inline num">
                    {fmtH(item.hoursPerDay, 2)}h × {item.daysPerWeek}日 = {fmtH(weekly, 2)}h
                  </span>
                </div>
                {users.length > 0 && (
                  <p className={`time-item-goals ${demand > weekly ? 'is-warn' : ''}`}>
                    <Icon name={demand > weekly ? 'alert' : 'target'} size={14} />
                    この時間を使う目標: {users.map((g) => `${name(g.goalId)} ${fmtH(g.weeklyHours)}h`).join('、')}
                    {demand > weekly && <> — 枠を {fmtH(round(demand - weekly, 2))}h 超えた分は自由時間から使う計算です</>}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <Disclosure summary="1週間の総時間を変える">
        <NumberField
          label="1週間の総時間"
          value={scenario.time.totalHours}
          onChange={(v) => edit((s) => ({ ...s, time: { ...s.time, totalHours: v } }))}
          min={0}
          max={168}
          step={1}
          unit="時間"
          slider={{ min: 100, max: 168, step: 1 }}
          hint="通常は 24時間 × 7日 = 168時間。体調などで使えない時間を除きたい場合に減らします。"
        />
      </Disclosure>
    </div>
  );
}
