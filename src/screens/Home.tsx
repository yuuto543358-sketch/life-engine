import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { ActualRecord, ChronicleEntry } from '../data/types';
import { ERA_LABELS, LAW_LABELS, REGION_LABELS, nextSteps, recentEvents, type LawKey, type WorldStructure } from '../engine';
import { Meter, Sheet, StatusTag } from '../ui/controls';
import { fmtDate, fmtH, fmtShortDate, fmtYen, weekdayOf } from '../ui/format';
import { Icon } from '../ui/Icon';
import { useScenarioModel } from '../ui/model';
import { OnboardingSheet } from '../ui/Onboarding';
import { href, navigate } from '../ui/router';
import { describeRecord } from '../ui/recordViews';
import { ChronicleEditor, newChronicle } from '../ui/ChronicleEditor';
import { RecordEditor, newRecord } from './Actuals';
import { WorldScene } from '../world/WorldScene';
import { useWorld } from '../world/useWorld';
import { computeWorld } from '../engine/world';

export const LAW_ICONS: Record<LawKey, string> = {
  sprout: 'sprout',
  layer: 'layers',
  link: 'bridge',
  milestone: 'monument',
  rest: 'leaf',
  memory: 'scroll',
};

const STRUCTURE_ICONS: Record<string, string> = {
  workshop: 'briefcase',
  library: 'book',
  atelier: 'spark',
  plaza: 'people',
  spring: 'heart',
  house: 'home',
  storehouse: 'coin',
  tower: 'flag',
};

/** 世界の中心（最初に開く画面）。風景が主役で、今日の情報は控えめに置く */
export function HomeScreen() {
  const { data, today, addSample, saveStatus } = useStore();
  const { state, input } = useWorld();
  const [setup, setSetup] = useState(false);
  const [selected, setSelected] = useState<WorldStructure | null>(null);
  const [record, setRecord] = useState<ActualRecord | null>(null);
  const [entry, setEntry] = useState<ChronicleEntry | null>(null);
  const era = ERA_LABELS[state.era];
  const onboarded = data.profile.onboarded;
  // 世界が始まったら、風景が見えるように上へ戻す
  useEffect(() => {
    if (onboarded) window.scrollTo({ top: 0 });
  }, [onboarded]);
  const dateLabel = `${fmtDate(today, false)}（${weekdayOf(today)}）`;

  if (!data.profile.onboarded) {
    const dawn = computeWorld({ ...input, goals: [], actuals: [], chronicle: [], dependencies: [] }, today);
    return (
      <>
        <section className="wc-hero wc-hero-intro">
          <WorldScene state={dawn} />
          <div className="wc-top">
            <div>
              <p className="wc-world">VERDANTH</p>
              <p className="wc-era">{ERA_LABELS.dawn.name}</p>
            </div>
          </div>
        </section>
        <div className="wc-body wc-intro">
          <p className="myth">
            世界の始まりにあった小さな光は、大地に落ちて種となりました。
            <br />
            どの可能性が芽吹くかは、まだ誰も知りません。
          </p>
          <h1 className="intro-title">あなたの人生は、ひとつの世界になる。</h1>
          <p className="intro-text">
            時間・お金・目標・日々の記録が、この世界の森や道や建物になります。世界は、実際の記録と決まったルールだけで少しずつ姿を変えます。休んだ日に何かが失われることはありません。
          </p>
          <ol className="intro-steps">
            <li>
              <span className="num">1</span>1週間の時間と、毎月のお金を入れる
            </li>
            <li>
              <span className="num">2</span>開拓計画（目標）を立てる
            </li>
            <li>
              <span className="num">3</span>足跡（記録）を残し、世界の変化をながめる
            </li>
          </ol>
          <div className="stack-s">
            <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => setSetup(true)}>
              世界をはじめる
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={addSample}>
              見本の世界をのぞいてみる（サンプルデータ）
            </button>
          </div>
          <p className="fineprint">AI や外部サービスは使いません。データはこの端末の中だけに保存されます。</p>
        </div>
        <OnboardingSheet open={setup} onClose={() => setSetup(false)} />
      </>
    );
  }

  return (
    <>
      <section className="wc-hero" aria-label="あなたの世界">
        <WorldScene state={state} onSelect={setSelected} />
        <div className="wc-top">
          <div>
            <p className="wc-world">VERDANTH</p>
            <p className="wc-era">{era.name}</p>
            <p className="wc-date">{dateLabel}</p>
          </div>
          <div className="wc-top-actions">
            {saveStatus === 'error' && (
              <span className="wc-badge wc-badge-bad">
                <Icon name="alert" size={14} /> 未保存
              </span>
            )}
            <a className="wc-icon" href={href('settings')} aria-label="世界の調律（設定）">
              <Icon name="settings" size={20} />
            </a>
          </div>
        </div>
        <p className="wc-caption">{era.meaning}</p>
      </section>

      <div className="wc-body">
        <TodayFootprints onAdd={(t) => setRecord(newRecord(t, today))} onJournal={() => setEntry(newChronicle('journal', today))} onEdit={setRecord} />
        <NextSteps input={input} />
        <ActivePlans />
        <RecentChanges events={recentEvents(state)} />
        <WorldStatus state={state} onSelect={setSelected} />
        <Balance />
      </div>

      <StructureSheet s={selected} onClose={() => setSelected(null)} />
      <RecordEditor record={record} isNew={!!record && !data.actuals.some((a) => a.id === record.id)} onClose={() => setRecord(null)} />
      <ChronicleEditor entry={entry} isNew={!!entry && !data.chronicle.some((c) => c.id === entry.id)} onClose={() => setEntry(null)} />
    </>
  );
}

