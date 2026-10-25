import { useState } from 'react';
import { FIXED_PRESETS, ensureFixedItems } from '../data/defaults';
import { newId } from '../data/store';
import type { FinancialProfile, FixedCostItem } from '../data/types';
import { ConfirmSheet, NumberField, Sheet, TextField } from './controls';
import { fmtYen } from './format';
import { Icon } from './Icon';

const NAME_IDEAS = ['駐車場代', '習い事・月謝', '仕送り', '奨学金の返済', 'ジム・会費', 'ペット', 'NHK受信料'];

/**
 * 固定費を項目ごとに入力する。合計は内訳から自動で計算し、fixedCosts にも同じ値を保存する。
 */
export function FixedCostEditor({ fin, onChange, color, compactMoney }: { fin: FinancialProfile; onChange: (patch: Pick<FinancialProfile, 'fixedItems' | 'fixedCosts'>) => void; color?: string; compactMoney?: boolean }) {
  const items = ensureFixedItems(fin);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const [editing, setEditing] = useState<FixedCostItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirm, setConfirm] = useState<FixedCostItem | null>(null);

  const save = (next: FixedCostItem[]) => onChange({ fixedItems: next, fixedCosts: next.reduce((s, i) => s + i.amount, 0) });
  const setAmount = (id: string, amount: number) => save(items.map((i) => (i.id === id ? { ...i, amount } : i)));

  return (
    <section className="fixed-editor" aria-label="固定費の内訳">
      <div className="fixed-head">
        <div>
          <p className="field-label">固定費（毎月ほぼ同じ支出）</p>
          <p className="fixed-total num">
            {fmtYen(total, false)}
            <span className="unit">円/月 · 合計</span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => {
            setIsNew(true);
            setEditing({ id: newId('fx-'), label: '', amount: 0 });
          }}
        >
          <Icon name="plus" size={16} /> 項目
        </button>
      </div>
      {total > 0 && (
        <div className="fixed-bar" role="img" aria-label={`固定費の内訳: ${items.filter((i) => i.amount > 0).map((i) => `${i.label} ${fmtYen(i.amount)}`).join('、')}`}>
          {items
            .filter((i) => i.amount > 0)
            .map((i, idx) => (
              <span key={i.id} style={{ width: `${(i.amount / total) * 100}%`, opacity: 1 - (idx % 4) * 0.18, background: color ?? 'var(--ink)' }} />
            ))}
        </div>
      )}
      <ul className="fixed-list">
        {items.map((item) => {
          const preset = FIXED_PRESETS.find((p) => p.id === item.id);
          const max = Math.max(preset?.max ?? 100000, Math.ceil(item.amount / 10000) * 10000);
          return (
            <li key={item.id} className="fixed-item">
              <NumberField
                label={
                  <span className="fixed-label">
                    {item.label}
                    {total > 0 && item.amount > 0 && <span className="fixed-share num">{Math.round((item.amount / total) * 100)}%</span>}
                  </span>
                }
                value={item.amount}
                onChange={(v) => setAmount(item.id, v)}
                min={0}
                max={1e10}
                step={500}
                unit="円/月"
                slider={{ min: 0, max, step: max > 100000 ? 1000 : 500 }}
                color={color}
                aside={
                  <button
                    type="button"
                    className="fixed-edit"
                    aria-label={`${item.label}の名前を変更・削除`}
                    onClick={() => {
                      setIsNew(false);
                      setEditing(item);
                    }}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="fineprint">合計 = 各項目の合計。使わない項目は 0 円のままで大丈夫です。</p>

      <ItemSheet
        item={editing}
        isNew={isNew}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          save(isNew ? [...items, it] : items.map((i) => (i.id === it.id ? it : i)));
          setEditing(null);
        }}
        onDelete={(it) => {
          setEditing(null);
          setConfirm(it);
        }}
      />
      <ConfirmSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="固定費の項目を削除"
        danger
        confirmLabel="削除する"
        message={<p>「{confirm?.label}」（{fmtYen(confirm?.amount ?? 0, compactMoney)}/月）を内訳から削除します。合計からも差し引かれます。</p>}
        onConfirm={() => confirm && save(items.filter((i) => i.id !== confirm.id))}
      />
    </section>
  );
}

function ItemSheet({ item, isNew, onClose, onSave, onDelete }: { item: FixedCostItem | null; isNew: boolean; onClose: () => void; onSave: (i: FixedCostItem) => void; onDelete: (i: FixedCostItem) => void }) {
  const [draft, setDraft] = useState<FixedCostItem | null>(item);
  const [last, setLast] = useState(item);
  if (item !== last) {
    setLast(item);
    setDraft(item);
  }
  if (!draft) return null;
  const valid = draft.label.trim() !== '';
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={isNew ? '固定費の項目を追加' : '固定費の項目を編集'}
      footer={
        <div className="btn-row">
          {!isNew && (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => onDelete(draft)}>
              <Icon name="trash" size={18} /> 削除
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...draft, label: draft.label.trim() })}>
            {isNew ? '追加する' : '保存'}
          </button>
        </div>
      }
    >
      <div className="stack-m">
        {isNew && (
          <div className="chips">
            {NAME_IDEAS.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={draft.label === n} onClick={() => setDraft({ ...draft, label: n })}>
                {n}
              </button>
            ))}
          </div>
        )}
        <TextField label="項目名" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} required maxLength={24} placeholder="例: 駐車場代" />
        <NumberField label="金額" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} min={0} max={1e10} step={500} unit="円/月" slider={false} />
      </div>
    </Sheet>
  );
}
