/** 線のアイコン。currentColor で描く */
const PATHS: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  sim: 'M5 18V9M12 18V5M19 18v-6M3 18h18M5 9a1.6 1.6 0 1 0 0-.01M12 5a1.6 1.6 0 1 0 0-.01M19 12a1.6 1.6 0 1 0 0-.01',
  map: 'M6.5 7.5a2 2 0 1 0 0-.01M17.5 6a2 2 0 1 0 0-.01M12 17.5a2 2 0 1 0 0-.01M8.3 8.6l2.6 7M15.8 7.3l-2.7 8.3M8.5 7.2l7-1',
  log: 'M5 5h14v14H5zM9 9.5h6M9 12.5h6M9 15.5h3.5',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.4 1.1-1.6 2.8-1.7-.6a7 7 0 0 1-2 1.2L15.2 20h-3.2l-.3-1.9a7 7 0 0 1-2-1.2l-1.7.6-1.6-2.8 1.4-1.1a7 7 0 0 1 0-2.4L6.4 10l1.6-2.8 1.7.6a7 7 0 0 1 2-1.2L12 4.8h3.2l.3 1.8a7 7 0 0 1 2 1.2l1.7-.6 1.6 2.8-1.4 1.1a7 7 0 0 1 0 2.4z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1',
  info: 'M12 8v.1M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V12l3 2',
  yen: 'M7 4.5l5 7 5-7M12 11.5V20M8 13h8M8 16.5h8',
  flag: 'M6 21V4M6 4h10l-2 3.5L16 11H6',
  chevron: 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7',
  edit: 'M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM13.5 7.5l3 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
  briefcase: 'M4 8h16v11H4zM9 8V5.5h6V8M4 13h16',
  coin: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 8.5l3 4 3-4M12 12.5V16M9.5 13.5h5',
  book: 'M5 5.5A2 2 0 0 1 7 4h12v14H7a2 2 0 0 0-2 2zM5 5.5V20M9 8h6',
  heart: 'M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z',
  spark: 'M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M17 14.5a4.5 4.5 0 0 1 3.5 4.5',
  dot: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  focus: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  swap: 'M7 7h12l-3-3M17 17H5l3 3',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7',
  note: 'M6 4h9l3 3v13H6zM9 11h6M9 14.5h6',
};

export type IconName = keyof typeof PATHS | string;

export function Icon({ name, size = 22, stroke = 1.7, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.dot} />
    </svg>
  );
}

export const DOMAIN_ICONS = ['briefcase', 'coin', 'book', 'heart', 'spark', 'people', 'home', 'target', 'flag', 'layers'];
