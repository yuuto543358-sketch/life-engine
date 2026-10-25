/**
 * 「どこに何があるか」の案内。やりたいことから、その画面のその場所へ移動する。
 * 場所の名前は、タブの名前（ホーム・地図・計画・記録・休む）と、画面の中の見出しで書く。
 */
import { navigate, type TabKey } from './router';

export interface GuideItem {
  /** やりたいこと（ふつうの言葉で） */
  label: string;
  /** どこにあるか（タブ › 画面の中の場所） */
  where: string[];
  /** 検索で見つかるようにする言葉 */
  keywords?: string;
  icon: string;
  tab: TabKey;
  sub?: string;
  params?: Record<string, string>;
  /** 画面の中の場所（要素の id） */
  at?: string;
}

export interface GuideGroup {
  title: string;
  items: GuideItem[];
}

export const GUIDE: GuideGroup[] = [
  {
    title: '毎日の記録',
    items: [
      { label: '今日の時間・お金・作業を記録する', where: ['ホーム', '今日の足跡'], keywords: '記録 足跡 実績 入力 つける 支出 使った', icon: 'lantern', tab: 'home', at: 'h-today' },
      { label: '日記や写真を残す', where: ['ホーム', '今日の足跡', '旅の記録'], keywords: '日記 写真 旅 メモ', icon: 'feather', tab: 'home', at: 'h-today' },
      { label: '過去の日記・できごとを見る', where: ['記録', '日記・できごと'], keywords: '年代記 ふりかえり 過去 履歴 節目', icon: 'hall', tab: 'log' },
      { label: '予定と実績の差を見る', where: ['記録', '予定と実績', '計画との差'], keywords: '統計 観測 差 比較 グラフ 推移 集計', icon: 'layers', tab: 'log', sub: 'observe', at: 'o-diff' },
      { label: '週ごとの記録の推移を見る', where: ['記録', '予定と実績', '週ごとの推移'], keywords: 'グラフ 推移 週', icon: 'calendar', tab: 'log', sub: 'observe', at: 'o-trend' },
    ],
  },
  {
    title: 'お金',
    items: [
      { label: '毎月の収入（手取り）を入れる', where: ['計画', 'お金', '収入と支出の内訳'], keywords: '給料 給与 手取り 収入 副業', icon: 'yen', tab: 'sim', sub: 'money', at: 'm-breakdown' },
      { label: '家賃・光熱費などの固定費を入れる', where: ['計画', 'お金', '収入と支出の内訳'], keywords: '固定費 家賃 光熱費 通信 保険 サブスク ローン 支出', icon: 'home', tab: 'sim', sub: 'money', at: 'm-breakdown' },
      { label: '食費などの変動費を入れる', where: ['計画', 'お金', '収入と支出の内訳'], keywords: '変動費 食費 日用品 交際費 支出', icon: 'note', tab: 'sim', sub: 'money', at: 'm-breakdown' },
      { label: '毎月の貯金・つみたてNISA・iDeCo を入れる', where: ['計画', 'お金', '収入と支出の内訳', '毎月の貯金・積立'], keywords: '貯金 積立 NISA ニーサ iDeCo イデコ 投資 預金', icon: 'coin', tab: 'sim', sub: 'money', at: 'm-breakdown' },
      { label: '今の貯金額を入れる', where: ['計画', 'お金', '貯金の目標'], keywords: '貯金額 残高 現在', icon: 'coin', tab: 'sim', sub: 'money', at: 'm-target' },
      { label: '目標までに毎月いくら貯めるか見る', where: ['計画', 'お金', '貯金の目標'], keywords: '毎月 貯める 必要 自動計算 目標額', icon: 'target', tab: 'sim', sub: 'money', at: 'm-target' },
      { label: 'ボーナスを登録する', where: ['計画', 'お金', 'ボーナス・臨時収入・臨時支出'], keywords: 'ボーナス 賞与 臨時収入 夏 冬', icon: 'spark', tab: 'sim', sub: 'money', at: 'm-oneoffs' },
      { label: 'ボーナスのうち貯金に回す割合を変える', where: ['計画', 'お金', '貯金の目標', 'ボーナスも見込んで計算'], keywords: 'ボーナス 割合 パーセント 賞与', icon: 'spark', tab: 'sim', sub: 'money', at: 'm-target' },
      { label: '旅行・家電などの臨時の出費を入れる', where: ['計画', 'お金', 'ボーナス・臨時収入・臨時支出'], keywords: '臨時支出 旅行 家電 出費 一時', icon: 'calendar', tab: 'sim', sub: 'money', at: 'm-oneoffs' },
      { label: '将来の貯金残高のグラフを見る', where: ['計画', 'お金', '将来の貯金残高'], keywords: 'グラフ 将来 残高 何年後', icon: 'upload', tab: 'sim', sub: 'money', at: 'm-projection' },
      { label: '想定の利回りを入れる', where: ['計画', 'お金', '想定利回り'], keywords: '利回り 年利 運用', icon: 'layers', tab: 'sim', sub: 'money', at: 'm-rate' },
    ],
  },
  {
    title: '時間',
    items: [
      { label: '1週間の時間の使い方を決める', where: ['計画', '時間'], keywords: '睡眠 仕事 通勤 家事 勉強 趣味 時間配分 自由時間', icon: 'clock', tab: 'sim', sub: 'time' },
    ],
  },
  {
    title: '目標（開拓計画）',
    items: [
      { label: '目標を立てる（時間をかける目標・お金を貯める目標）', where: ['計画', '目標'], keywords: '目標 開拓計画 追加 作る 資格 貯める 買う', icon: 'flag', tab: 'sim', sub: 'goals' },
      { label: '目標の優先順位・期限を変える', where: ['計画', '目標', '目標を押して開く'], keywords: '優先順位 期限 編集 変更', icon: 'edit', tab: 'sim', sub: 'goals' },
      { label: '目標が両立できるか確かめる', where: ['計画', '目標'], keywords: '両立 不足 足りない チェック', icon: 'check', tab: 'sim', sub: 'goals' },
      { label: '目標どうしのつながりを登録する', where: ['地図', 'つながり図'], keywords: 'つながり 関係 依存 リンク', icon: 'link', tab: 'map', params: { view: 'graph' } },
    ],
  },
  {
    title: '計画を比べる',
    items: [
      { label: '別のパターン（シナリオ）を作る', where: ['計画', '上の「編集中のシナリオ」を押す'], keywords: 'シナリオ 複製 パターン もしも', icon: 'copy', tab: 'sim', sub: 'time' },
      { label: 'パターンどうしを比べる', where: ['計画', '比べる'], keywords: '比較 シナリオ 違い', icon: 'swap', tab: 'sim', sub: 'compare' },
    ],
  },
  {
    title: '世界・休む',
    items: [
      { label: '建物や森がなぜこの姿なのか見る', where: ['ホーム', '世界のようす'], keywords: '世界 建物 拠点 段階 森 理由', icon: 'mountain', tab: 'home', at: 'h-status' },
      { label: '人生の領域を地図で見る', where: ['地図', '世界地図'], keywords: '地図 領域 全体', icon: 'map', tab: 'map', params: { view: 'map' } },
      { label: '過去の月の世界を見る', where: ['記録', '日記・できごと', '「この月の世界」'], keywords: '過去 月 世界 ふりかえり', icon: 'scroll', tab: 'log' },
      { label: 'ふりかえり・明日の準備をする', where: ['休む'], keywords: '静寂 休む ふりかえり 明日 準備 何もしない 日記', icon: 'moon', tab: 'quiet' },
    ],
  },
  {
    title: '設定・データ',
    items: [
      { label: 'ダークモード・文字の大きさ・動きを変える', where: ['設定', '表示'], keywords: 'ダークモード 暗い 文字 大きさ アニメーション 動き テーマ', icon: 'settings', tab: 'settings', at: 'set-display' },
      { label: 'データを書き出す・読み込む（バックアップ）', where: ['設定', 'バックアップ'], keywords: 'バックアップ 書き出し 読み込み 保存 機種変更 JSON', icon: 'download', tab: 'settings', at: 'set-backup' },
      { label: '見本（サンプル）のデータを消す', where: ['設定', 'サンプルデータ'], keywords: 'サンプル 見本 消す 削除', icon: 'trash', tab: 'settings', at: 'set-sample' },
      { label: '呼び名・最初の設定を変える', where: ['設定', 'あなたの情報'], keywords: '名前 初期設定 プロフィール', icon: 'people', tab: 'settings', at: 'set-profile' },
      { label: 'すべてのデータを消す', where: ['設定', '危険な操作'], keywords: '全削除 リセット 初期化', icon: 'alert', tab: 'settings', at: 'set-danger' },
    ],
  },
];

