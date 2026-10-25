/**
 * LIFE ENGINE のデータモデル。
 *
 * 単位の約束（アプリ全体で統一）:
 * - 時間: 「時間（h）」。時間配分は「1日あたり時間 × 週の日数 = 週間時間」で表す。
 * - お金: 「円」。収入・支出・貯金は「月額」で表す。目標の予算は「総額」。
 * - 日付: ローカル日付の文字列 "YYYY-MM-DD"、年月は "YYYY-MM"。
 */

/** データ形式の版。2: 年代記（旅の記録・節目・静寂の地）と目標の完了日を追加 */
export const SCHEMA_VERSION = 2;

/** 時間カテゴリ（週の時間配分の項目）。順番はグラフの積み上げ順と色の割り当て順を兼ねる */
export const TIME_CATEGORY_KEYS = [
  'sleep',
  'work',
  'commute',
  'housework',
  'study',
  'hobby',
  'other',
] as const;
export type TimeCategoryKey = (typeof TIME_CATEGORY_KEYS)[number];

/** 時間配分の1項目。週間時間 = hoursPerDay × daysPerWeek */
export interface TimeItem {
  /** 1日あたりの時間（h/日）0〜24 */
  hoursPerDay: number;
  /** その活動をする週の日数（日/週）0〜7 の整数 */
  daysPerWeek: number;
}

export interface TimeBudget {
  /** 1週間の総時間（h/週）。通常 168 = 24h × 7日 */
  totalHours: number;
  items: Record<TimeCategoryKey, TimeItem>;
}

export interface OneOffItem {
  id: string;
  label: string;
  /** 金額（円、正の数）。種類で収入か支出かを区別する */
  amount: number;
  type: 'income' | 'expense';
  /** 発生する年月 "YYYY-MM" */
  month: string;
  /** 毎年同じ月に繰り返す（ボーナスなど） */
  repeatYearly: boolean;
  /**
   * ボーナスとして、お金の目標の貯金の計算に使う（収入のときだけ）。
   * 未設定の古いデータは「毎年くり返す収入」をボーナスとして扱う。
   */
  bonus?: boolean;
}

/** お金の内訳の種類（収入・固定費・変動費・毎月の貯金や積立） */
export type BreakdownKind = 'income' | 'fixed' | 'variable' | 'savings';

/** お金の内訳の1項目（円/月） */
export interface MoneyItem {
  id: string;
  /** 項目名（例: 家賃、つみたてNISA） */
  label: string;
  /** 金額（円/月） */
  amount: number;
  /** 表示上のグループ（例: 住まい、保険）。未設定なら項目IDから決める */
  group?: string;
}

/** 以前の名前（互換のため残す） */
export type FixedCostItem = MoneyItem;

/**
 * お金の計画。合計の値（monthlyIncome など）は、内訳（〜Items）がある場合は常に内訳の合計と同じ値にする。
 * 計算では breakdownTotal() を使い、内訳を優先する。内訳がない古いデータは合計の値をそのまま使う。
 */
export interface FinancialProfile {
  /** 月の手取り収入（円/月） */
  monthlyIncome: number;
  incomeItems?: MoneyItem[];
  /** 固定費（円/月）家賃・通信費・保険など */
  fixedCosts: number;
  fixedItems?: MoneyItem[];
  /** 変動費（円/月）食費・日用品・交際費など */
  variableCosts: number;
  variableItems?: MoneyItem[];
  /** 毎月の貯金・積立額（円/月）。預金・つみたてNISA・iDeCo など */
  monthlySavings: number;
  savingsItems?: MoneyItem[];
  /** 現在の貯金額（円） */
  currentSavings: number;
  /**
   * 貯金の目標額の決め方。'auto' はお金の目標（貯める・買う）の合計から自動で計算する。
   * 未設定の古いデータは、目標額が入っていれば 'manual'、なければ 'auto' として扱う。
   */
  savingsTargetMode?: 'auto' | 'manual';
  /** 貯金の目標額（円）。0 は未設定（手動のときに使う） */
  savingsTarget: number;
  /** 目標達成期限 "YYYY-MM"。空文字は未設定（手動のときに使う） */
  targetMonth: string;
  /** 想定年利（%）。初期値 0。保証された値ではなく仮定 */
  annualReturnRate: number;
  /** 臨時収入・臨時支出 */
  oneOffs: OneOffItem[];
  /** ボーナスのうち、お金の目標の貯金に回す割合（%、0〜100）。未設定は 50 */
  bonusSavingsRate?: number;
}

/** 目標の時間をどの枠から使うか。'free' は配分されていない自由時間から */
export type TimeSource = TimeCategoryKey | 'free';

/** シナリオごとに変えられる目標の計画値 */
export interface GoalPlan {
  /** このシナリオで目標を計画に含めるか */
  included: boolean;
  /** 期限 "YYYY-MM-DD"。空文字は未設定 */
  deadline: string;
  /** 必要な週間時間（h/週） */
  weeklyHours: number;
  /** 時間をどの枠から使うか */
  timeSource: TimeSource;
  /** 必要な予算（円、総額）。お金の目標では「目標金額」 */
  budget: number;
  /** 優先順位。1 が最優先。ユーザーが決める */
  priority: number;
}

