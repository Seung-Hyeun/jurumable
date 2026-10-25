import type { ComponentProps, ReactNode } from "react";
import { Badge } from "../../../_components/badge";

// The amber note under an event: "waiting for … to come back", "paused by the end-game vote".
export const CALLOUT = "w-full max-w-xs rounded-xl bg-amber-100 dark:bg-amber-500/20 px-3 py-2 font-bold text-amber-900 dark:text-amber-200";

// The box for the question / mission text, what everyone reads first.
export const EVENT_CONTENT =
  "w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-800 px-4 py-3 text-left leading-relaxed font-bold whitespace-pre-wrap text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-black/5 dark:ring-white/10";

// Event text (question, mission, penalty) is the largest text on the screen, unless it is long:
// up to 200 characters in the narrow board center would otherwise stretch the whole board.
export function contentSize(text: string) {
  return text.length > 60 ? "text-base sm:text-lg" : "text-lg sm:text-xl";
}

// Every event screen (Q&A, 지목, mission, penalty) starts the same way: the kind of event, as a
// badge in its tile's color family, then whose turn it is.
export function EventHeader({
  id,
  tone,
  icon,
  label,
  extra,
  children,
}: {
  id: string;
  tone: ComponentProps<typeof Badge>["tone"];
  icon: string;
  label: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge tone={tone} size="md">
          <span aria-hidden="true">{icon} </span>
          {label}
        </Badge>
        {extra}
      </div>
      <h2 id={id} className="text-base font-black text-zinc-900 dark:text-zinc-100 sm:text-lg">
        {children}
      </h2>
    </>
  );
}

// The frames of a roulette that lands on the server's result: the candidates (the room's list)
// in order for show, the last frame always the result the server already picked and stored.
// Nothing here chooses anything.
export function rouletteFrames(candidates: string[], result: string, count: number) {
  const list = candidates.length > 0 ? candidates : [result];
  const at = Math.max(0, list.indexOf(result));
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? result : list[(at - (count - 1 - i) + list.length * count) % list.length],
  );
}

// The penalty roulette and the random Q&A question: candidates flick by, slowing down, and stop
// on the result. The flicking text is hidden from screen readers; the result is not.
export function Roulette({
  id,
  tone,
  icon,
  label,
  title,
  note,
  frame,
  stopped,
  doneText,
}: {
  id: string;
  tone: ComponentProps<typeof Badge>["tone"];
  icon: string;
  label: string;
  title: string;
  note: string;
  frame: string;
  stopped: boolean;
  doneText: string;
}) {
  return (
    <section aria-labelledby={id} className="flex w-full flex-col items-center gap-3">
      <EventHeader id={id} tone={tone} icon={icon} label={label}>
        {title}
      </EventHeader>
      <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">{note}</p>
      <div
        aria-hidden={!stopped}
        className={`flex min-h-24 w-full max-w-xs items-center justify-center rounded-2xl px-4 py-3 text-center font-black whitespace-pre-wrap wrap-anywhere ring-2 motion-safe:transition-colors ${stopped ? "bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-rose-300 dark:ring-rose-400/50" : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 ring-zinc-200 dark:ring-zinc-700"}`}
      >
        {frame}
      </div>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {stopped ? doneText : "룰렛이 돌아가는 중..."}
      </p>
    </section>
  );
}
