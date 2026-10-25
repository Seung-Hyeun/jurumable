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
