import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { newId, nowIso, useStore } from '../data/store';
import { CURRENT_SCENARIO_ID, type AppData, type Dependency, type LifeDomain, type NodeRef } from '../data/types';
import type { GoalFeasibility } from '../engine';
import { ConfirmSheet, Meter, SectionHead, Segmented, SelectField, Sheet, StatusTag, TextField } from '../ui/controls';
import { WorldMap } from '../world/WorldMap';
import { useWorld } from '../world/useWorld';
import { fmtDate, fmtH, fmtYen } from '../ui/format';
import { Icon, DOMAIN_ICONS } from '../ui/Icon';
import { NewGoalSheet, deleteGoal } from '../ui/GoalEditor';
import { useScenarioModel } from '../ui/model';
import { navigate, useRoute } from '../ui/router';
import { ScreenHead } from '../ui/ScreenHead';
import { useWidth } from '../ui/viz';

interface MapNode {
  ref: NodeRef;
  key: string;
  label: string;
  x: number;
  y: number;
  r: number;
  icon?: string;
  progress: number | null;
  status?: 'ok' | 'bad' | 'done' | 'off';
  /** 目標が属する領域 */
  domainId?: string | null;
  /** ラベルをノードの上に置く（領域から外側に向ける） */
  labelAbove?: boolean;
}

const keyOf = (n: NodeRef) => `${n.kind}:${n.id}`;
/** 領域を並べる楕円の半径（縦長の画面に合わせて縦を長くする） */
const DOMAIN_RX = 112;
const DOMAIN_RY = 168;
const ORBIT = 72;

/** 自動配置: 領域を円周上に、目標をその領域の外側に並べる。ユーザーが動かした位置があればそれを使う */
function layout(data: AppData, feas: Map<string, GoalFeasibility>, plans: Record<string, { included: boolean }>): MapNode[] {
  const nodes: MapNode[] = [];
  const domains = [...data.domains].sort((a, b) => a.order - b.order);
  const n = Math.max(1, domains.length);
  const domainPos = new Map<string, { x: number; y: number; a: number }>();
  domains.forEach((d, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const auto = { x: Math.cos(a) * DOMAIN_RX, y: Math.sin(a) * DOMAIN_RY };
    const p = d.pos ?? auto;
    domainPos.set(d.id, { ...p, a });
    const goals = data.goals.filter((g) => g.domainId === d.id);
    const avg = goals.length ? goals.reduce((s, g) => s + g.progress, 0) / goals.length : null;
    // 領域のラベルは中心側（目標と反対側）に置く
    nodes.push({ ref: { kind: 'domain', id: d.id }, key: `domain:${d.id}`, label: d.name, x: p.x, y: p.y, r: 27, icon: d.icon, progress: avg, labelAbove: p.y > 20 });
  });
  const byDomain = new Map<string, typeof data.goals>();
  for (const g of data.goals) {
    const k = g.domainId && domainPos.has(g.domainId) ? g.domainId : '';
    byDomain.set(k, [...(byDomain.get(k) ?? []), g]);
  }
  for (const [domainId, goals] of byDomain) {
    const dp = domainPos.get(domainId);
    goals.forEach((g, i) => {
      let auto: { x: number; y: number };
      if (dp) {
        const spread = Math.min(1.4, 0.55 * (goals.length - 1));
        const a = dp.a + (goals.length === 1 ? 0 : -spread / 2 + (spread * i) / (goals.length - 1));
        auto = { x: dp.x + Math.cos(a) * ORBIT, y: dp.y + Math.sin(a) * ORBIT };
      } else {
        const a = (i / Math.max(1, goals.length)) * Math.PI * 2;
        auto = { x: Math.cos(a) * 40, y: Math.sin(a) * 40 };
      }
      const p = g.pos ?? auto;
      const f = feas.get(g.id);
      const labelAbove = dp ? p.y < dp.y - 10 : false;
      const status: MapNode['status'] = g.progress >= 100 ? 'done' : !plans[g.id]?.included ? 'off' : f && !f.fits ? 'bad' : 'ok';
      nodes.push({ ref: { kind: 'goal', id: g.id }, key: `goal:${g.id}`, label: g.name, x: p.x, y: p.y, r: 17, progress: f ? f.progress : g.progress, status, domainId: domainId || null, labelAbove });
    });
  }
  return nodes;
}

