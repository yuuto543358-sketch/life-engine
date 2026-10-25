import { useState } from 'react';
import { useStore } from '../data/store';
import { Sheet, TextField } from './controls';

const PRESETS = ['現状維持', '勉強優先', '貯金優先', '趣味・自由時間優先'];

/** シナリオを複製して新しいシナリオを作る */
export function NewScenarioSheet({ open, onClose, sourceId, onCreated }: { open: boolean; onClose: () => void; sourceId: string; onCreated?: (id: string) => void }) {
  const { data, duplicateScenario } = useStore();
  const [name, setName] = useState('');
  const source = data.scenarios.find((s) => s.id === sourceId);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName('');
  }
  const taken = new Set(data.scenarios.map((s) => s.name));
  const valid = name.trim() !== '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="新しいシナリオ"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!valid}
          onClick={() => {
            const id = duplicateScenario(sourceId, name.trim());
            onClose();
            onCreated?.(id);
          }}
        >
          複製して作成
        </button>
      }
    >
      <p className="sheet-lead">
        「{source?.name}」の時間配分・お金・目標の計画をそのまま複製します。複製したシナリオを編集しても、元のシナリオは変わりません。
      </p>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p} type="button" className="chip" aria-pressed={name === p} onClick={() => setName(p)}>
            {p}
          </button>
        ))}
      </div>
      <TextField label="シナリオ名" value={name} onChange={setName} placeholder="例: 転職した場合" maxLength={40} />
      {taken.has(name.trim()) && <p className="field-hint">同じ名前のシナリオがあります（作成はできます）</p>}
    </Sheet>
  );
}

export function RenameScenarioSheet({ open, onClose, scenarioId }: { open: boolean; onClose: () => void; scenarioId: string }) {
  const { data, update } = useStore();
  const s = data.scenarios.find((x) => x.id === scenarioId);
  const [name, setName] = useState(s?.name ?? '');
  const [note, setNote] = useState(s?.note ?? '');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(s?.name ?? '');
      setNote(s?.note ?? '');
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="名前とメモ"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!name.trim()}
          onClick={() => {
            update((d) => ({ ...d, scenarios: d.scenarios.map((x) => (x.id === scenarioId ? { ...x, name: name.trim(), note } : x)) }), { success: '保存しました' });
            onClose();
          }}
        >
          保存
        </button>
      }
    >
      <div className="stack-m">
        <TextField label="シナリオ名" value={name} onChange={setName} required maxLength={40} />
        <TextField label="メモ" value={note} onChange={setNote} multiline maxLength={300} placeholder="このシナリオの狙いや前提" />
      </div>
    </Sheet>
  );
}
