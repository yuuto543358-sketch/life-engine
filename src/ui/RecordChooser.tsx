import { Sheet } from './controls';
import { Icon } from './Icon';

export type RecordChoice = 'time' | 'expense' | 'task' | 'progress' | 'journal' | 'milestone';

const CHOICES: { value: RecordChoice; icon: string; label: string; hint: string }[] = [
  { value: 'time', icon: 'clock', label: '時間', hint: '勉強・仕事・趣味などに使った時間' },
  { value: 'expense', icon: 'yen', label: 'お金（支出）', hint: '使ったお金' },
  { value: 'task', icon: 'check', label: '作業', hint: '見積もりと実際にかかった時間' },
  { value: 'progress', icon: 'target', label: '目標の進み具合', hint: '目標が何%まで進んだか' },
  { value: 'journal', icon: 'feather', label: '日記・写真', hint: 'できごとや気持ちを、写真と一緒に' },
  { value: 'milestone', icon: 'monument', label: '節目', hint: '心に残る出来事（記念碑になります）' },
];

/** 記録の入り口はここだけ。何を記録するかを選ぶ */
export function RecordChooser({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: RecordChoice) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="何を記録しますか？">
      <ul className="choice-list">
        {CHOICES.map((c) => (
          <li key={c.value}>
            <button
              type="button"
              className="choice"
              onClick={() => {
                onClose();
                onPick(c.value);
              }}
            >
              <span className="choice-icon">
                <Icon name={c.icon} size={20} />
              </span>
              <span className="choice-text">
                <span className="choice-label">{c.label}</span>
                <span className="choice-hint">{c.hint}</span>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
