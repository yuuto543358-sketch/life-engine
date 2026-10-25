import { useEffect, useRef, useState } from 'react';
import { nowIso, useStore } from '../data/store';
import type { ChronicleEntry, QuietKind } from '../data/types';
import { addDays } from '../engine';
import { NumberField, TextField } from '../ui/controls';
import { fmtDate, fmtShortDate, weekdayOf } from '../ui/format';
import { Icon } from '../ui/Icon';
import { newChronicle } from '../ui/ChronicleEditor';
import { WorldScene } from '../world/WorldScene';
import { useWorld } from '../world/useWorld';

const MODES: { key: QuietKind; label: string; icon: string; lead: string }[] = [
  { key: 'free', label: '自由に書く', icon: 'feather', lead: '頭の中にあることを、そのまま置いていく場所です。' },
  { key: 'reflection', label: '今日をふりかえる', icon: 'leaf', lead: '答えなくてもかまいません。書きたいところだけ。' },
  { key: 'tomorrow', label: '明日の準備', icon: 'lantern', lead: '明日の小さな一歩を3つまで。世界の中心に「昨日の自分から」として届きます。' },
  { key: 'nothing', label: '何もしない時間', icon: 'moon', lead: '何もしなかった時間も、立派な時間です。水辺に蛍が増えます。' },
];

const PROMPTS = ['今日、少しよかったこと', '気づいたこと', '手放したいこと'];

/** 静寂の地: 休息と頭の整理のための場所。目標や生産性はここでは求めない */
export function QuietScreen() {
  const { data, today, update } = useStore();
  const { state } = useWorld();
  const [mode, setMode] = useState<QuietKind | null>(null);
  const past = data.chronicle.filter((c) => c.kind === 'quiet').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const save = (e: ChronicleEntry) => {
    update((d) => ({ ...d, chronicle: [...d.chronicle, e] }), { success: 'そっと残しました' });
    setMode(null);
  };

  return (
    <div className="quiet">
      <section className="quiet-hero" aria-hidden="true">
        <WorldScene state={state} phase="night" quiet />
      </section>
      <div className="quiet-body">
        <p className="eyebrow">静寂の地</p>
        <h1 className="title">ここでは、何も急がなくていい。</h1>
        {mode === null ? (
          <div className="quiet-modes">
            {MODES.map((m) => (
              <button key={m.key} type="button" className="quiet-mode" onClick={() => setMode(m.key)}>
                <Icon name={m.icon} size={22} />
                <span className="quiet-mode-label">{m.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <QuietForm mode={mode} today={today} onCancel={() => setMode(null)} onSave={save} />
        )}

        {past.length > 0 && (
          <details className="quiet-past">
            <summary>
              これまでの静かな記録（{past.length}件）
              <Icon name="chevron-down" size={16} className="disclosure-icon" />
            </summary>
            <ul>
              {past.slice(0, 30).map((c) => (
                <li key={c.id} className="quiet-item">
                  <span className="quiet-item-date num">
                    {fmtShortDate(c.date)}（{weekdayOf(c.date)}）
                  </span>
                  <span className="quiet-item-text">{summary(c)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="この記録を削除"
                    onClick={() => update((d) => ({ ...d, chronicle: d.chronicle.filter((x) => x.id !== c.id) }), { undo: '記録を削除しました' })}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="fineprint quiet-note">ここでの記録は年代記の館にも残ります。書かなくても、何も変わりません。</p>
      </div>
    </div>
  );
}

function summary(c: ChronicleEntry): string {
  if (c.quietKind === 'nothing') return `何もしない時間 ${c.minutes ?? 0}分`;
  if (c.quietKind === 'tomorrow') return `明日の準備: ${(c.steps ?? []).filter(Boolean).join('・') || '（なし）'}`;
  return c.body.split('\n')[0].slice(0, 60) || '（ことばにならない日）';
}

function QuietForm({ mode, today, onCancel, onSave }: { mode: QuietKind; today: string; onCancel: () => void; onSave: (e: ChronicleEntry) => void }) {
  const m = MODES.find((x) => x.key === mode)!;
  const [body, setBody] = useState('');
  const [answers, setAnswers] = useState(['', '', '']);
  const [steps, setSteps] = useState(['', '', '']);
  const [minutes, setMinutes] = useState(20);
  const [running, setRunning] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef(0);
  useEffect(() => {
    if (running === null) return;
    tick.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - running) / 1000)), 1000);
    return () => window.clearInterval(tick.current);
  }, [running]);

  const base = (extra: Partial<ChronicleEntry>) => ({ ...newChronicle('quiet', today, { quietKind: mode }), ...extra, updatedAt: nowIso() });
  let canSave = false;
  let entry: ChronicleEntry | null = null;
  if (mode === 'free') {
    canSave = body.trim() !== '';
    entry = base({ body });
  } else if (mode === 'reflection') {
    const text = answers.map((a, i) => (a.trim() ? `${PROMPTS[i]}: ${a.trim()}` : '')).filter(Boolean).join('\n');
    canSave = text !== '';
    entry = base({ body: text });
  } else if (mode === 'tomorrow') {
    const s = steps.map((x) => x.trim()).filter(Boolean);
    canSave = s.length > 0;
    entry = base({ steps: s, body: '', title: `${fmtDate(addDays(today, 1), false)}の準備` });
  } else {
    const mins = running !== null ? Math.max(1, Math.round(elapsed / 60)) : minutes;
    canSave = mins > 0;
    entry = base({ minutes: mins });
  }

  return (
    <div className="quiet-form">
      <p className="quiet-form-title">
        <Icon name={m.icon} size={18} /> {m.label}
      </p>
      <p className="sheet-lead">{m.lead}</p>
      {mode === 'free' && <TextField label="ここに置いていく" value={body} onChange={setBody} multiline maxLength={4000} />}
      {mode === 'reflection' && PROMPTS.map((p, i) => <TextField key={p} label={p} value={answers[i]} onChange={(v) => setAnswers(answers.map((a, j) => (j === i ? v : a)))} maxLength={300} />)}
      {mode === 'tomorrow' && steps.map((s, i) => <TextField key={i} label={`小さな一歩 ${i + 1}`} value={s} onChange={(v) => setSteps(steps.map((x, j) => (j === i ? v : x)))} maxLength={60} placeholder={i === 0 ? '例: 朝、窓を開ける' : ''} />)}
      {mode === 'nothing' && (
        <div className="stack-m">
          <div className="quiet-timer">
            <span className="quiet-timer-value num">
              {running !== null ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : `${minutes}分`}
            </span>
            {running === null ? (
              <button type="button" className="btn btn-ghost" onClick={() => { setElapsed(0); setRunning(Date.now()); }}>
                今からはかる
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => { setMinutes(Math.max(1, Math.round(elapsed / 60))); setRunning(null); }}>
                とめる
              </button>
            )}
          </div>
          {running === null && <NumberField label="何もしなかった時間" value={minutes} onChange={setMinutes} min={1} max={1440} step={5} unit="分" slider={{ min: 5, max: 180, step: 5 }} integer />}
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          もどる
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => entry && onSave(entry)}>
          そっと残す
        </button>
      </div>
    </div>
  );
}
