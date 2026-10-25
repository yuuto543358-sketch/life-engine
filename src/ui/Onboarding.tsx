import { useState } from 'react';
import { patchScenario, useStore } from '../data/store';
import { emptyFinance, emptyTimeBudget } from '../data/defaults';
import type { FinancialProfile, TimeBudget } from '../data/types';
import { calculateMonthlyBalance, calculateWeeklyTimeBudget } from '../engine';
import { NumberField, Sheet, TextField } from './controls';
import { fmtH, fmtYen } from './format';
import { Icon } from './Icon';
import { CAT_COLOR } from './viz';
import { FixedCostEditor } from './FixedCostEditor';

/** はじめての設定。3ステップで「現在の計画」の時間とお金を入力する */
export function OnboardingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { update, data, current, today } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name);
  const [time, setTime] = useState<TimeBudget>(() => (data.profile.onboarded ? current.time : emptyTimeBudget()));
  const [fin, setFin] = useState<FinancialProfile>(() => (data.profile.onboarded ? current.finance : emptyFinance()));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(0);
      setName(data.profile.name);
      setTime(data.profile.onboarded ? current.time : emptyTimeBudget());
      setFin(data.profile.onboarded ? current.finance : emptyFinance());
    }
  }
  const t = calculateWeeklyTimeBudget(time);
  const m = calculateMonthlyBalance(fin, today);
  const setItem = (k: keyof TimeBudget['items'], hoursPerDay: number) => setTime({ ...time, items: { ...time.items, [k]: { ...time.items[k], hoursPerDay } } });

  const finish = () => {
    update(
      (d) => ({
        ...patchScenario(d, 'current', (s) => ({ ...s, time, finance: fin })),
        profile: { ...d.profile, name: name.trim(), onboarded: true },
      }),
      { success: '初期設定を保存しました' },
    );
    onClose();
    setStep(0);
  };

  const steps = ['あなたについて', '1週間の時間', '毎月のお金'];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <>
          <span className="step-count num">
            {step + 1}/{steps.length}
          </span>
          {steps[step]}
        </>
      }
      footer={
        <div className="btn-row">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              戻る
            </button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              次へ <Icon name="arrow" size={18} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish}>
              <Icon name="check" size={18} /> 保存してはじめる
            </button>
          )}
        </div>
      }
    >
      {step === 0 && (
        <div className="stack-m">
          <p className="sheet-lead">
            LIFE ENGINE は、あなたの時間・お金・目標をひとつの計画として扱い、「この選択をしたらどうなるか」を計算します。データはこの端末の中だけに保存されます。
          </p>
          <TextField label="呼び名（任意）" value={name} onChange={setName} placeholder="例: ゆうと" maxLength={20} />
          <p className="fineprint">あとから「設定」でいつでも変更できます。わからない項目はおおよその値で大丈夫です。</p>
        </div>
      )}
      {step === 1 && (
        <div className="stack-m">
          <p className="sheet-lead">ふだんの1日あたりの時間を入れてください。日数などの細かい調整はシミュレーターでできます。</p>
          {(['sleep', 'work', 'commute', 'housework'] as const).map((k) => (
            <NumberField
              key={k}
              label={{ sleep: '睡眠', work: '仕事（1日・勤務日）', commute: '通勤（往復・勤務日）', housework: '家事' }[k]}
              value={time.items[k].hoursPerDay}
              onChange={(v) => setItem(k, v)}
              min={0}
              max={24}
              step={0.25}
              unit="時間/日"
              slider={{ min: 0, max: k === 'sleep' || k === 'work' ? 14 : 6, step: 0.25 }}
              color={CAT_COLOR[k]}
              compact
            />
          ))}
          <div className={`callout ${t.shortageHours > 0 ? 'callout-bad' : 'callout-good'}`}>
            <Icon name={t.shortageHours > 0 ? 'alert' : 'clock'} size={18} />
            <p>{t.shortageHours > 0 ? `${fmtH(t.shortageHours)}時間/週 不足しています` : `いまの入力では、自由に使える時間は週 ${fmtH(t.freeHours)}時間です`}</p>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack-m">
          <p className="sheet-lead">手取りの月収と、毎月のおおよその支出を入れてください。</p>
          <NumberField label="月の手取り収入" value={fin.monthlyIncome} onChange={(v) => setFin({ ...fin, monthlyIncome: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 1000000, step: 5000 }} />
          <FixedCostEditor fin={fin} onChange={(p) => setFin({ ...fin, ...p })} />
          <NumberField label="変動費（食費・日用品など）" value={fin.variableCosts} onChange={(v) => setFin({ ...fin, variableCosts: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 500000, step: 1000 }} />
          <NumberField label="毎月の貯金額" value={fin.monthlySavings} onChange={(v) => setFin({ ...fin, monthlySavings: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 300000, step: 1000 }} />
          <NumberField label="現在の貯金額" value={fin.currentSavings} onChange={(v) => setFin({ ...fin, currentSavings: v })} min={0} max={1e11} step={10000} unit="円" slider={false} />
          <div className={`callout ${m.surplus < 0 || m.savingsShortfall > 0 ? 'callout-bad' : 'callout-good'}`}>
            <Icon name={m.surplus < 0 || m.savingsShortfall > 0 ? 'alert' : 'yen'} size={18} />
            <p>
              月間収支は {fmtYen(m.surplus, false, true)}
              {m.savingsShortfall > 0 ? `。貯金額が収支を ${fmtYen(m.savingsShortfall)} 超えています` : ''}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