export interface LifeDomain {
  id: string;
  name: string;
  /** 表示用のアイコン名 */
  icon: string;
  note: string;
  order: number;
  /** 人生マップ上の位置（未設定なら自動配置） */
  pos?: { x: number; y: number };
  isSample?: boolean;
}

/** 目標の種類。'money' はお金を貯める・何かを買うための目標 */
export type GoalKind = 'general' | 'money';

export interface Goal {
  id: string;
  name: string;
  /** 目標の種類（未設定は 'general'） */
  kind?: GoalKind;
  /** お金の目標の使い道。'save' = 貯めておく、'buy' = 買う・使う */
  moneyPurpose?: 'save' | 'buy';
  /** お金の目標で、すでに貯まっている額（円） */
  savedAmount?: number;
  domainId: string | null;
  /** 完了条件（例: 試験に合格する） */
  completionCriteria: string;
  /** 現在の進捗（%）0〜100 */
  progress: number;
  /** 完了までに必要な総時間（h）。任意。null は未設定 */
  totalHours: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  /** 達成した日 "YYYY-MM-DD"（進捗が100%になった日。自動で記録） */
  completedAt?: string;
  pos?: { x: number; y: number };
  isSample?: boolean;
}

/** 年代記の記録の種類。journal = 旅の記録（日記）、milestone = 節目、quiet = 静寂の地での記録 */
export type ChronicleKind = 'journal' | 'milestone' | 'quiet';
/** 静寂の地での記録の種類 */
export type QuietKind = 'free' | 'reflection' | 'tomorrow' | 'nothing';

/** 年代記の館に保存する記録。目標や記録を消しても、ここに残した記憶は消えない */
export interface ChronicleEntry {
  id: string;
  kind: ChronicleKind;
  /** 出来事の日 "YYYY-MM-DD" */
  date: string;
  title: string;
  body: string;
  /** 写真（端末内で縮小した画像のデータURL）。最大4枚 */
  photos: string[];
  /** 関連する開拓計画（目標） */
  goalId: string | null;
  /** 静寂の地での記録の種類 */
  quietKind?: QuietKind;
  /** 明日の準備: 小さな一歩（最大3つ） */
  steps?: string[];
  /** 何もしない時間（分） */
  minutes?: number;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
}

/**
 * シナリオ = 時間・お金・目標の計画一式。
 * id が CURRENT_SCENARIO_ID のものが「現在の計画」。
 */
export interface Scenario {
  id: string;
  name: string;
  note: string;
  time: TimeBudget;
  finance: FinancialProfile;
  /** 目標ID → このシナリオでの計画値 */
  goalPlans: Record<string, GoalPlan>;
  /** 複製元のシナリオID */
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
}

export const CURRENT_SCENARIO_ID = 'current';

export type NodeRef = { kind: 'goal' | 'domain'; id: string };

/** 目標・領域どうしのつながり。ユーザーが明示的に登録したものだけを扱う */
export interface Dependency {
  id: string;
  from: NodeRef;
  to: NodeRef;
  /** 関係の説明（例: 収入が増える） */
  label: string;
  createdAt: string;
  isSample?: boolean;
}

interface ActualBase {
  id: string;
  /** 記録した日 "YYYY-MM-DD" */
  date: string;
  goalId: string | null;
  memo: string;
  createdAt: string;
  isSample?: boolean;
}

/** 実際に使った時間（例: 勉強した時間） */
export interface TimeActual extends ActualBase {
  type: 'time';
  category: TimeCategoryKey;
  /** 実際の時間（h） */
  hours: number;
}

export type ExpenseCategory = 'fixed' | 'variable' | 'goal';

/** 実際に使ったお金 */
export interface ExpenseActual extends ActualBase {
  type: 'expense';
  expenseCategory: ExpenseCategory;
  /** 金額（円） */
  amount: number;
}

/** 作業の見積もりと実際の時間 */
export interface TaskActual extends ActualBase {
  type: 'task';
  title: string;
  /** 見積もり時間（h） */
  estimateHours: number;
  /** 実際にかかった時間（h） */
  actualHours: number;
}

/** 目標の進捗の記録 */
export interface ProgressActual extends ActualBase {
  type: 'progress';
  /** 記録時点の進捗（%） */
  progress: number;
}

export type ActualRecord = TimeActual | ExpenseActual | TaskActual | ProgressActual;

export interface UserProfile {
  id: 'profile';
  name: string;
  onboarded: boolean;
  /** サンプルデータで現在の計画を初期化したか（サンプル削除時に計画も初期化するため） */
  sampleSeededPlan: boolean;
  createdAt: string;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type MotionSetting = 'system' | 'reduce' | 'full';

export interface AppSettings {
  id: 'settings';
  theme: ThemeSetting;
  motion: MotionSetting;
  textSize: 'standard' | 'large';
  /** 金額を「万円」でまとめて表示する */
  compactMoney: boolean;
}

/** バックアップファイルの形式 */
export interface BackupFile {
  app: 'life-engine';
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

export interface AppData {
  profile: UserProfile;
  settings: AppSettings;
  domains: LifeDomain[];
  goals: Goal[];
  scenarios: Scenario[];
  actuals: ActualRecord[];
  dependencies: Dependency[];
  /** 年代記（旅の記録・節目・静寂の地）。版1のデータにはない */
  chronicle: ChronicleEntry[];
}
