import { useRef, useState } from 'react';
import { newId, nowIso, useStore } from '../data/store';
import type { ChronicleEntry, ChronicleKind } from '../data/types';
import { isValidDate } from '../engine';
import { ConfirmSheet, Segmented, SelectField, Sheet, TextField } from './controls';
import { Icon } from './Icon';

const MAX_PHOTOS = 4;
const MAX_SIDE = 1280;

/** 写真を端末内で縮小して JPEG のデータURLにする（外部には送らない） */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('画像を読み込めませんでした'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function newChronicle(kind: ChronicleKind, date: string, extra: Partial<ChronicleEntry> = {}): ChronicleEntry {
  const now = nowIso();
  return { id: newId('c-'), kind, date, title: '', body: '', photos: [], goalId: null, createdAt: now, updatedAt: now, ...extra };
}

/** 旅の記録（日記）・節目の追加と編集 */
export function ChronicleEditor({ entry, isNew, onClose }: { entry: ChronicleEntry | null; isNew: boolean; onClose: () => void }) {
  const { data, update, pushToast } = useStore();
  const [draft, setDraft] = useState<ChronicleEntry | null>(entry);
  const [last, setLast] = useState(entry);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (entry !== last) {
    setLast(entry);
    setDraft(entry);
  }
  if (!draft) return null;
  const set = (p: Partial<ChronicleEntry>) => setDraft({ ...draft, ...p });
  const valid = isValidDate(draft.date) && (draft.title.trim() !== '' || draft.body.trim() !== '' || draft.photos.length > 0);
  const label = draft.kind === 'milestone' ? '節目' : draft.kind === 'quiet' ? '静寂の地の記録' : '旅の記録';

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    try {
      const room = MAX_PHOTOS - draft.photos.length;
      const list = await Promise.all([...files].slice(0, room).map(shrinkPhoto));
      setDraft((d) => (d ? { ...d, photos: [...d.photos, ...list].slice(0, MAX_PHOTOS) } : d));
    } catch {
      pushToast({ kind: 'error', message: '写真を読み込めませんでした' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <Sheet
        open={!!entry}
        onClose={onClose}
        title={`${label}を${isNew ? '残す' : '編集'}`}
        footer={
          <div className="btn-row">
            {!isNew && (
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={18} /> 削除
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!valid || busy}
              onClick={() => {
                const e = { ...draft, title: draft.title.trim(), updatedAt: nowIso() };
                update((d) => ({ ...d, chronicle: d.chronicle.some((c) => c.id === e.id) ? d.chronicle.map((c) => (c.id === e.id ? e : c)) : [...d.chronicle, e] }), {
                  success: isNew ? '記録（年代記）に残しました' : '保存しました',
                });
                onClose();
              }}
            >
              {isNew ? '年代記に残す' : '保存'}
            </button>
          </div>
        }
      >
        <div className="stack-m">
          {isNew && draft.kind !== 'quiet' && (
            <Segmented
              label="記録の種類"
              options={[
                { value: 'journal', label: '旅の記録（日記）' },
                { value: 'milestone', label: '人生の節目' },
              ]}
              value={draft.kind}
              onChange={(kind) => set({ kind })}
            />
          )}
          {draft.kind === 'milestone' && <p className="field-hint">節目は記念碑として世界に残ります（記念碑の法則）。目標を消しても、ここに残した節目は消えません。</p>}
          <TextField label="日付" type="date" value={draft.date} onChange={(date) => set({ date })} />
          <TextField label="題（任意）" value={draft.title} onChange={(title) => set({ title })} maxLength={60} placeholder={draft.kind === 'milestone' ? '例: 転職した・引っ越した・資格に合格' : '例: 朝の川沿いを散歩した'} />
          <TextField label="本文（任意）" value={draft.body} onChange={(body) => set({ body })} multiline maxLength={4000} placeholder="思ったこと、感じたことを自由に" />
          <div className="field">
            <span className="field-label">写真（{draft.photos.length}/{MAX_PHOTOS}）</span>
            <div className="photo-grid">
              {draft.photos.map((src, i) => (
                <div key={i} className="photo-thumb">
                  <img src={src} alt={`写真 ${i + 1}`} />
                  <button type="button" className="photo-remove" aria-label={`写真 ${i + 1} を外す`} onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              {draft.photos.length < MAX_PHOTOS && (
                <button type="button" className="photo-add" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Icon name="photo" size={22} />
                  <span>{busy ? '処理中…' : '追加'}</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
            <span className="field-hint">写真はこの端末の中で小さくしてから保存します。外部には送信しません。</span>
          </div>
          <SelectField label="関連する開拓計画（任意）" value={draft.goalId ?? ''} onChange={(v) => set({ goalId: v || null })} options={[{ value: '', label: 'なし' }, ...data.goals.map((g) => ({ value: g.id, label: g.name }))]} />
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${label}を削除`}
        danger
        confirmLabel="削除する"
        message={<p>この{label}を年代記から削除します。</p>}
        onConfirm={() => {
          update((d) => ({ ...d, chronicle: d.chronicle.filter((c) => c.id !== draft.id) }), { undo: `${label}を削除しました` });
          onClose();
        }}
      />
    </>
  );
}
