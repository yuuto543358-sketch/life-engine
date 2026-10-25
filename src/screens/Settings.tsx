import { useEffect, useRef, useState } from 'react';
import { createBackup, parseBackup, type ImportResult } from '../data/backup';
import { storageEstimate } from '../data/db';
import { nowIso, useStore } from '../data/store';
import type { AppSettings } from '../data/types';
import { ConfirmSheet, SectionHead, Segmented, Sheet, TextField, Toggle } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { OnboardingSheet } from '../ui/Onboarding';
import { ScreenHead } from '../ui/ScreenHead';

export function SettingsScreen() {
  const { data, update, today, importData, clearAll, addSample, removeSample, pushToast } = useStore();
  const s = data.settings;
  const setSettings = (p: Partial<AppSettings>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const [setup, setSetup] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRemoveSample, setConfirmRemoveSample] = useState(false);
  const [importing, setImporting] = useState<ImportResult | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSample = data.goals.some((g) => g.isSample) || data.actuals.some((a) => a.isSample) || data.scenarios.some((x) => x.isSample);

  useEffect(() => {
    void storageEstimate().then(setEstimate);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, [data]);

  const doExport = () => {
    try {
      const json = JSON.stringify(createBackup(data, nowIso()), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `life-engine-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast({ kind: 'success', message: 'バックアップファイルを書き出しました' });
    } catch {
      pushToast({ kind: 'error', message: '書き出しに失敗しました' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setImporting({ ok: false, errors: ['ファイルが大きすぎます（20MBまで）'] });
      return;
    }
    try {
      setImporting(parseBackup(await file.text()));
    } catch {
      setImporting({ ok: false, errors: ['ファイルを読み込めませんでした'] });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <ScreenHead place="settings" eyebrow="世界の調律" title="設定とデータ">
        <a className="back-link" href="#/home">
          <Icon name="chevron-left" size={16} /> 世界の中心へ戻る
        </a>
      </ScreenHead>

      <section className="section">
        <SectionHead title="あなたの情報" />
        <div className="panel stack-m">
          <TextField label="呼び名" value={data.profile.name} onChange={(name) => update((d) => ({ ...d, profile: { ...d.profile, name } }), { debounce: true })} maxLength={20} placeholder="未設定" />
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSetup(true)}>
            <Icon name="edit" size={18} /> 初期設定（時間・お金の基本）を編集
          </button>
        </div>
      </section>

      <section className="section">
        <SectionHead title="表示" />
        <div className="panel stack-m">
          <div className="field">
            <span className="field-label">テーマ</span>
            <span className="field-hint">「自動」は端末の設定に合わせます</span>
            <Segmented
              label="テーマ"
              options={[
                { value: 'system', label: '自動' },
                { value: 'light', label: 'ライト' },
                { value: 'dark', label: 'ダーク' },
              ]}
              value={s.theme}
              onChange={(theme) => setSettings({ theme })}
            />
          </div>
          <div className="field">
            <span className="field-label">アニメーション</span>
            <Segmented
              label="アニメーション"
              options={[
                { value: 'system', label: '自動' },
                { value: 'reduce', label: '抑える' },
                { value: 'full', label: '通常' },
              ]}
              value={s.motion}
              onChange={(motion) => setSettings({ motion })}
            />
          </div>
          <div className="field">
            <span className="field-label">文字の大きさ</span>
            <Segmented
              label="文字の大きさ"
              options={[
                { value: 'standard', label: '標準' },
                { value: 'large', label: '大きめ' },
              ]}
              value={s.textSize}
              onChange={(textSize) => setSettings({ textSize })}
            />
          </div>
          <Toggle label="金額を「万円」で表示" hint="オフにすると 1円単位で表示します（入力は常に1円単位）" checked={s.compactMoney} onChange={(compactMoney) => setSettings({ compactMoney })} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="バックアップ" sub="機種変更やブラウザのデータ削除に備えて、定期的に書き出してください" />
        <div className="panel stack-s">
          <button type="button" className="settings-row" onClick={doExport}>
            <Icon name="download" size={20} />
            <span>
              <span className="list-title">データを書き出す（JSON）</span>
              <span className="list-sub">すべての計画・目標・実績を1つのファイルに保存</span>
            </span>
          </button>
          <button type="button" className="settings-row" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={20} />
            <span>
              <span className="list-title">バックアップから復元</span>
              <span className="list-sub">内容を確認してから、いまのデータと置き換えます</span>
            </span>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="サンプルデータ" />
        <div className="panel stack-s">
          <button type="button" className="settings-row" onClick={addSample} disabled={data.goals.some((g) => g.id === 's-cert')}>
            <Icon name="spark" size={20} />
            <span>
              <span className="list-title">サンプルデータを追加</span>
              <span className="list-sub">目標5件・シナリオ3件・5週間分の実績。あなたのデータはそのまま残ります</span>
            </span>
          </button>
          <button type="button" className="settings-row" onClick={() => setConfirmRemoveSample(true)} disabled={!hasSample}>
            <Icon name="trash" size={20} />
            <span>
              <span className="list-title">サンプルデータを削除</span>
              <span className="list-sub">サンプルとして追加したものだけを取り除きます</span>
            </span>
          </button>
        </div>
      </section>

      <section className="section">
        <SectionHead title="データの保存場所" />
        <div className="panel prose">
          <p>
            データは<strong>この端末のブラウザの中（IndexedDB）だけ</strong>に保存されます。サーバーへの送信、アカウント登録、外部サービスとの通信は行いません。
          </p>
          <ul>
            <li>別の端末やブラウザとは自動で同期されません。移すときはバックアップを使ってください。</li>
            <li>ブラウザの「履歴とWebサイトデータを消去」を行うと、データも消えます。</li>
            <li>iPhone の Safari では、長期間アプリを開かないとデータが消される場合があります。ホーム画面に追加して使うと残りやすくなります。</li>
          </ul>
          <p className="small muted">
            {estimate ? `使用量: 約${Math.max(1, Math.round(estimate.usage / 1024))}KB` : '使用量: 取得できません'}
            {persisted === true ? ' · 消去されにくい保存が有効です' : persisted === false ? ' · ブラウザの判断で消去される可能性があります' : ''}
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead title="LIFE ENGINE について" />
        <div className="panel prose">
          <p>時間・お金・目標をひとつの計画として計算し、選択肢を比べるためのアプリです。AI や外部APIは一切使わず、すべての結果は下の決まった式で計算します。同じ入力なら必ず同じ結果になります。</p>
          <details className="disclosure">
            <summary>
              <span>計算のルール</span>
              <Icon name="chevron-down" size={18} className="disclosure-icon" />
            </summary>
            <div className="disclosure-body">
              <ul className="rules">
                <li>週間時間 = 1日あたりの時間 × 週の日数。自由時間 = 1週間の総時間（通常168時間）− 配分済みの時間。</li>
                <li>目標の時間は、指定した枠（勉強など）から使い、枠を超えた分だけ自由時間から使います。優先順位の高い目標から順に割り当てます。</li>
                <li>月間収支 = 手取り収入 − 固定費 − 変動費。実際に貯金できる額 = 毎月の貯金額と月間収支の小さいほう。</li>
                <li>目標の予算は、（予算 − 記録した支出）÷ 期限までの月数（今月と期限の月を含む）を、貯金後の残りから確保します。</li>
                <li>将来の残高 = 前月の残高 + 運用益（年利 ÷ 12 の月複利、初期値0%）+ 毎月の積立 + その月の臨時収支。入力した収支が続くと仮定した計算値です。</li>
                <li>換算: 1年 = 12か月 = 52週 = 365日。週 → 月は × 52 ÷ 12。</li>
                <li>実績の比較では、記録のない項目を0とは見なしません。傾向は、記録が十分にあるときだけ単純な平均で表示します。</li>
              </ul>
            </div>
          </details>
          <p className="small muted">バージョン 1.0.0 · データ形式 v1</p>
        </div>
      </section>

      <section className="section">
        <SectionHead title="危険な操作" />
        <div className="panel">
          <button type="button" className="settings-row settings-row-danger" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={20} />
            <span>
              <span className="list-title">すべてのデータを削除</span>
              <span className="list-sub">計画・目標・シナリオ・実績・設定を消して、最初の状態に戻します</span>
            </span>
          </button>
        </div>
      </section>

      <OnboardingSheet open={setup} onClose={() => setSetup(false)} />
      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="すべてのデータを削除"
        danger
        confirmLabel="完全に削除する"
        typeToConfirm="削除"
        message={
          <p>
            この端末に保存されている LIFE ENGINE のデータをすべて削除します。<strong>この操作は取り消せません。</strong>必要なら先にバックアップを書き出してください。
          </p>
        }
        onConfirm={() => void clearAll()}
      />
      <ConfirmSheet open={confirmRemoveSample} onClose={() => setConfirmRemoveSample(false)} title="サンプルデータを削除" danger confirmLabel="削除する" message={<p>サンプルとして追加した目標・シナリオ・実績・つながりを削除します。あなたが追加したデータは残ります。</p>} onConfirm={removeSample} />
      <ImportSheet result={importing} onClose={() => setImporting(null)} onConfirm={(d) => void importData(d).then((ok) => ok && setImporting(null))} />
    </>
  );
}

function ImportSheet({ result, onClose, onConfirm }: { result: ImportResult | null; onClose: () => void; onConfirm: (d: Extract<ImportResult, { ok: true }>['data']) => void }) {
  if (!result) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={result.ok ? 'バックアップの内容' : '読み込めませんでした'}
      footer={
        result.ok ? (
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              キャンセル
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onConfirm(result.data)}>
              いまのデータと置き換える
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            閉じる
          </button>
        )
      }
    >
      {result.ok ? (
        <div className="stack-m">
          <p className="sheet-lead">このファイルの内容で、いまのデータをすべて置き換えます。置き換える前に、いまのデータを書き出しておくと安心です。</p>
          <dl className="stats">
            {Object.entries(result.summary).map(([k, v]) => (
              <div key={k} className="stat">
                <dt>{k}</dt>
                <dd className="num">{v}件</dd>
              </div>
            ))}
          </dl>
          {result.warnings.length > 0 && (
            <div className="callout callout-warn">
              <Icon name="alert" size={18} />
              <div>
                {result.warnings.slice(0, 4).map((w, i) => (
                  <p key={i} className="small">
                    {w}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="stack-m">
          <div className="callout callout-bad">
            <Icon name="alert" size={18} />
            <div>
              <p>ファイルの形式に問題があるため、読み込みを中止しました。いまのデータは変更されていません。</p>
              {result.errors.map((e, i) => (
                <p key={i} className="small mono">
                  {e}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
