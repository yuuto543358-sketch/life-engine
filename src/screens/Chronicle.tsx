import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { ActualRecord, ChronicleEntry } from '../data/types';
import { ERA_LABELS, LAW_LABELS, computeWorld, type WorldEvent } from '../engine';
import { addDays, daysInMonth } from '../engine/units';
import { Segmented, Sheet } from '../ui/controls';
import { fmtShortDate, weekdayOf } from '../ui/format';
import { Icon } from '../ui/Icon';
import { ChronicleEditor, newChronicle } from '../ui/ChronicleEditor';
import { describeRecord } from '../ui/recordViews';
import { navigate, type Route } from '../ui/router';
import { ScreenHead } from '../ui/ScreenHead';
import { WorldScene } from '../world/WorldScene';
import { useWorld } from '../world/useWorld';
import { ActualsScreen, RecordEditor } from './Actuals';
import { LAW_ICONS } from './Home';

type Filter = 'all' | 'journal' | 'milestone' | 'quiet' | 'footprints' | 'world';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'journal', label: '旅の記録' },
  { value: 'milestone', label: '節目' },
  { value: 'quiet', label: '静寂' },
  { value: 'footprints', label: '足跡' },
  { value: 'world', label: '世界の変化' },
];

type Item =
  | { type: 'entry'; date: string; key: string; entry: ChronicleEntry }
  | { type: 'day'; date: string; key: string; records: ActualRecord[] }
  | { type: 'event'; date: string; key: string; event: WorldEvent };

/** 年代記の館: 旅の記録・節目・静寂の地・足跡・世界の変化を時間の流れに沿って振り返る */
export function ChronicleScreen({ route }: { route: Route }) {
  const sub = route.sub === 'observe' ? 'observe' : 'timeline';
  return (
    <>
      <ScreenHead eyebrow="年代記の館" title={sub === 'observe' ? '足跡と世界の観測' : '世界の年代記'}>
        <div className="sim-tabs">
          <Segmented
            label="年代記の館の部屋"
            options={[
              { value: 'timeline', label: '年代記（過去の記録）' },
              { value: 'observe', label: '足跡と観測（統計）' },
            ]}
            value={sub}
            onChange={(v) => navigate('log', v === 'observe' ? 'observe' : '')}
          />
        </div>
      </ScreenHead>
      {sub === 'observe' ? <ActualsScreen embedded /> : <Timeline />}
    </>
  );
}

