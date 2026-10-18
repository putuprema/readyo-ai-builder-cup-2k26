import type { MetricStatus } from "@adidi/shared";

const TONES: Record<MetricStatus, { dot: string; text: string }> = {
  passes: { dot: "bg-passes", text: "text-accent-strong" },
  needs_work: { dot: "bg-[#B45309]", text: "text-[#8A4A0B]" },
  blocks: { dot: "bg-blocked", text: "text-[#8A1A12]" },
};

/** The status word with its coloured dot (readiness table, legend). */
export function StatusPill({ status, label }: { status: MetricStatus; label: string }) {
  const tone = TONES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${tone.text}`}>
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
