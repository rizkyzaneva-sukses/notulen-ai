import { STATUS_LABELS, cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  QUEUED: "bg-slate-700/60 text-slate-300",
  TRANSCRIBING: "bg-amber-500/20 text-amber-300",
  TRANSCRIBED: "bg-sky-500/20 text-sky-300",
  SUMMARIZING: "bg-violet-500/20 text-violet-300",
  DONE: "bg-emerald-500/20 text-emerald-300",
  FAILED: "bg-red-500/20 text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("badge", STYLES[status] || STYLES.QUEUED)}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