function TodayFootprints({ onAdd, onJournal, onEdit }: { onAdd: (t: ActualRecord['type']) => void; onJournal: () => void; onEdit: (r: ActualRecord) => void }) {
  const { data, today } = useStore();
  const compact = data.settings.compactMoney;
  const todays = data.actuals.filter((a) => a.date === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = data.chronicle.filter((c) => c.date === today);
  const goalName = (id: string | null) => (id ? data.goals.find((g) => g.id === id)?.name ?? null : null);
  return (
    <section className="wc-section" aria-label="今日の足跡">
      <div className="wc-head">
        <h2 className="wc-title">
          <Icon name="lantern" size={18} /> 今日の足跡
        </h2>
        <a className="section-link" href={href('log')}>
          年代記へ <Icon name="chevron" size={14} />
        </a>
      </div>
      <div className="quick-add" role="group" aria-label="足跡（記録）を残す">
        {([
          ['time', 'clock', '時間'],
          ['expense', 'yen', 'お金'],
          ['task', 'check', '作業'],
        ] as const).map(([t, icon, label]) => (
          <button key={t} type="button" className="quick-add-btn" onClick={() => onAdd(t)}>
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="quick-add-btn" onClick={onJournal}>
          <Icon name="feather" size={20} />
          <span>旅の記録</span>
        </button>
      </div>
      {todays.length === 0 && notes.length === 0 ? (
        <p className="wc-quiet">まだ今日の足跡はありません。何もしない日も、この世界は静かに続いています。</p>
      ) : (
        <ul className="footprints">
          {todays.map((a) => {
            const d = describeRecord(a, goalName, compact);
            return (
              <li key={a.id}>
                <button type="button" className="footprint" onClick={() => onEdit(a)}>
                  <span className="swatch" style={{ background: d.color }} />
                  <span className="footprint-title">{d.title}</span>
                  <span className="num footprint-value">{d.value}</span>
                </button>
              </li>
            );
          })}
          {notes.map((c) => (
            <li key={c.id}>
              <a className="footprint" href={href('log')}>
                <Icon name={c.kind === 'quiet' ? 'moon' : c.kind === 'milestone' ? 'monument' : 'feather'} size={14} />
                <span className="footprint-title">{c.title || (c.kind === 'quiet' ? '静寂の地での記録' : '旅の記録')}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextSteps({ input }: { input: ReturnType<typeof useWorld>['input'] }) {
  const { today, current } = useStore();
  const { feasibility } = useScenarioModel(current);
  const steps = useMemo(() => nextSteps(input, today, feasibility.conflicts), [input, today, feasibility.conflicts]);
  if (steps.length === 0) return null;
  return (
    <section className="wc-section" aria-label="次の一歩">
      <h2 className="wc-title">
        <Icon name="compass" size={18} /> 次の一歩
      </h2>
      <ul className="steps">
        {steps.map((s) => (
          <li key={s.id}>
            <button type="button" className={`step step-${s.kind}`} onClick={() => (s.to.tab === 'home' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : navigate(s.to.tab, s.to.sub))}>
              <span className="step-dot" aria-hidden="true" />
              <span>{s.text}</span>
              {s.kind === 'prepared' && <span className="step-tag">昨日の自分から</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivePlans() {
  const { data, current } = useStore();
  const { feasibility: f } = useScenarioModel(current);
  const active = f.goals.filter((g) => !g.completed).slice(0, 3);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  return (
    <section className="wc-section" aria-label="進行中の開拓計画">
      <div className="wc-head">
        <h2 className="wc-title">
          <Icon name="flag" size={18} /> 進行中の開拓計画 <span className="wc-real">（目標）</span>
        </h2>
        <a className="section-link" href={href('sim', 'goals')}>
          開拓の間 <Icon name="chevron" size={14} />
        </a>
      </div>
      {active.length === 0 ? (
        <button type="button" className="empty-row" onClick={() => navigate('sim', 'goals')}>
          <Icon name="plus" size={18} /> 開拓計画（目標）を立てると、原生域に旗が立ちます
        </button>
      ) : (
        <ul className="plans">
          {active.map((r) => {
            const g = goalById.get(r.goalId)!;
            return (
              <li key={r.goalId} className="plan">
                <div className="plan-top">
                  <span className="plan-name">{g.name}</span>
                  {r.fits ? <StatusTag tone="good">両立</StatusTag> : <StatusTag tone="warn">見直し</StatusTag>}
                </div>
                <Meter value={r.progress} label={`${g.name}の進捗`} color={r.isMoney ? 'var(--c-commute)' : 'var(--accent)'} />
                <p className="plan-meta num">
                  {r.isMoney ? `${fmtYen(r.saved, true)} / ${fmtYen(r.budget, true)}${r.monthlyNeed ? ` · 毎月${fmtYen(r.monthlyNeed, true)}` : ''}` : `進捗 ${Math.round(r.progress)}%${r.weeklyHours ? ` · 週${fmtH(r.weeklyHours)}時間` : ''}`}
                  {r.deadline ? ` · ${fmtDate(r.deadline)}まで` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RecentChanges({ events, title = '最近の世界の変化' }: { events: ReturnType<typeof recentEvents>; title?: string }) {
  return (
    <section className="wc-section" aria-label={title}>
      <h2 className="wc-title">
        <Icon name="sprout" size={18} /> {title}
      </h2>
      {events.length === 0 ? (
        <p className="wc-quiet">この2週間、世界は静かに過ごしていました。変化がない時間も、世界の一部です。</p>
      ) : (
        <ul className="changes-list">
          {events.slice(0, 5).map((e) => (
            <li key={e.id} className="change">
              <span className={`change-icon law-${e.law}`}>
                <Icon name={LAW_ICONS[e.law]} size={16} />
              </span>
              <span className="change-body">
                <span className="change-title">{e.title}</span>
                <span className="change-meta">
                  {fmtShortDate(e.date)} · {LAW_LABELS[e.law]} · {e.basis}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorldStatus({ state, onSelect }: { state: ReturnType<typeof useWorld>['state']; onSelect: (s: WorldStructure) => void }) {
  return (
    <section className="wc-section" aria-label="世界のようす">
      <details className="disclosure world-status">
        <summary>
          <span>
            <Icon name="mountain" size={18} /> 世界のようす（なぜこの姿なのか）
          </span>
          <Icon name="chevron-down" size={18} className="disclosure-icon" />
        </summary>
        <div className="disclosure-body stack-m">
          <Region k="wild" lines={[`霧の深さ ${Math.round(state.mist * 100)}%（まだ計画も記録もない領域の割合）`, `原生域の旗 ${state.flags.length}本（まだ歩き出していない開拓計画）`]} />
          <Region
            k="nature"
            lines={[
              `森の木 ${state.nature.trees}本（最初の14本＋暮らしの営みを記録した日 ${state.nature.days}日）`,
              `草原の花 ${state.nature.flowers}輪（静寂の地の記録 ${state.nature.quietCount}件）`,
              `水辺の蛍 ${state.nature.fireflies}匹（何もしない時間 ${state.nature.nothingMinutes}分）`,
            ]}
          />
          <Region k="paths" lines={[`道 第${state.paths.level}段階（足跡を残した日 ${state.paths.days}日）`, `橋 ${state.paths.bridges}本（登録したつながり）`]} />
          <div>
            <p className="region-name">
              {REGION_LABELS.civ.name}・拠点 <span className="region-meaning">{REGION_LABELS.civ.meaning}</span>
            </p>
            <ul className="structures">
              {state.structures.map((s) => (
                <li key={s.domainId}>
                  <button type="button" className="structure-row" onClick={() => onSelect(s)}>
                    <Icon name={STRUCTURE_ICONS[s.kind]} size={16} />
                    <span className="structure-name">{s.name}</span>
                    <span className="levels" aria-label={`第${s.level}段階`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={i < s.level ? 'lv on' : 'lv'} />
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="region-line">記念碑 {state.monuments.length}基（達成した開拓計画と、年代記に残した節目）</p>
          </div>
          <p className="fineprint">
            世界は記録と設定だけから、決まったルールで計算しています。同じ記録なら同じ世界になり、休んだ日に何かが減ることはありません。健康や仕事の良し悪しは判定しません。
          </p>
        </div>
      </details>
    </section>
  );
}

function Region({ k, lines }: { k: 'wild' | 'nature' | 'paths'; lines: string[] }) {
  return (
    <div>
      <p className="region-name">
        {REGION_LABELS[k].name} <span className="region-meaning">{REGION_LABELS[k].meaning}</span>
      </p>
      {lines.map((l) => (
        <p key={l} className="region-line">
          {l}
        </p>
      ))}
    </div>
  );
}

function Balance() {
  const { data, current } = useStore();
  const compact = data.settings.compactMoney;
  const { feasibility: f, projection: p } = useScenarioModel(current);
  const free = Math.max(0, f.time.freeHours) - f.freeUsedByGoals;
  return (
    <section className="wc-section" aria-label="暮らしの釣り合い">
      <h2 className="wc-title">
        <Icon name="scroll" size={18} /> 暮らしの釣り合い
      </h2>
      <div className="balance">
        <a className="balance-cell" href={href('sim', 'time')}>
          <span className="balance-label">{f.time.shortageHours > 0 ? '時間の不足' : '残る自由時間'}</span>
          <span className={`balance-value num ${f.time.shortageHours > 0 ? 'is-bad' : ''}`}>
            {fmtH(f.time.shortageHours > 0 ? f.time.shortageHours : free)}
            <span className="unit">時間/週</span>
          </span>
        </a>
        <a className="balance-cell" href={href('sim', 'money')}>
          <span className="balance-label">蓄え（毎月の収支）</span>
          <span className={`balance-value num ${f.money.surplus < 0 ? 'is-bad' : ''}`}>
            {fmtYen(f.money.surplus, compact, true)}
            <span className="unit">/月</span>
          </span>
        </a>
        {p.target > 0 && (
          <a className="balance-cell balance-wide" href={href('sim', 'money')}>
            <span className="balance-label">貯金の目標 {fmtYen(p.target, compact)}</span>
            <Meter value={Math.max(0, current.finance.currentSavings)} max={p.target} label="貯金の目標の進み具合" color="var(--c-commute)" />
            <span className="balance-sub">{p.alreadyReached ? '目標額に達しています' : p.monthsToTarget ? `今のペースで約${p.monthsToTarget}か月後に到達` : '今の収支のままでは届かない計算です'}</span>
          </a>
        )}
      </div>
    </section>
  );
}

function StructureSheet({ s, onClose }: { s: WorldStructure | null; onClose: () => void }) {
  if (!s) return null;
  const region = REGION_LABELS[s.region];
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <>
          <Icon name={STRUCTURE_ICONS[s.kind]} size={20} /> {s.name}
        </>
      }
      footer={
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onClose();
              navigate('map');
            }}
          >
            <Icon name="map" size={18} /> 世界地図で見る
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate('sim', 'goals');
            }}
          >
            開拓計画を見る
          </button>
        </div>
      }
    >
      <div className="stack-m">
        <p className="sheet-lead">
          {region.name}・{s.domainName}の拠点
        </p>
        <div className="levels levels-lg" aria-label={`第${s.level}段階`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < s.level ? 'lv on' : 'lv'} />
          ))}
          <span className="levels-text">{s.level === 0 ? 'まだ可能性として眠っている' : `第${s.level}段階`}</span>
        </div>
        <p>{s.basis}</p>
        {s.next && <p className="small muted">{s.next}</p>}
        {s.planned && <p className="small">開拓計画があるため、小さな旗と足場がかかっています。</p>}
        <p className="fineprint">{s.kind === 'storehouse' ? '蓄えの蔵は、いまの貯金額から計算します（積層の法則）。' : '拠点は、この領域に関わる記録の積み重ねで育ちます（積層の法則）。記録しない日があっても小さくなりません。'}</p>
      </div>
    </Sheet>
  );
}
