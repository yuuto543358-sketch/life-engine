import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TIME_CATEGORY_KEYS, type TimeCategoryKey } from '../data/types';
import { TIME_LABELS } from '../engine/labels';
import { fmtH, fmtMonth, fmtYen } from './format';

export const CAT_COLOR: Record<TimeCategoryKey | 'free', string> = {
  sleep: 'var(--c-sleep)',
  work: 'var(--c-work)',
  commute: 'var(--c-commute)',
  housework: 'var(--c-housework)',
  study: 'var(--c-study)',
  hobby: 'var(--c-hobby)',
  other: 'var(--c-other)',
  free: 'var(--c-free)',
};

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type CellKind = TimeCategoryKey | 'free' | 'goal' | 'over' | 'outside';

/**
 * 1週間 = 168マス（1マス = 1時間）で時間配分を見せる。
 * 小数の時間は累積値を四捨五入してマスに割り当てる（正確な値は凡例・数値で表示する）。
 */
export function HourGrid({ items, totalHours, goalFreeHours = 0, compact }: { items: { key: TimeCategoryKey; weeklyHours: number }[]; totalHours: number; goalFreeHours?: number; compact?: boolean }) {
  const cells = useMemo(() => {
    const out: CellKind[] = [];
    let cum = 0;
    for (const it of items) {
      const startCell = Math.round(cum);
      cum += it.weeklyHours;
      const endCell = Math.round(cum);
      for (let i = startCell; i < endCell; i++) out.push(it.key);
    }
    const allocated = out.length;
    const total = Math.round(totalHours);
    if (allocated <= total) {
      const goalCells = Math.min(total - allocated, Math.round(goalFreeHours));
      for (let i = 0; i < goalCells; i++) out.push('goal');
      while (out.length < total) out.push('free');
      while (out.length < 168) out.push('outside');
    } else {
      // 総時間を超えた分は「不足」として赤で示す
      for (let i = total; i < allocated; i++) out[i] = 'over';
      while (out.length % 24 !== 0) out.push('outside');
    }
    return out;
  }, [items, totalHours, goalFreeHours]);

  const allocated = items.reduce((s, i) => s + i.weeklyHours, 0);
  const free = totalHours - allocated;
  const label = `1週間${totalHours}時間のうち、配分済み${fmtH(allocated)}時間、${free >= 0 ? `自由時間${fmtH(free)}時間` : `${fmtH(-free)}時間不足`}`;

  return (
    <div className={`hourgrid${compact ? ' hourgrid-compact' : ''}`} role="img" aria-label={label}>
      {cells.map((c, i) => (
        <span key={i} className={`hg-cell hg-${c}`} style={c in CAT_COLOR && c !== 'free' ? { background: CAT_COLOR[c as TimeCategoryKey] } : undefined} />
      ))}
    </div>
  );
}

export function TimeLegend({ items, freeHours, goalFreeHours }: { items: { key: TimeCategoryKey; weeklyHours: number }[]; freeHours: number; goalFreeHours?: number }) {
  return (
    <ul className="legend">
      {items
        .filter((i) => i.weeklyHours > 0)
        .map((i) => (
          <li key={i.key} className="legend-item">
            <span className="swatch" style={{ background: CAT_COLOR[i.key] }} />
            {TIME_LABELS[i.key]}
            <span className="num legend-num">{fmtH(i.weeklyHours)}h</span>
          </li>
        ))}
      {goalFreeHours !== undefined && goalFreeHours > 0 && (
        <li className="legend-item">
          <span className="swatch swatch-goal" />
          目標で使う自由時間
          <span className="num legend-num">{fmtH(goalFreeHours)}h</span>
        </li>
      )}
      <li className="legend-item">
        <span className={`swatch ${freeHours >= 0 ? 'swatch-free' : 'swatch-over'}`} />
        {freeHours >= 0 ? '自由時間' : '不足'}
        <span className="num legend-num">{fmtH(freeHours >= 0 ? Math.max(0, freeHours - (goalFreeHours ?? 0)) : -freeHours)}h</span>
      </li>
    </ul>
  );
}

