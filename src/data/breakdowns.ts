/**
 * お金の内訳の項目一覧（収入・固定費・変動費・毎月の貯金や積立）。
 * 初期項目は削除できず、使わない項目は 0 円のままにする。ユーザーは自由に項目を追加できる。
 */
import type { BreakdownKind, FinancialProfile, MoneyItem } from './types';

export interface BreakdownGroup {
  id: string;
  label: string;
}

export interface BreakdownPreset {
  id: string;
  label: string;
  group: string;
  /** スライダーの上限（円/月） */
  max: number;
  /** 入力欄の補足 */
  hint?: string;
}

export interface BreakdownDef {
  kind: BreakdownKind;
  title: string;
  /** 内訳の合計を保存する項目 */
  totalKey: 'monthlyIncome' | 'fixedCosts' | 'variableCosts' | 'monthlySavings';
  itemsKey: 'incomeItems' | 'fixedItems' | 'variableItems' | 'savingsItems';
  /** 内訳がない古いデータの合計額を入れる項目 */
  fallbackId: string;
  groups: BreakdownGroup[];
  presets: BreakdownPreset[];
  /** 以前の版の項目IDとグループの対応 */
  legacyGroups?: Record<string, string>;
  /** 追加するときの名前の候補 */
  ideas: string[];
}