function Timeline() {
  const { data, today } = useStore();
  const compact = data.settings.compactMoney;
  const { state, input } = useWorld();
  const [filter, setFilter] = useState<Filter>('all');
  const [months, setMonths] = useState(6);
  const [editing, setEditing] = useState<ChronicleEntry | null>(null);
  const [record, setRecord] = useState<ActualRecord | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [lookMonth, setLookMonth] = useState<string | null>(null);
  const goalName = (id: string | null) => (id ? data.goals.find((g) => g.id === id)?.name ?? null : null);

  const items = useMemo(() => {
    const list: Item[] = [];
    for (const c of data.chronicle) list.push({ type: 'entry', date: c.date, key: `c:${c.id}`, entry: c });
    const byDay = new Map<string, ActualRecord[]>();
    for (const a of data.actuals) byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
    for (const [date, records] of byDay) list.push({ type: 'day', date, key: `d:${date}`, records });
    for (const e of state.events) list.push({ type: 'event', date: e.date, key: `e:${e.id}`, event: e });
    return list
      .filter((i) => {
        if (filter === 'all') return true;
        if (filter === 'footprints') return i.type === 'day';
        if (filter === 'world') return i.type === 'event';
        return i.type === 'entry' && i.entry.kind === filter;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || order(a) - order(b));
  }, [data.chronicle, data.actuals, state.events, filter]);

  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const i of items) g.set(i.date.slice(0, 7), [...(g.get(i.date.slice(0, 7)) ?? []), i]);
    return [...g.entries()];
  }, [items]);
  const shown = groups.slice(0, months);

  return (
    <div className="chronicle">
      <div className="chronicle-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newChronicle('journal', today))}>
          <Icon name="feather" size={18} /> 旅の記録を残す
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(newChronicle('milestone', today))}>
          <Icon name="monument" size={18} /> 節目を刻む
        </button>
      </div>
      <div className="chips chips-scroll">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="scroll" size={26} />
          </div>
          <p className="empty-title">年代記はまだ白紙です</p>
          <p className="empty-text">旅の記録や足跡を残すと、ここに時間の流れとして積み重なっていきます。</p>
        </div>
      ) : (
        <ol className="timeline">
          {shown.map(([ym, list]) => (
            <li key={ym} className="tl-month">
              <div className="tl-month-head">
                <h2 className="tl-month-title">
                  {ym.slice(0, 4)}年{+ym.slice(5)}月
                </h2>
                <button type="button" className="section-link" onClick={() => setLookMonth(ym)}>
                  <Icon name="mountain" size={14} /> この月の世界
                </button>
              </div>
              <ul className="tl-items">
                {list.map((i) => {
                  if (i.type === 'entry') {
                    const c = i.entry;
                    return (
                      <li key={i.key}>
                        <button type="button" className={`tl-card tl-${c.kind}`} onClick={() => setEditing(c)}>
                          <span className="tl-date num">
                            {fmtShortDate(c.date)}
                            <span className="tl-wd">{weekdayOf(c.date)}</span>
                          </span>
                          <span className="tl-main">
                            <span className="tl-kind">
                              <Icon name={c.kind === 'milestone' ? 'monument' : c.kind === 'quiet' ? 'moon' : 'feather'} size={13} />
                              {c.kind === 'milestone' ? '節目' : c.kind === 'quiet' ? '静寂の地' : '旅の記録'}
                              {goalName(c.goalId) && <span className="tl-goal">・{goalName(c.goalId)}</span>}
                            </span>
                            {c.title && <span className="tl-title">{c.title}</span>}
                            {quietText(c) && <span className="tl-body">{quietText(c)}</span>}
                            {c.photos.length > 0 && (
                              <span className="tl-photos">
                                {c.photos.slice(0, 3).map((p, k) => (
                                  <img key={k} src={p} alt="" loading="lazy" />
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  }
                  if (i.type === 'day') {
                    const open = openDay === i.date;
                    return (
                      <li key={i.key}>
                        <button type="button" className="tl-card tl-day" aria-expanded={open} onClick={() => setOpenDay(open ? null : i.date)}>
                          <span className="tl-date num">
                            {fmtShortDate(i.date)}
                            <span className="tl-wd">{weekdayOf(i.date)}</span>
                          </span>
                          <span className="tl-main">
                            <span className="tl-kind">
                              <Icon name="lantern" size={13} /> 足跡 {i.records.length}件
                            </span>
                            <span className="tl-body">
                              {i.records
                                .slice(0, 3)
                                .map((r) => describeRecord(r, goalName, compact).value)
                                .join('・')}
                              {i.records.length > 3 ? ' …' : ''}
                            </span>
                          </span>
                          <Icon name="chevron-down" size={16} className="tl-chevron" />
                        </button>
                        {open && (
                          <ul className="tl-records">
                            {i.records.map((r) => {
                              const d = describeRecord(r, goalName, compact);
                              return (
                                <li key={r.id}>
                                  <button type="button" className="footprint" onClick={() => setRecord(r)}>
                                    <span className="swatch" style={{ background: d.color }} />
                                    <span className="footprint-title">{d.title}</span>
                                    <span className="num footprint-value">{d.value}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }
                  const e = i.event;
                  return (
                    <li key={i.key} className="tl-event">
                      <span className={`change-icon law-${e.law}`}>
                        <Icon name={LAW_ICONS[e.law]} size={14} />
                      </span>
                      <span className="tl-main">
                        <span className="tl-event-title">{e.title}</span>
                        <span className="change-meta">
                          {fmtShortDate(e.date)} · {LAW_LABELS[e.law]} · {e.basis}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {groups.length > months && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setMonths(months + 6)}>
          さらに過去へ
        </button>
      )}

      <ChronicleEditor entry={editing} isNew={!!editing && !data.chronicle.some((c) => c.id === editing.id)} onClose={() => setEditing(null)} />
      <RecordEditor record={record} isNew={false} onClose={() => setRecord(null)} />
      <MonthWorld ym={lookMonth} onClose={() => setLookMonth(null)} input={input} today={today} />
    </div>
  );
}

function order(i: Item): number {
  if (i.type === 'entry') return i.entry.kind === 'milestone' ? 0 : 1;
  if (i.type === 'day') return 2;
  return 3;
}

function quietText(c: ChronicleEntry): string {
  if (c.quietKind === 'nothing') return `何もしない時間 ${c.minutes ?? 0}分`;
  if (c.quietKind === 'tomorrow') return `明日の小さな一歩: ${(c.steps ?? []).join('・')}`;
  const t = c.body.trim();
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/** その月の終わり（今月なら今日）の世界を見る（記憶の法則） */
function MonthWorld({ ym, onClose, input, today }: { ym: string | null; onClose: () => void; input: ReturnType<typeof useWorld>['input']; today: string }) {
  if (!ym) return null;
  const end = `${ym}-${String(daysInMonth(+ym.slice(0, 4), +ym.slice(5))).padStart(2, '0')}`;
  const asOf = end > today ? today : end;
  const w = computeWorld(input, asOf);
  const prevEnd = addDays(`${ym}-01`, -1);
  const prev = computeWorld(input, prevEnd);
  const grew = w.structures.filter((s, i) => s.level > (prev.structures[i]?.level ?? 0)).map((s) => s.name);
  return (
    <Sheet open onClose={onClose} title={`${ym.slice(0, 4)}年${+ym.slice(5)}月の世界`}>
      <div className="month-world">
        <WorldScene state={w} phase="day" />
      </div>
      <p className="sheet-lead">
        {ERA_LABELS[w.era].name}・{fmtShortDate(asOf)}時点
      </p>
      <ul className="region-lines">
        <li>森の木 {w.nature.trees}本（前の月末から +{w.nature.trees - prev.nature.trees}）</li>
        <li>道 第{w.paths.level}段階 · 足跡を残した日 {w.paths.days}日（+{w.paths.days - prev.paths.days}）</li>
        <li>記念碑 {w.monuments.length}基（+{w.monuments.length - prev.monuments.length}）</li>
        {grew.length > 0 && <li>この月に育った拠点: {grew.join('・')}</li>}
      </ul>
      <p className="fineprint">記録された日付をもとに、その時点の世界を計算し直しています。蓄えの蔵だけは、貯金の履歴がないため現在の値で描いています。</p>
    </Sheet>
  );
}