export interface FlowSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  pattern?: 'over';
}

/** 収入の内訳を1本の帯で見せる。超過分は帯の外側に赤で示す */
export function FlowBar({ total, segments, ariaLabel }: { total: number; segments: FlowSegment[]; ariaLabel: string }) {
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const scale = Math.max(total, sum, 1);
  return (
    <div className="flowbar" role="img" aria-label={ariaLabel}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.key}
            className={`flow-seg${s.pattern === 'over' ? ' flow-over' : ''}`}
            style={{ width: `${(s.value / scale) * 100}%`, background: s.pattern === 'over' ? undefined : s.color }}
            title={`${s.label}`}
          />
        ))}
      {total > 0 && sum > total && <span className="flow-limit" style={{ left: `${(total / scale) * 100}%` }} />}
    </div>
  );
}

export function Legend({ items }: { items: { label: ReactNode; color?: string; value?: ReactNode; kind?: 'line' | 'over' | 'free' }[] }) {
  return (
    <ul className="legend">
      {items.map((it, i) => (
        <li key={i} className="legend-item">
          <span className={`swatch${it.kind === 'line' ? ' swatch-line' : it.kind === 'over' ? ' swatch-over' : it.kind === 'free' ? ' swatch-free' : ''}`} style={it.color ? { background: it.color } : undefined} />
          {it.label}
          {it.value !== undefined && <span className="num legend-num">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface LineSeries {
  id: string;
  label: string;
  values: { ym: string; v: number }[];
  color: string;
  ghost?: boolean;
}

function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/** 貯金残高の推移。指でなぞると各月の値を表示する */
export function ProjectionChart({ series, target, deadline, compact }: { series: LineSeries[]; target?: number; deadline?: string | null; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = compact ? 150 : 210;
  const pad = { l: 8, r: 8, t: 14, b: 24 };
  const main = series.find((s) => !s.ghost) ?? series[0];
  const n = main?.values.length ?? 0;

  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = series.flatMap((s) => s.values.map((p) => p.v));
    if (target && target > 0) vals.push(target);
    vals.push(0);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const step = niceStep(hi - lo || 1, 3);
    const yMin = Math.floor(lo / step) * step;
    const yMax = Math.ceil(hi / step) * step || step;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
    return { yMin, yMax, ticks };
  }, [series, target]);

  if (!main || n === 0) return null;
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const path = (vals: { v: number }[]) => vals.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${path(main.values)}L${x(n - 1).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}Z`;
  const deadlineIdx = deadline ? main.values.findIndex((p) => p.ym === deadline) : -1;
  const years = main.values.map((p, i) => ({ p, i })).filter(({ p, i }) => p.ym.endsWith('-01') && i > 0);
  const step = Math.max(1, Math.ceil(years.length / Math.max(1, Math.floor(iw / 64))));

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (clientX - rect.left - pad.l) / iw;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };
  const hv = hover !== null ? main.values[hover] : null;

  return (
    <div
      ref={ref}
      className="chart"
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg width={width} height={height} role="img" aria-label={`${main.label}の推移。${fmtMonth(main.values[0].ym)}末 ${fmtYen(main.values[0].v)}、${fmtMonth(main.values[n - 1].ym)}末 ${fmtYen(main.values[n - 1].v)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-line' : 'grid-line'} />
            <text x={width - pad.r} y={y(t) - 4} className="tick" textAnchor="end">
              {fmtYen(t, true)}
            </text>
          </g>
        ))}
        {years.filter((_, i) => i % step === 0).map(({ p, i }) => (
          <text key={p.ym} x={x(i)} y={height - 6} className="tick" textAnchor="middle">
            {p.ym.slice(0, 4)}
          </text>
        ))}
        {target && target > 0 && target <= yMax && (
          <g>
            <line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} className="target-line" />
            <text x={pad.l + 2} y={y(target) - 5} className="tick tick-strong">
              目標 {fmtYen(target, true)}
            </text>
          </g>
        )}
        {deadlineIdx >= 0 && (
          <g>
            <line x1={x(deadlineIdx)} x2={x(deadlineIdx)} y1={pad.t} y2={pad.t + ih} className="deadline-line" />
            <text x={x(deadlineIdx) + (x(deadlineIdx) > width - 60 ? -4 : 4)} y={pad.t + 10} className="tick tick-strong" textAnchor={x(deadlineIdx) > width - 60 ? 'end' : 'start'}>
              期限
            </text>
          </g>
        )}
        <path d={area} className="area" style={{ fill: main.color }} />
        {series
          .filter((s) => s.ghost)
          .map((s) => (
            <path key={s.id} d={path(s.values)} className="line line-ghost" />
          ))}
        <path d={path(main.values)} className="line" style={{ stroke: main.color }} />
        <circle cx={x(n - 1)} cy={y(main.values[n - 1].v)} r={4} className="end-dot" style={{ fill: main.color }} />
        {hover !== null && hv && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
            <circle cx={x(hover)} cy={y(hv.v)} r={5} className="end-dot" style={{ fill: main.color }} />
          </g>
        )}
      </svg>
      {hover !== null && hv && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}>
          <span className="chart-tip-label">{fmtMonth(hv.ym)}末</span>
          <span className="num">{fmtYen(hv.v)}</span>
          {series
            .filter((s) => s.ghost)
            .map((s) => (
              <span key={s.id} className="chart-tip-sub">
                {s.label} <span className="num">{fmtYen(s.values[hover]?.v ?? 0, true)}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/** 期間ごとの棒グラフ。計画値があれば横線で示す */
export function PeriodBars({ points, planned, format, color = 'var(--c-sleep)' }: { points: { label: string; value: number; count: number }[]; planned?: number; format: (v: number) => string; color?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 140;
  const pad = { t: 16, b: 22 };
  const max = Math.max(planned ?? 0, ...points.map((p) => p.value), 1);
  const bw = width / points.length;
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={points.map((p) => `${p.label}: ${format(p.value)}`).join('、')}>
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="axis-line" />
        {points.map((p, i) => {
          const h = y(0) - y(p.value);
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={i * bw} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              {p.count > 0 ? (
                <rect x={i * bw + bw * 0.22} y={y(p.value)} width={bw * 0.56} height={Math.max(h, 1)} rx={Math.min(4, bw * 0.2)} style={{ fill: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
              ) : (
                <rect x={i * bw + bw * 0.22} y={y(0) - 2} width={bw * 0.56} height={2} className="bar-empty" />
              )}
              <text x={i * bw + bw / 2} y={height - 6} className="tick" textAnchor="middle">
                {p.label}
              </text>
            </g>
          );
        })}
        {planned !== undefined && planned > 0 && (
          <g>
            <line x1={0} x2={width} y1={y(planned)} y2={y(planned)} className="target-line" />
            <text x={2} y={y(planned) - 4} className="tick tick-strong">
              計画 {format(planned)}
            </text>
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(hover * bw + bw / 2, 60), width - 60), top: 0 }}>
          <span className="chart-tip-label">{points[hover].label}</span>
          <span className="num">{points[hover].count > 0 ? format(points[hover].value) : '記録なし'}</span>
        </div>
      )}
    </div>
  );
}

/** 計画（目印）と実績（帯）を1行で比べる */
export function Bullet({ planned, actual, color }: { planned: number; actual: number; color: string }) {
  const max = Math.max(planned, actual, 0.0001) * 1.08;
  return (
    <div className="bullet" aria-hidden="true">
      <div className="bullet-track" />
      <div className="bullet-fill" style={{ width: `${(actual / max) * 100}%`, background: color }} />
      {planned > 0 && <div className="bullet-mark" style={{ left: `${(planned / max) * 100}%` }} />}
    </div>
  );
}

export function timeItemsOrdered<T extends { key: TimeCategoryKey }>(items: T[]): T[] {
  return TIME_CATEGORY_KEYS.map((k) => items.find((i) => i.key === k)!).filter(Boolean);
}
