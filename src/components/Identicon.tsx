/**
 * Deterministic 5x5 symmetric identicon from a key fingerprint —
 * the visual half of manual key verification (spec §03).
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function Identicon({ value, size = 48 }: { value: string; size?: number }) {
  const seed = fnv1a(value || 'ember');
  const hue = seed % 360;
  const cell = size / 5;
  const cells: { x: number; y: number }[] = [];
  // 3 columns mirrored to 5 — 15 bits decide the pattern
  let bits = seed;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      bits = Math.imul(bits, 0x01000193) ^ (y * 3 + x);
      if ((bits >>> 16) & 1) {
        cells.push({ x, y });
        if (x < 2) cells.push({ x: 4 - x, y });
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="identicon"
      className="rounded-em-sm"
      style={{ background: `oklch(0.25 0.02 ${hue})` }}
    >
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * cell + 1}
          y={c.y * cell + 1}
          width={cell - 2}
          height={cell - 2}
          rx={2}
          fill={`oklch(0.75 0.14 ${hue})`}
        />
      ))}
    </svg>
  );
}
