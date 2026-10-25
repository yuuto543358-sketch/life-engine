/** 表示用の書式。計算には使わない */

export function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** 円。compact なら 1万円以上を「12.3万円」の形にする */
export function fmtYen(n: number, compact = false, sign = false): string {
  if (!Number.isFinite(n)) return '—';
  const s = sign && n > 0 ? '+' : n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (compact && a >= 10000) {
    if (a >= 100000000) return `${s}${fmtNum(a / 100000000, 2)}億円`;
    const man = a / 10000;
    return `${s}${fmtNum(man, man >= 100 ? 0 : 1)}万円`;
  }
  return `${s}${fmtNum(Math.round(a))}円`;
}

/** 数値と単位を分けて返す（大きな数字と小さな単位で表示するため） */
export function splitYen(n: number, compact = false, sign = false): [string, string] {
  const s = fmtYen(n, compact, sign);
  const m = /^(.*?)(億円|万円|円)$/.exec(s);
  return m ? [m[1], m[2]] : [s, ''];
}

export function fmtHours(h: number, digits = 1, sign = false): string {
  if (!Number.isFinite(h)) return '—';
  const s = sign && h > 0 ? '+' : h < 0 ? '−' : '';
  return `${s}${fmtNum(Math.abs(h), digits)}時間`;
}

export function fmtH(h: number, digits = 1): string {
  if (!Number.isFinite(h)) return '—';
  return `${h < 0 ? '−' : ''}${fmtNum(Math.abs(h), digits)}`;
}

export function fmtPct(p: number | null, digits = 0): string {
  if (p === null || !Number.isFinite(p)) return '—';
  return `${fmtNum(p, digits)}%`;
}

export function fmtMonth(ym: string): string {
  if (!ym) return '未設定';
  const [y, m] = ym.split('-');
  return `${y}年${+m}月`;
}

export function fmtDate(d: string, withYear = true): string {
  if (!d) return '未設定';
  const [y, m, day] = d.split('-');
  return withYear ? `${y}年${+m}月${+day}日` : `${+m}月${+day}日`;
}

export function fmtShortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${+m}/${+day}`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export function weekdayOf(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}

/** 月数を「1年3か月」の形に */
export function fmtMonths(n: number): string {
  if (n <= 0) return '達成済み';
  const y = Math.floor(n / 12);
  const m = n % 12;
  if (y === 0) return `${m}か月`;
  return m === 0 ? `${y}年` : `${y}年${m}か月`;
}

export function fmtDays(n: number): string {
  if (n < 14) return `${n}日`;
  if (n < 70) return `${Math.round(n / 7)}週間`;
  return `${Math.round(n / 30.4)}か月`;
}
