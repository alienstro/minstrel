// The "waveform key" mark from the Minstrel Mono canvas: a record ring and five waveform bars.
// It is decorative. The link or the heading next to it carries the name.
export function Logo({ size = 28, tone = 'ink' }: { size?: number; tone?: 'ink' | 'white' }) {
  const fill = tone === 'white' ? '#ffffff' : '#111111';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.5 6.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM5.5 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z"
        fill={fill}
      />
      <g fill={fill}>
        <rect x="10" y="11" width="13" height="2" />
        <rect x="12" y="8.5" width="1.8" height="7" rx="0.9" />
        <rect x="15" y="5" width="1.8" height="14" rx="0.9" />
        <rect x="18" y="9.5" width="1.8" height="5" rx="0.9" />
        <rect x="21" y="7.5" width="1.8" height="9" rx="0.9" />
      </g>
    </svg>
  );
}
