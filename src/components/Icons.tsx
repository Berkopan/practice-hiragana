import type { CSSProperties, ReactNode } from 'react';

type IconName = 'arrow' | 'check' | 'undo' | 'trash' | 'eye' | 'grid' | 'help' | 'close' | 'pen' | 'shuffle' | 'book' | 'spark' | 'flame' | 'target' | 'chevron' | 'play' | 'retry' | 'github' | 'shield' | 'download';

const paths: Record<IconName, ReactNode> = {
  arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  undo: <><path d="M8 4 3 9l5 5" /><path d="M3 9h11a6 6 0 0 1 0 12" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.2 8.5a3 3 0 0 1 5.7 1.2c0 2.1-2.9 2.3-2.9 4.3M12 17h.01" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  pen: <><path d="m15 4 5 5M4 20l5-1L21 7a2.2 2.2 0 0 0-4-4L5 15l-1 5ZM4 20h6" /></>,
  shuffle: <><path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 4-3 5-5M13 8c2-2 3-2 5-2h3M17 2l4 4-4 4" /></>,
  book: <><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1ZM12 5v15" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
  flame: <path d="M13 2c1 5-4 5-4 9 0 1 1 2 2 2 2 0 3-2 3-5 3 3 5 6 4 9-1 3-3 5-6 5s-7-2-7-7c0-6 6-7 8-13Z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  play: <path d="m8 4 12 8-12 8V4Z" />,
  retry: <><path d="M20 7V2l-3 3a9 9 0 1 0 3 11M20 7h-5" /></>,
  github: <><path d="M9 19c-4 1-4-2-6-2M15 22v-4a3.5 3.5 0 0 0-1-3c3-.3 6-1.5 6-6a4.5 4.5 0 0 0-1.3-3.2A4.2 4.2 0 0 0 18.6 2S17.4 1.6 15 3a12 12 0 0 0-6 0C6.6 1.6 5.4 2 5.4 2a4.2 4.2 0 0 0-.1 3.8A4.5 4.5 0 0 0 4 9c0 4.5 3 5.7 6 6a3.5 3.5 0 0 0-1 3v4" /></>,
  shield: <><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4" /></>,
};

export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