export const BREAKDOWNS: Record<BreakdownKind, BreakdownDef> = {
  income: {
    kind: 'income',
    title: '月の手取り収入',
    totalKey: 'monthlyIncome',
    itemsKey: 'incomeItems',
    fallbackId: 'in-salary',
    groups: [
      { id: 'in-g-work', label: '仕事' },
      { id: 'in-g-other', label: '副業・手当・その他' },
    ],
    presets: [
      { id: 'in-salary', label: '給与（手取り）', group: 'in-g-work', max: 1000000, hint: '税金・社会保険料が引かれた後の金額' },
      { id: 'in-partner', label: '家族の収入（家計に入れる分）', group: 'in-g-work', max: 1000000 },
      { id: 'in-side', label: '副業', group: 'in-g-other', max: 300000 },
      { id: 'in-allowance', label: '児童手当などの手当', group: 'in-g-other', max: 100000 },
      { id: 'in-pension', label: '年金', group: 'in-g-other', max: 300000 },
      { id: 'in-other', label: 'その他の収入', group: 'in-g-other', max: 300000 },
    ],
    ideas: ['家賃収入', '配当・分配金', '仕送り（受け取り）', 'ポイント還元'],
  },
  fixed: {
    kind: 'fixed',
    title: '固定費',
    totalKey: 'fixedCosts',
    itemsKey: 'fixedItems',
    fallbackId: 'fx-other',
    groups: [
      { id: 'fx-g-home', label: '住まい' },
      { id: 'fx-g-util', label: '水道光熱費' },
      { id: 'fx-g-comm', label: '通信' },
      { id: 'fx-g-ins', label: '保険' },
      { id: 'fx-g-car', label: '車・交通' },
      { id: 'fx-g-loan', label: 'ローン・返済' },
      { id: 'fx-g-edu', label: '子ども・教育' },
      { id: 'fx-g-sub', label: 'サブスク・会費' },
      { id: 'fx-g-other', label: 'その他' },
    ],
    presets: [
      { id: 'fx-rent', label: '家賃', group: 'fx-g-home', max: 300000 },
      { id: 'fx-mortgage', label: '住宅ローン', group: 'fx-g-home', max: 300000 },
      { id: 'fx-mgmt', label: '管理費・修繕積立金', group: 'fx-g-home', max: 50000 },
      { id: 'fx-parking', label: '駐車場代', group: 'fx-g-home', max: 50000 },
      { id: 'fx-electric', label: '電気代', group: 'fx-g-util', max: 30000 },
      { id: 'fx-gas', label: 'ガス代', group: 'fx-g-util', max: 20000 },
      { id: 'fx-water', label: '水道代', group: 'fx-g-util', max: 20000, hint: '2か月ごとの請求は、半分にして入力' },
      { id: 'fx-phone', label: 'スマホ', group: 'fx-g-comm', max: 30000 },
      { id: 'fx-net', label: 'インターネット回線', group: 'fx-g-comm', max: 15000 },
      { id: 'fx-life', label: '生命保険', group: 'fx-g-ins', max: 50000 },
      { id: 'fx-medical', label: '医療保険・がん保険', group: 'fx-g-ins', max: 30000 },
      { id: 'fx-carins', label: '自動車保険', group: 'fx-g-ins', max: 30000 },
      { id: 'fx-houseins', label: '火災保険・その他の保険', group: 'fx-g-ins', max: 20000, hint: '年払いは 12 で割って入力' },
      { id: 'fx-transport', label: '定期代', group: 'fx-g-car', max: 50000 },
      { id: 'fx-carloan', label: '車のローン', group: 'fx-g-car', max: 100000 },
      { id: 'fx-carcost', label: '車の税金・車検（月割り）', group: 'fx-g-car', max: 30000, hint: '年額を 12 で割って入力' },
      { id: 'fx-scholarship', label: '奨学金の返済', group: 'fx-g-loan', max: 50000 },
      { id: 'fx-loan', label: 'その他のローン', group: 'fx-g-loan', max: 100000 },
      { id: 'fx-school', label: '保育料・学費', group: 'fx-g-edu', max: 100000 },
      { id: 'fx-lesson', label: '習い事・塾', group: 'fx-g-edu', max: 50000 },
      { id: 'fx-subscription', label: '動画・音楽などのサブスク', group: 'fx-g-sub', max: 20000 },
      { id: 'fx-membership', label: 'ジム・会費', group: 'fx-g-sub', max: 30000 },
      { id: 'fx-media', label: '新聞・NHK受信料', group: 'fx-g-sub', max: 10000 },
      { id: 'fx-pocket', label: 'お小遣い・仕送り', group: 'fx-g-other', max: 100000 },
      { id: 'fx-other', label: 'その他の固定費', group: 'fx-g-other', max: 100000 },
    ],
    legacyGroups: { 'fx-utilities': 'fx-g-util', 'fx-insurance': 'fx-g-ins' },
    ideas: ['クラウドストレージ', 'ペット保険', '介護費用', 'クレジットカード年会費'],
  },
  variable: {
    kind: 'variable',
    title: '変動費',
    totalKey: 'variableCosts',
    itemsKey: 'variableItems',
    fallbackId: 'vr-other',
    groups: [
      { id: 'vr-g-food', label: '食費' },
      { id: 'vr-g-life', label: '暮らし' },
      { id: 'vr-g-fun', label: '楽しみ・人づきあい' },
      { id: 'vr-g-move', label: '移動' },
      { id: 'vr-g-other', label: '家族・その他' },
    ],
    presets: [
      { id: 'vr-grocery', label: '食料品（自炊）', group: 'vr-g-food', max: 100000 },
      { id: 'vr-eatout', label: '外食', group: 'vr-g-food', max: 50000 },
      { id: 'vr-cafe', label: 'カフェ・おやつ・飲み物', group: 'vr-g-food', max: 20000 },
      { id: 'vr-daily', label: '日用品', group: 'vr-g-life', max: 30000 },
      { id: 'vr-clothes', label: '衣服・靴', group: 'vr-g-life', max: 50000 },
      { id: 'vr-beauty', label: '美容・理容', group: 'vr-g-life', max: 30000 },
      { id: 'vr-medical', label: '医療費・薬', group: 'vr-g-life', max: 30000 },
      { id: 'vr-furniture', label: '家具・家電（月割り）', group: 'vr-g-life', max: 30000 },
      { id: 'vr-social', label: '交際費', group: 'vr-g-fun', max: 50000 },
      { id: 'vr-hobby', label: '趣味・娯楽', group: 'vr-g-fun', max: 50000 },
      { id: 'vr-books', label: '本・学習', group: 'vr-g-fun', max: 30000 },
      { id: 'vr-travel', label: '旅行・レジャー（月割り）', group: 'vr-g-fun', max: 50000 },
      { id: 'vr-transport', label: '交通費（定期外）', group: 'vr-g-move', max: 30000 },
      { id: 'vr-fuel', label: 'ガソリン代', group: 'vr-g-move', max: 30000 },
      { id: 'vr-kids', label: '子どもの費用', group: 'vr-g-other', max: 50000 },
      { id: 'vr-pet', label: 'ペット', group: 'vr-g-other', max: 30000 },
      { id: 'vr-gift', label: '冠婚葬祭・プレゼント', group: 'vr-g-other', max: 30000 },
      { id: 'vr-other', label: 'その他の変動費', group: 'vr-g-other', max: 50000 },
    ],
    ideas: ['お酒・たばこ', 'ゲーム課金', '寄付', 'ふるさと納税（月割り）'],
  },
  savings: {
    kind: 'savings',
    title: '毎月の貯金・積立',
    totalKey: 'monthlySavings',
    itemsKey: 'savingsItems',
    fallbackId: 'sv-deposit',
    groups: [
      { id: 'sv-g-cash', label: '貯金' },
      { id: 'sv-g-invest', label: '投資・資産形成' },
      { id: 'sv-g-other', label: 'その他の積立' },
    ],
    presets: [
      { id: 'sv-deposit', label: '預金（普通・定期）', group: 'sv-g-cash', max: 300000 },
      { id: 'sv-zaikei', label: '財形貯蓄・社内預金', group: 'sv-g-cash', max: 100000 },
      { id: 'sv-nisa', label: 'つみたてNISA（つみたて投資枠）', group: 'sv-g-invest', max: 100000, hint: '新NISAのつみたて投資枠は年120万円（月10万円）まで' },
      { id: 'sv-nisa-growth', label: 'NISA 成長投資枠', group: 'sv-g-invest', max: 200000, hint: '成長投資枠は年240万円まで' },
      { id: 'sv-ideco', label: 'iDeCo（個人型確定拠出年金）', group: 'sv-g-invest', max: 70000, hint: '掛金の上限は働き方によって異なります' },
      { id: 'sv-dc', label: '企業型DC（マッチング拠出）', group: 'sv-g-invest', max: 30000 },
      { id: 'sv-invest', label: 'その他の投資（特定口座など）', group: 'sv-g-invest', max: 200000 },
      { id: 'sv-insurance', label: '積立型の保険・学資保険', group: 'sv-g-other', max: 50000 },
      { id: 'sv-other', label: 'その他の積立', group: 'sv-g-other', max: 100000 },
    ],
    ideas: ['持株会', '外貨預金', '金（ゴールド）積立', '子ども名義の貯金'],
  },
};

