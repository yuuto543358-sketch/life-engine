/**
 * シミュレーションエンジン。UI から独立した純粋関数のみで構成する。
 * 乱数・現在時刻・外部通信を使わず、同じ入力には常に同じ結果を返す（今日の日付も引数で受け取る）。
 */
export * from './units';
export * from './labels';
export * from './time';
export * from './money';
export * from './goals';
export * from './moneyGoals';
export * from './scenarios';
export * from './deviation';
export * from './world';