function shorten(s: string, n = 9): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function LifeMapScreen() {
  const { data, current, update } = useStore();
  const compact = data.settings.compactMoney;
  const { feasibility } = useScenarioModel(current);
  const feas = useMemo(() => new Map(feasibility.goals.map((g) => [g.goalId, g])), [feasibility]);
  const nodes = useMemo(() => layout(data, feas, current.goalPlans), [data, feas, current.goalPlans]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);

  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [connectFrom, setConnectFrom] = useState<NodeRef | null>(null);
  const [pendingDep, setPendingDep] = useState<{ from: NodeRef; to: NodeRef } | null>(null);
  const [addDomain, setAddDomain] = useState(false);
  const [editDomain, setEditDomain] = useState<LifeDomain | null>(null);
  const [newGoalDomain, setNewGoalDomain] = useState<string | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<NodeRef | null>(null);
  const [depAdd, setDepAdd] = useState(false);
  const route = useRoute();
  const viewParam = route.params.get('view') === 'graph' ? 'graph' : 'map';
  const [view, setView] = useState<'map' | 'graph'>(viewParam);
  // 案内（さがす）から「つながり図」を開いたときも切りかえる
  useEffect(() => setView(viewParam), [viewParam]);
  const { state: world } = useWorld();

  const nameOf = (r: NodeRef) => nodeMap.get(keyOf(r))?.label ?? '（削除済み）';

  const onTapNode = (ref: NodeRef) => {
    if (connectFrom) {
      if (keyOf(connectFrom) !== keyOf(ref)) setPendingDep({ from: connectFrom, to: ref });
      setConnectFrom(null);
      return;
    }
    setSelected(ref);
  };

  const saveDep = (from: NodeRef, to: NodeRef, label: string) => {
    const dup = data.dependencies.some((d) => keyOf(d.from) === keyOf(from) && keyOf(d.to) === keyOf(to));
    if (dup) return;
    update((d) => ({ ...d, dependencies: [...d.dependencies, { id: newId('dep-'), from, to, label: label.trim(), createdAt: nowIso() }] }), { success: 'つながりを追加しました' });
  };

  const moveNode = (ref: NodeRef, x: number, y: number) => {
    const pos = { x: Math.round(x), y: Math.round(y) };
    update((d) =>
      ref.kind === 'goal'
        ? { ...d, goals: d.goals.map((g) => (g.id === ref.id ? { ...g, pos } : g)) }
        : { ...d, domains: d.domains.map((g) => (g.id === ref.id ? { ...g, pos } : g)) },
    );
  };

  const resetLayout = () =>
    update(
      (d) => ({
        ...d,
        goals: d.goals.map((g) => (g.pos ? { ...g, pos: undefined } : g)),
        domains: d.domains.map((x) => (x.pos ? { ...x, pos: undefined } : x)),
      }),
      { undo: '配置を元に戻しました' },
    );

  // 領域ごとの俯瞰
  const domainRows = data.domains.map((d) => {
    const goals = data.goals.filter((g) => g.domainId === d.id);
    const rs = goals.map((g) => feas.get(g.id)).filter(Boolean) as GoalFeasibility[];
    const deadlines = rs.map((r) => r.deadline).filter(Boolean).sort();
    return {
      domain: d,
      goals,
      hours: rs.reduce((s, r) => s + r.weeklyHours, 0),
      budget: rs.reduce((s, r) => s + r.budget, 0),
      nearest: deadlines[0] ?? '',
      progress: goals.length ? goals.reduce((s, g) => s + g.progress, 0) / goals.length : null,
      issues: rs.filter((r) => !r.fits).length,
    };
  });

  return (
    <>
      <ScreenHead place="map" eyebrow="世界地図" title="人生の地図">
        <p className="screen-lead">人生の領域を、ひとつの地図として眺めます。場所を押すと、その領域の開拓計画・記録・つながりを確認できます。</p>
        <div className="sim-tabs">
          <Segmented
            label="地図の表示"
            options={[
              { value: 'map', label: '世界地図' },
              { value: 'graph', label: 'つながり図' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      </ScreenHead>

      {view === 'map' && (
        <section className="world-map-wrap" aria-label="世界地図">
          <WorldMap
            state={world}
            goals={data.goals}
            dependencies={data.dependencies}
            domainNames={Object.fromEntries(data.domains.map((d) => [d.id, d.name]))}
            selected={selected?.kind === 'domain' ? selected.id : null}
            onSelect={(id) => setSelected({ kind: 'domain', id })}
          />
          <p className="fineprint">
            霧の中の場所は、まだ開拓計画も記録もない「未踏の地」です。未熟さではなく、これからの可能性を表します。金色の道は、あなたが登録したつながり（連結の法則）です。
          </p>
        </section>
      )}

      {view === 'graph' && (
      <section className="map-wrap" aria-label="つながり図">
        {connectFrom && (
          <div className="map-banner" role="status">
            <Icon name="link" size={16} /> 「{shorten(nameOf(connectFrom), 12)}」からつなぐ先をタップ
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setConnectFrom(null)}>
              やめる
            </button>
          </div>
        )}
        <MapCanvas nodes={nodes} deps={data.dependencies} selected={selected} connectFrom={connectFrom} onTap={onTapNode} onMove={moveNode} onBackground={() => setSelected(null)} />
        <ul className="legend map-legend">
          <li className="legend-item">
            <span className="map-key map-key-ok" /> 両立
          </li>
          <li className="legend-item">
            <span className="map-key map-key-bad">!</span> 要調整
          </li>
          <li className="legend-item">
            <span className="map-key map-key-off" /> 計画外
          </li>
          <li className="legend-item">
            <span className="swatch swatch-line" style={{ background: 'var(--ink-2)' }} /> つながり（矢印の向きに影響）
          </li>
        </ul>
        <p className="fineprint">丸をタップすると詳細とつながりの説明を表示します。丸をドラッグすると配置を変更、背景のドラッグで移動、2本指で拡大・縮小できます。</p>
      </section>
      )}

      {/* 地図に足せるもの（どちらの表示でも同じ）。目標は「計画」→「目標」、または場所を押して追加する */}
      <div className="map-add">
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setAddDomain(true)}>
          <Icon name="plus" size={16} /> 領域（場所）を追加
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setDepAdd(true)} disabled={nodes.length < 2}>
          <Icon name="link" size={16} /> つながりを追加
        </button>
      </div>

      <section className="section">
        <SectionHead
          title="領域ごとの俯瞰"
          sub="現在の計画での値"
          action={
            <button type="button" className="section-link" onClick={resetLayout}>
              配置をリセット
            </button>
          }
        />
        <div className="domain-table" role="table" aria-label="領域ごとの目標・時間・予算">
          <div className="domain-tr domain-th" role="row">
            <span role="columnheader">領域</span>
            <span role="columnheader">目標</span>
            <span role="columnheader">週時間</span>
            <span role="columnheader">予算</span>
          </div>
          {domainRows.map((r) => (
            <button key={r.domain.id} type="button" className="domain-tr" role="row" onClick={() => setSelected({ kind: 'domain', id: r.domain.id })}>
              <span role="cell" className="domain-name">
                <Icon name={r.domain.icon} size={18} /> {r.domain.name}
                {r.issues > 0 && <span className="badge badge-bad" aria-label={`${r.issues}件 要調整`}>!{r.issues}</span>}
              </span>
              <span role="cell" className="num">
                {r.goals.length}件{r.progress !== null && <span className="muted"> · {Math.round(r.progress)}%</span>}
              </span>
              <span role="cell" className="num">{r.hours ? `${fmtH(r.hours)}h` : '—'}</span>
              <span role="cell" className="num">{r.budget ? fmtYen(r.budget, true) : '—'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead title="つながりの一覧" sub={`${data.dependencies.length}件`} />
        {data.dependencies.length === 0 ? (
          <p className="muted small">例: 「資格取得」→「転職」（応募の条件になる）、「転職」→「お金」（収入が変わる）のように、影響の向きを登録できます。</p>
        ) : (
          <ul className="list">
            {data.dependencies.map((d) => (
              <li key={d.id} className="list-row list-row-static">
                <span>
                  <span className="list-title">
                    {nameOf(d.from)} <Icon name="arrow" size={13} /> {nameOf(d.to)}
                  </span>
                  {d.label && <span className="list-sub">{d.label}</span>}
                </span>
                <button type="button" className="icon-btn" aria-label="つながりを削除" onClick={() => update((x) => ({ ...x, dependencies: x.dependencies.filter((y) => y.id !== d.id) }), { undo: 'つながりを削除しました' })}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NodeSheet
        node={selected}
        onClose={() => setSelected(null)}
        nameOf={nameOf}
        compact={compact}
        feas={feas}
        onConnect={(r) => {
          setSelected(null);
          setConnectFrom(r);
        }}
        onAddGoal={(domainId) => {
          setSelected(null);
          setNewGoalDomain(domainId);
        }}
        onEditDomain={(d) => {
          setSelected(null);
          setEditDomain(d);
        }}
        onDelete={(r) => setConfirmDelete(r)}
      />
      <DependencySheet pending={pendingDep} nameOf={nameOf} onClose={() => setPendingDep(null)} onSave={(l) => pendingDep && saveDep(pendingDep.from, pendingDep.to, l)} />
      <AddDependencySheet open={depAdd} onClose={() => setDepAdd(false)} nodes={nodes} onSave={saveDep} />
      <DomainSheet open={addDomain || !!editDomain} domain={editDomain} onClose={() => { setAddDomain(false); setEditDomain(null); }} />
      <NewGoalSheet open={newGoalDomain !== undefined} onClose={() => setNewGoalDomain(undefined)} scenarioId={CURRENT_SCENARIO_ID} domainId={newGoalDomain ?? null} />
      <ConfirmSheet
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === 'goal' ? '目標を削除' : '領域を削除'}
        danger
        confirmLabel="削除する"
        message={
          confirmDelete?.kind === 'goal'
            ? `「${nameOf(confirmDelete)}」を削除します。すべてのシナリオの計画値とつながりからも取り除かれます。`
            : `領域「${confirmDelete ? nameOf(confirmDelete) : ''}」を削除します。この領域の目標は「未分類」になり、削除されません。`
        }
        onConfirm={() => {
          const r = confirmDelete!;
          setSelected(null);
          update(
            (d) =>
              r.kind === 'goal'
                ? deleteGoal(d, r.id)
                : {
                    ...d,
                    domains: d.domains.filter((x) => x.id !== r.id),
                    goals: d.goals.map((g) => (g.domainId === r.id ? { ...g, domainId: null } : g)),
                    dependencies: d.dependencies.filter((x) => !(x.from.kind === 'domain' && x.from.id === r.id) && !(x.to.kind === 'domain' && x.to.id === r.id)),
                  },
            { undo: `「${nameOf(r)}」を削除しました` },
          );
        }}
      />
    </>
  );
}

interface View {
  x: number;
  y: number;
  k: number;
}

/** すべてのノード（ラベルを含む）が収まる拡大率と位置。ラベルは拡大しないため画面上の余白として確保する */
function fitView(nodes: MapNode[], width: number, height: number): View {
  if (nodes.length === 0) return { x: 0, y: 0, k: 1 };
  const minX = Math.min(...nodes.map((n) => n.x - n.r));
  const maxX = Math.max(...nodes.map((n) => n.x + n.r));
  const minY = Math.min(...nodes.map((n) => n.y - n.r));
  const maxY = Math.max(...nodes.map((n) => n.y + n.r));
  // 左右はラベルの半分の幅、上下はラベルの高さ、右は拡大・縮小ボタンの幅を空ける
  const padX = 50;
  const padY = 26;
  const reserve = 48;
  const k = Math.min(1.6, Math.max(0.4, Math.min((width - reserve - padX * 2) / (maxX - minX || 1), (height - padY * 2) / (maxY - minY || 1))));
  return { k, x: -((minX + maxX) / 2) * k - reserve / 2, y: -((minY + maxY) / 2) * k };
}

/** ノードとつながりの描画。1本指でパン・ノードのドラッグ、2本指でピンチズーム */
function MapCanvas({ nodes, deps, selected, connectFrom, onTap, onMove, onBackground }: { nodes: MapNode[]; deps: Dependency[]; selected: NodeRef | null; connectFrom: NodeRef | null; onTap: (r: NodeRef) => void; onMove: (r: NodeRef, x: number, y: number) => void; onBackground: () => void }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const height = Math.min(540, Math.max(360, width * 1.2));
  const fit = useMemo(() => fitView(nodes, width, height), [nodes, width, height]);
  const [view, setView] = useState<View>(fit);
  const touched = useRef(false);
  // 操作するまでは、画面の大きさに合わせて全体が収まるように表示する
  useEffect(() => {
    if (!touched.current) setView(fit);
  }, [fit]);
  const [dragPos, setDragPos] = useState<{ key: string; x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: 'pan' | 'node' | 'pinch'; startX: number; startY: number; view: View; node?: MapNode; moved: boolean; dist?: number; mid?: { x: number; y: number } } | null>(null);

  const cx = width / 2 + view.x;
  const cy = height / 2 + view.y;
  const toScreen = (x: number, y: number) => ({ x: cx + x * view.k, y: cy + y * view.k });
  const toWorld = (sx: number, sy: number) => ({ x: (sx - cx) / view.k, y: (sy - cy) / view.k });
  const posOf = (n: MapNode) => (dragPos && dragPos.key === n.key ? { x: dragPos.x, y: dragPos.y } : { x: n.x, y: n.y });
  const nodeMap = new Map(nodes.map((n) => [n.key, n]));
  const selKey = selected ? keyOf(selected) : null;

  const local = (e: RPointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: RPointerEvent, node?: MapNode) => {
    e.stopPropagation();
    touched.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', startX: 0, startY: 0, view, moved: true, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      setDragPos(null);
      return;
    }
    gesture.current = { mode: node ? 'node' : 'pan', startX: p.x, startY: p.y, view, node, moved: false };
  };
  const move = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.min(2.5, Math.max(0.4, g.view.k * (dist / (g.dist || 1))));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // 2本指の中心を基準に拡大縮小する
      const wx = (g.mid!.x - (width / 2 + g.view.x)) / g.view.k;
      const wy = (g.mid!.y - (height / 2 + g.view.y)) / g.view.k;
      setView({ k, x: mid.x - width / 2 - wx * k, y: mid.y - height / 2 - wy * k });
      return;
    }
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    if (g.mode === 'pan') setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    else if (g.mode === 'node' && g.node) {
      const w = toWorld(p.x, p.y);
      setDragPos({ key: g.node.key, x: w.x, y: w.y });
    }
  };
  const up = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      if (g?.mode === 'pinch') {
        const [rest] = [...pointers.current.values()];
        gesture.current = { mode: 'pan', startX: rest.x, startY: rest.y, view, moved: true };
      }
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (g.mode === 'node' && g.node) {
      if (g.moved && dragPos) onMove(g.node.ref, dragPos.x, dragPos.y);
      else if (!g.moved) onTap(g.node.ref);
    } else if (g.mode === 'pan' && !g.moved) onBackground();
    setDragPos(null);
  };
  const zoom = (factor: number) => {
    touched.current = true;
    zoomBy(factor);
  };
  const zoomBy = (factor: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * factor)), x: v.x * factor, y: v.y * factor }));

  const edgeLine = (a: MapNode, b: MapNode) => {
    const pa = toScreen(posOf(a).x, posOf(a).y);
    const pb = toScreen(posOf(b).x, posOf(b).y);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const ra = (a.r + 3) * view.k;
    const rb = (b.r + 7) * view.k;
    return { x1: pa.x + (dx / len) * ra, y1: pa.y + (dy / len) * ra, x2: pb.x - (dx / len) * rb, y2: pb.y - (dy / len) * rb, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2 };
  };

  return (
    <div ref={wrapRef} className="map-canvas" style={{ height }}>
      <svg
        width={width}
        height={height}
        className="map-svg"
        onPointerDown={(e) => down(e)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label={`人生マップ。領域${nodes.filter((n) => n.ref.kind === 'domain').length}件、目標${nodes.filter((n) => n.ref.kind === 'goal').length}件、つながり${deps.length}件。内容は下の一覧でも確認できます。`}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="map-arrow" />
          </marker>
          <marker id="arrow-hi" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="map-arrow-hi" />
          </marker>
        </defs>
        {/* 領域と目標の所属（つながりとは別の、薄い線） */}
        {nodes
          .filter((n) => n.ref.kind === 'goal')
          .map((n) => {
            const g = n.domainId ? nodeMap.get(`domain:${n.domainId}`) : undefined;
            if (!g) return null;
            const a = toScreen(posOf(n).x, posOf(n).y);
            const b = toScreen(posOf(g).x, posOf(g).y);
            return <line key={`m-${n.key}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="map-member" />;
          })}
        {deps.map((d) => {
          const a = nodeMap.get(keyOf(d.from));
          const b = nodeMap.get(keyOf(d.to));
          if (!a || !b) return null;
          const l = edgeLine(a, b);
          const hi = selKey !== null && (selKey === a.key || selKey === b.key);
          return (
            <g key={d.id}>
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`map-edge${hi ? ' is-hi' : ''}`} markerEnd={`url(#${hi ? 'arrow-hi' : 'arrow'})`} />
              {d.label && (hi || view.k > 1.3) && (
                <text x={l.mx} y={l.my - 4} className={`map-edge-label${hi ? ' is-hi' : ''}`} textAnchor="middle">
                  {shorten(d.label, 10)}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = toScreen(posOf(n).x, posOf(n).y);
          const r = n.r * view.k;
          const isSel = selKey === n.key;
          const isFrom = connectFrom && keyOf(connectFrom) === n.key;
          const circ = 2 * Math.PI * (r + 3);
          return (
            <g
              key={n.key}
              className={`map-node map-${n.ref.kind}${isSel ? ' is-sel' : ''}${isFrom ? ' is-from' : ''}${n.status ? ` st-${n.status}` : ''}`}
              transform={`translate(${p.x},${p.y})`}
              onPointerDown={(e) => down(e, n)}
              role="button"
              tabIndex={0}
              aria-label={`${n.ref.kind === 'domain' ? '領域' : '目標'} ${n.label}${n.progress !== null ? ` 進捗${Math.round(n.progress)}%` : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap(n.ref);
                }
              }}
            >
              <circle r={Math.max(r + 10, 22)} className="map-hit" />
              <circle r={r} className="map-disc" />
              {n.progress !== null && n.progress > 0 && (
                <circle r={r + 3} className="map-progress" strokeDasharray={`${(circ * n.progress) / 100} ${circ}`} transform="rotate(-90)" />
              )}
              {n.ref.kind === 'domain' ? (
                <g transform={`translate(${-11 * view.k},${-11 * view.k}) scale(${view.k * 0.92})`} className="map-icon">
                  <Icon name={n.icon ?? 'dot'} size={24} stroke={1.8} />
                </g>
              ) : n.status === 'bad' ? (
                <text y={4 * view.k} className="map-mark" textAnchor="middle" style={{ fontSize: 13 * view.k }}>
                  !
                </text>
              ) : n.status === 'done' ? (
                <text y={4 * view.k} className="map-mark" textAnchor="middle" style={{ fontSize: 12 * view.k }}>
                  ✓
                </text>
              ) : null}
              {view.k > 0.3 && (
                <text y={n.labelAbove ? -r - 8 : r + 15} className={`map-label${n.ref.kind === 'domain' ? ' map-label-domain' : ''}`} textAnchor="middle">
                  {shorten(n.label, n.ref.kind === 'domain' ? 6 : 8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="map-zoom">
        <button type="button" className="icon-btn" aria-label="拡大" onClick={() => zoom(1.25)}>
          <Icon name="plus" size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="縮小" onClick={() => zoom(0.8)}>
          <Icon name="minus" size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="全体を表示" onClick={() => {
            touched.current = false;
            setView(fit);
          }}>
          <Icon name="focus" size={18} />
        </button>
      </div>
    </div>
  );
}

function NodeSheet({ node, onClose, nameOf, compact, feas, onConnect, onAddGoal, onEditDomain, onDelete }: { node: NodeRef | null; onClose: () => void; nameOf: (r: NodeRef) => string; compact: boolean; feas: Map<string, GoalFeasibility>; onConnect: (r: NodeRef) => void; onAddGoal: (domainId: string) => void; onEditDomain: (d: LifeDomain) => void; onDelete: (r: NodeRef) => void }) {
  const { data, update } = useStore();
  const { state: world } = useWorld();
  if (!node) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const deps = data.dependencies.filter((d) => keyOf(d.from) === keyOf(node) || keyOf(d.to) === keyOf(node));
  const depList = deps.length > 0 && (
    <div>
      <h3 className="subhead">つながり</h3>
      <ul className="list">
        {deps.map((d) => (
          <li key={d.id} className="list-row list-row-static">
            <span>
              <span className="list-title">
                {nameOf(d.from)} <Icon name="arrow" size={13} /> {nameOf(d.to)}
              </span>
              {d.label && <span className="list-sub">{d.label}</span>}
            </span>
            <button type="button" className="icon-btn" aria-label="つながりを削除" onClick={() => update((x) => ({ ...x, dependencies: x.dependencies.filter((y) => y.id !== d.id) }), { undo: 'つながりを削除しました' })}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (node.kind === 'domain') {
    const domain = data.domains.find((d) => d.id === node.id);
    const structure = world.structures.find((x) => x.domainId === node.id);
    if (!domain) return null;
    const goals = data.goals.filter((g) => g.domainId === domain.id);
    const rs = goals.map((g) => feas.get(g.id)).filter(Boolean) as GoalFeasibility[];
    return (
      <Sheet
        open
        onClose={onClose}
        title={
          <>
            <Icon name={domain.icon} size={20} /> {domain.name}
          </>
        }
        footer={
          <div className="btn-row btn-row-wrap">
            <button type="button" className="btn btn-ghost" onClick={() => onConnect(node)}>
              <Icon name="link" size={18} /> つなぐ
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onEditDomain(domain)}>
              <Icon name="edit" size={18} /> 編集
            </button>
            <button type="button" className="btn btn-ghost btn-danger-text" aria-label="領域を削除" onClick={() => onDelete(node)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        }
      >
        <div className="stack-m">
          {domain.note && <p className="sheet-lead">{domain.note}</p>}
          {structure && (
            <div className="place-structure">
              <p className="place-structure-name">
                {structure.name} · {structure.level === 0 ? 'まだ可能性として眠っている' : `第${structure.level}段階`}
              </p>
              <p className="small">{structure.basis}</p>
              {structure.next && <p className="small muted">{structure.next}</p>}
            </div>
          )}
          <dl className="stats">
            <div className="stat">
              <dt>目標</dt>
              <dd className="num">{goals.length}件</dd>
            </div>
            <div className="stat">
              <dt>必要な時間</dt>
              <dd className="num">{fmtH(rs.reduce((s, r) => s + r.weeklyHours, 0))}h/週</dd>
            </div>
            <div className="stat">
              <dt>予算</dt>
              <dd className="num">{fmtYen(rs.reduce((s, r) => s + r.budget, 0), compact)}</dd>
            </div>
            <div className="stat">
              <dt>平均の進捗</dt>
              <dd className="num">{goals.length ? `${Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length)}%` : '—'}</dd>
            </div>
          </dl>
          {goals.length > 0 && (
            <ul className="list">
              {goals.map((g) => {
                const r = feas.get(g.id);
                return (
                  <li key={g.id} className="list-row list-row-static">
                    <span className="grow">
                      <span className="list-title">{g.name}</span>
                      <span className="list-sub">{r?.deadline ? `期限 ${fmtDate(r.deadline)}` : '期限 未設定'}</span>
                      <Meter value={g.progress} label={`${g.name}の進捗`} />
                    </span>
                    {r ? r.fits ? <StatusTag tone="good">両立</StatusTag> : <StatusTag tone="bad">要調整</StatusTag> : <StatusTag tone="neutral">計画外</StatusTag>}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => onAddGoal(domain.id)}>
            <Icon name="plus" size={18} /> この領域に開拓計画を立てる
          </button>
          {depList}
        </div>
      </Sheet>
    );
  }

  const goal = data.goals.find((g) => g.id === node.id);
  if (!goal) return null;
  const r = feas.get(goal.id);
  const domain = data.domains.find((d) => d.id === goal.domainId);
  return (
    <Sheet
      open
      onClose={onClose}
      title={goal.name}
      footer={
        <div className="btn-row btn-row-wrap">
          <button type="button" className="btn btn-ghost" onClick={() => onConnect(node)}>
            <Icon name="link" size={18} /> つなぐ
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate('sim', 'goals');
            }}
          >
            <Icon name="sim" size={18} /> 計画を編集
          </button>
          <button type="button" className="btn btn-ghost btn-danger-text" aria-label="目標を削除" onClick={() => onDelete(node)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      }
    >
      <div className="stack-m">
        <p className="sheet-lead">
          {domain?.name ?? '未分類'}
          {goal.completionCriteria && ` · 完了条件: ${goal.completionCriteria}`}
        </p>
        <div>
          <div className="row">
            <span className="small">進捗</span>
            <span className="num small">{goal.progress}%</span>
          </div>
          <Meter value={goal.progress} label="進捗" />
        </div>
        {r ? (
          <>
            <dl className="stats">
              <div className="stat">
                <dt>週間時間</dt>
                <dd className="num">{fmtH(r.weeklyHours)}h</dd>
              </div>
              <div className="stat">
                <dt>予算</dt>
                <dd className="num">{fmtYen(r.budget, compact)}</dd>
              </div>
              <div className="stat">
                <dt>期限</dt>
                <dd className="num">{r.deadline ? fmtDate(r.deadline) : '未設定'}</dd>
              </div>
              <div className="stat">
                <dt>優先順位</dt>
                <dd className="num">{r.priority}位</dd>
              </div>
            </dl>
            {r.fits ? <StatusTag tone="good">現在の計画の時間・予算に収まっています</StatusTag> : <StatusTag tone="bad">時間・予算・期限のいずれかが足りません</StatusTag>}
          </>
        ) : (
          <StatusTag tone="neutral">現在の計画には含まれていません</StatusTag>
        )}
        {depList}
      </div>
    </Sheet>
  );
}

const LABEL_PRESETS = ['の条件になる', '収入が変わる', '時間が変わる', '支出が変わる', '後押しする'];

function DependencySheet({ pending, nameOf, onClose, onSave }: { pending: { from: NodeRef; to: NodeRef } | null; nameOf: (r: NodeRef) => string; onClose: () => void; onSave: (label: string) => void }) {
  const [label, setLabel] = useState('');
  const [last, setLast] = useState(pending);
  if (pending !== last) {
    setLast(pending);
    setLabel('');
  }
  return (
    <Sheet
      open={!!pending}
      onClose={onClose}
      title="つながりを追加"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            onSave(label);
            onClose();
          }}
        >
          追加する
        </button>
      }
    >
      {pending && (
        <div className="stack-m">
          <p className="dep-preview">
            <strong>{nameOf(pending.from)}</strong> <Icon name="arrow" size={16} /> <strong>{nameOf(pending.to)}</strong>
          </p>
          <div className="chips">
            {LABEL_PRESETS.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={label === p} onClick={() => setLabel(p)}>
                {p}
              </button>
            ))}
          </div>
          <TextField label="関係の説明（任意）" value={label} onChange={setLabel} placeholder="例: 応募の条件になる" maxLength={40} />
        </div>
      )}
    </Sheet>
  );
}

function AddDependencySheet({ open, onClose, nodes, onSave }: { open: boolean; onClose: () => void; nodes: MapNode[]; onSave: (from: NodeRef, to: NodeRef, label: string) => void }) {
  const options = nodes.map((n) => ({ value: n.key, label: `${n.ref.kind === 'domain' ? '［領域］' : ''}${n.label}` }));
  const [from, setFrom] = useState(options[0]?.value ?? '');
  const [to, setTo] = useState(options[1]?.value ?? '');
  const [label, setLabel] = useState('');
  const parse = (k: string): NodeRef => {
    const [kind, ...rest] = k.split(':');
    return { kind: kind as NodeRef['kind'], id: rest.join(':') };
  };
  const valid = from && to && from !== to;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="つながりを追加"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!valid}
          onClick={() => {
            onSave(parse(from), parse(to), label);
            setLabel('');
            onClose();
          }}
        >
          追加する
        </button>
      }
    >
      <div className="stack-m">
        <SelectField label="影響を与える側" value={from} onChange={setFrom} options={options} />
        <SelectField label="影響を受ける側" value={to} onChange={setTo} options={options} />
        {from === to && <p className="field-error">別のものを選んでください</p>}
        <TextField label="関係の説明（任意）" value={label} onChange={setLabel} placeholder="例: 収入が変わる" maxLength={40} />
      </div>
    </Sheet>
  );
}

function DomainSheet({ open, domain, onClose }: { open: boolean; domain: LifeDomain | null; onClose: () => void }) {
  const { update, data } = useStore();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('spark');
  const [note, setNote] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(domain?.name ?? '');
      setIcon(domain?.icon ?? 'spark');
      setNote(domain?.note ?? '');
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={domain ? '領域を編集' : '領域を追加'}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!name.trim()}
          onClick={() => {
            update(
              (d) =>
                domain
                  ? { ...d, domains: d.domains.map((x) => (x.id === domain.id ? { ...x, name: name.trim(), icon, note } : x)) }
                  : { ...d, domains: [...d.domains, { id: newId('d-'), name: name.trim(), icon, note, order: Math.max(0, ...data.domains.map((x) => x.order)) + 1 }] },
              { success: domain ? '保存しました' : '領域を追加しました' },
            );
            onClose();
          }}
        >
          保存
        </button>
      }
    >
      <div className="stack-m">
        <TextField label="領域の名前" value={name} onChange={setName} required maxLength={12} placeholder="例: 家族" />
        <div className="field">
          <span className="field-label">アイコン</span>
          <div className="icon-picker" role="radiogroup" aria-label="アイコン">
            {DOMAIN_ICONS.map((i) => (
              <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={i} className="icon-pick" onClick={() => setIcon(i)}>
                <Icon name={i} size={22} />
              </button>
            ))}
          </div>
        </div>
        <TextField label="メモ（任意）" value={note} onChange={setNote} multiline maxLength={200} />
      </div>
    </Sheet>
  );
}