export const BREAKDOWN_KINDS: BreakdownKind[] = ['income', 'fixed', 'variable', 'savings'];

/** 項目のグループ（初期項目 → 以前の版の対応 → 保存された値 → 最後のグループ） */
export function groupOf(def: BreakdownDef, item: MoneyItem): string {
  const preset = def.presets.find((p) => p.id === item.id);
  if (preset) return preset.group;
  if (item.group && def.groups.some((g) => g.id === item.group)) return item.group;
  return def.legacyGroups?.[item.id] ?? def.groups[def.groups.length - 1].id;
}

/**
 * 表示・編集に使う内訳。保存された項目に、まだない初期項目（0円）を加えて、グループ順に並べる。
 * 内訳がない古いデータは、合計額を fallbackId の項目に入れる。
 */
export function mergeItems(kind: BreakdownKind, fin: FinancialProfile): MoneyItem[] {
  const def = BREAKDOWNS[kind];
  const stored = fin[def.itemsKey];
  const fallback = Math.max(0, Number(fin[def.totalKey]) || 0);
  const base: MoneyItem[] =
    stored && stored.length > 0
      ? stored.map((i) => ({ ...i, group: groupOf(def, i) }))
      : [{ id: def.fallbackId, label: def.presets.find((p) => p.id === def.fallbackId)!.label, amount: fallback }];
  const ids = new Set(base.map((i) => i.id));
  const all = [...base, ...def.presets.filter((p) => !ids.has(p.id)).map((p) => ({ id: p.id, label: p.label, amount: 0 }))].map((i) => ({ ...i, group: groupOf(def, i) }));
  const gOrder = (g: string) => def.groups.findIndex((x) => x.id === g);
  const pOrder = (id: string) => {
    const i = def.presets.findIndex((p) => p.id === id);
    return i < 0 ? 1000 : i;
  };
  const storedOrder = (id: string) => base.findIndex((i) => i.id === id);
  return all.sort((a, b) => gOrder(a.group!) - gOrder(b.group!) || pOrder(a.id) - pOrder(b.id) || storedOrder(a.id) - storedOrder(b.id));
}

/** 内訳を保存するための変更（内訳と、その合計） */
export function itemsPatch(kind: BreakdownKind, items: MoneyItem[]): Partial<FinancialProfile> {
  const def = BREAKDOWNS[kind];
  return { [def.itemsKey]: items, [def.totalKey]: items.reduce((s, i) => s + Math.max(0, i.amount), 0) } as Partial<FinancialProfile>;
}

/**
 * 毎月の貯金額の合計を指定の額にする。内訳がある場合は差額を「預金」に加減する（0 円未満にはしない）。
 */
export function setSavingsTotal(fin: FinancialProfile, total: number): Partial<FinancialProfile> {
  if (!fin.savingsItems || fin.savingsItems.length === 0) return { monthlySavings: total };
  const items = mergeItems('savings', fin);
  const current = items.reduce((s, i) => s + i.amount, 0);
  const diff = total - current;
  const next = items.map((i) => (i.id === 'sv-deposit' ? { ...i, amount: Math.max(0, i.amount + diff) } : i));
  return itemsPatch('savings', next);
}