/** 5つの場所の案内（何ができるか） */
export const PLACES: { tab: TabKey; label: string; world: string; icon: string; what: string }[] = [
  { tab: 'home', label: 'ホーム', world: '世界の中心', icon: 'center', what: '今日の記録・次にやること・世界のようす' },
  { tab: 'map', label: '地図', world: '世界地図', icon: 'map', what: '人生の領域の全体・目標どうしのつながり' },
  { tab: 'sim', label: '計画', world: '開拓の間', icon: 'compass', what: '時間・お金（収入・支出・貯金・ボーナス）・目標・比べる' },
  { tab: 'log', label: '記録', world: '年代記の館', icon: 'hall', what: '日記・写真・できごと・予定と実績の差' },
  { tab: 'quiet', label: '休む', world: '静寂の地', icon: 'moon', what: 'ふりかえり・明日の準備・何もしない時間' },
  { tab: 'settings', label: '設定', world: '世界の調律', icon: 'settings', what: '表示・バックアップ・データの管理' },
];

/** ひらがな・カタカナ・大文字小文字の違いを気にせず探せるようにする */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function searchGuide(query: string): GuideGroup[] {
  const words = query.split(/\s+/).map(normalize).filter(Boolean);
  if (words.length === 0) return GUIDE;
  return GUIDE.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      const hay = normalize(`${it.label}${it.where.join('')}${it.keywords ?? ''}${g.title}`);
      return words.every((w) => hay.includes(w));
    }),
  })).filter((g) => g.items.length > 0);
}

/** 画面の中の場所まで動かして、少しのあいだ光らせる */
export function scrollToAnchor(id: string) {
  const start = performance.now();
  const tryScroll = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (performance.now() - start < 2500) requestAnimationFrame(tryScroll);
      return;
    }
    const reduced = document.documentElement.dataset.reduced === 'true';
    // 画面の切りかわりの動きが落ち着いてから動かす
    setTimeout(() => {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
      setTimeout(() => el.classList.remove('is-flash'), 2200);
    }, 120);
  };
  requestAnimationFrame(tryScroll);
}

export function goTo(item: Pick<GuideItem, 'tab' | 'sub' | 'params' | 'at'>) {
  navigate(item.tab, item.sub ?? '', item.params ?? {});
  if (item.at) scrollToAnchor(item.at);
}

// ---- 案内を開く（どの画面からでも） ----
const listeners = new Set<(open: boolean) => void>();
export function openGuide() {
  listeners.forEach((l) => l(true));
}
export function onGuide(fn: (open: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
