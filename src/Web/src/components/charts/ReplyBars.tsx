import type { PingReply } from "@/lib/api/types";
import { formatMs } from "@/lib/format";

const HEIGHT = 96;
const BAR_W = 28;
const GAP = 10;

export function ReplyBars({ replies, transmitted }: { replies: PingReply[]; transmitted: number }) {
  const count = Math.max(transmitted, replies.length, 1);
  const bySeq = new Map(replies.map((r) => [r.seq, r]));
  const slots = Array.from({ length: count }, (_, i) => bySeq.get(i + 1) ?? replies[i]);
  const max = Math.max(1, ...replies.map((r) => r.timeMs ?? 0));
  const width = count * (BAR_W + GAP) - GAP;

  return (
    <figure>
      <svg
        role="img"
        aria-label={`Round-trip time for each of ${count} probes`}
        viewBox={`0 0 ${width} ${HEIGHT + 20}`}
        className="h-32 w-full max-w-xl"
        preserveAspectRatio="xMinYMid meet"
      >
        <line x1="0" x2={width} y1={HEIGHT} y2={HEIGHT} className="stroke-line-strong" strokeWidth="1" />
        {slots.map((reply, i) => {
          const x = i * (BAR_W + GAP);
          const time = reply?.timeMs ?? null;
          if (time === null) {
            return (
              <g key={i} className="text-danger-solid">
                <title>{`Probe ${i + 1}: no reply`}</title>
                <path d={`M${x + 6} ${HEIGHT - 22} l${BAR_W - 12} 16 m0 -16 l-${BAR_W - 12} 16`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <text x={x + BAR_W / 2} y={HEIGHT + 14} textAnchor="middle" className="fill-fg-3" fontSize="10">
                  {i + 1}
                </text>
              </g>
            );
          }
          const h = Math.max(4, (time / max) * (HEIGHT - 8));
          return (
            <g key={i}>
              <title>{`Probe ${i + 1}: ${formatMs(time)}`}</title>
              <rect x={x} y={HEIGHT - h} width={BAR_W} height={h} rx="4" className="fill-series-1" />
              <text x={x + BAR_W / 2} y={HEIGHT + 14} textAnchor="middle" className="fill-fg-3" fontSize="10">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-fg-3 mt-1 text-xs">Round-trip time per probe (tallest bar {formatMs(max)}). A cross marks a lost probe.</figcaption>
    </figure>
  );
}
