/**
 * LIFE ENGINE のデータモデル。
 *
 * 単位の約束（アプリ全体で統一）:
 * - 時間: 「時間（h）」。時間配分は「1日あたり時間 × 週の日数 = 週間時間」で表す。
 * - お金: 「円」。収入・支出・貯金は「月額」で表す。目標の予算は「総額」。
 * - 日付: ローカル日付の文字列 "YYYY-MM-DD"、年月は "YYYY-MM"。
 */

export const SCHEMA_VERSION = 1;

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
}

/** 固定費の内訳の1項目 */
export interface FixedCostItem {
  id: string;
  /** 項目名（例: 家賃） */
  label: string;
  /** 金額（円/月） */
  amount: number;
}

export interface FinancialProfile {
  /** 月の手取り収入（円/月） */
  monthlyIncome: number;
  /**
   * 固定費の合計（円/月）。内訳（fixedItems）がある場合は常に内訳の合計と同じ値にする。
   * 計算では fixedTotal() を使い、内訳を優先する。
   */
  fixedCosts: number;
  /** 固定費の内訳。未設定（古いデータ）の場合は fixedCosts をそのまま使う */
  fixedItems?: FixedCostItem[];
  /** 変動費（円/月）食費・日用品・交際費など */
  variableCosts: number;
  /** 毎月の貯金額（円/月）。収支の余りから貯金に回す予定額 */
  monthlySavings: number;
  /** 現在の貯金額（円） */
  currentSavings: number;
  /** 貯金の目標額（円）。0 は未設定 */
  savingsTarget: number;
  /** 目標達成期限 "YYYY-MM"。空文字は未設定 */
  targetMonth: string;
  /** 想定年利（%）。初期値 0。保証された値ではなく仮定 */
  annualReturnRate: number;
  /** 臨時収入・臨時支出 */
  oneOffs: OneOffItem[];
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
  /** 必要な予算（円、総額） */
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

export interface Goal {
  id: string;
  name: string;
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
  pos?: { x: number; y: number };
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
}
