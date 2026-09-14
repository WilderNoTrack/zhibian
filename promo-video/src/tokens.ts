// 设计 tokens：全部取自 web/zhihu.css :root，片中配色/字体只允许复用或克制扩展这套值。
export const T = {
  brand: '#1772f6',
  brandHover: '#0f5fd6',
  brandDeep: '#0a4fb8', // 扩展：锁定加深脉冲用（brand 加深一档）
  brandSoft: 'rgba(23,114,246,.08)',
  brandSoft2: 'rgba(23,114,246,.16)',
  bg: '#f6f6f6',
  card: '#ffffff',
  text: '#121212',
  text2: '#444444',
  text3: '#8491a5',
  line: '#ebebeb',
  left: '#e0552f',
  leftSoft: '#fff3ee',
  right: '#4a5bd6',
  rightSoft: '#eff1ff',
  ok: '#0e9f6e',
  radius: 4,
  shadow: '0 1px 3px rgba(18,18,18,.1)',
};

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif';
export const MONO = '"SF Mono", Menlo, Consolas, "Microsoft YaHei", monospace';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
