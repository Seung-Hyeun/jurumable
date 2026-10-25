import { useEffect, useState } from "react";
import type { HistoryEntry, HistoryStatus } from "@/lib/api";
import { formatDuration } from "@/lib/content";
import { Badge } from "../../../_components/badge";
import { cardClass } from "../../../_components/page-shell";
import { formatCountdown } from "./mission-panel";

const MISSION_STATUS: Record<HistoryStatus, string> = {
  IN_PROGRESS: "진행 중",
  SUCCESS: "성공",
  FAILED: "실패",
  INVALID: "무효",
  CANCELLED: "중단",
  DONE: "완료",
};

const MISSION_TONE: Partial<Record<HistoryStatus, "success" | "warm" | "muted" | "info">> = {
  IN_PROGRESS: "info",
  SUCCESS: "success",
  FAILED: "warm",
};

// A timed penalty still running: seconds left by the server's clock (endsAt), else null.
function secondsLeft(entry: HistoryEntry, now: number | null, serverOffset: number) {
  if (entry.status !== "IN_PROGRESS" || !entry.endsAt || now === null) {
    return null;
  }
  const left = Math.ceil((Date.parse(entry.endsAt) - (now + serverOffset)) / 1000);
  return left > 0 ? left : null;
}

function HistoryItem({
  entry,
  now,
  serverOffset,
  isMe,
}: {
  entry: HistoryEntry;
  now: number | null;
  serverOffset: number;
  isMe: boolean;
}) {
  const left = secondsLeft(entry, now, serverOffset);
  const mission = entry.kind === "MISSION";
  const kind = mission
    ? "🎯 미션"
    : entry.penaltySource === "MISSION_FAILURE"
      ? "🎯 미션 실패 벌칙"
      : "🎲 벌칙 칸";
  // A timed penalty is over once its endsAt has passed, whatever the stored status says.
  const status = mission
    ? MISSION_STATUS[entry.status]
    : entry.durationSeconds === null
      ? "즉시형"
      : left !== null
        ? "진행 중"
        : entry.status === "IN_PROGRESS" && now === null
          ? "확인 중"
          : "완료";
  const tone = mission ? MISSION_TONE[entry.status] : left !== null ? "info" : undefined;
  return (
    <li className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold" title={entry.displayName}>
          {entry.displayName}
          {isMe && <span className="ml-1 text-sm font-semibold text-violet-700 dark:text-violet-300">(나)</span>}
        </span>
        <Badge tone={tone}>{status}</Badge>
      </div>
      <p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
        {kind}
        {entry.durationSeconds !== null && ` · ⏱ ${formatDuration(entry.durationSeconds)}`}
      </p>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-zinc-900 dark:text-zinc-100">
        {entry.content}
      </p>
      {left !== null && (
        <p role="timer" aria-live="off" className="mt-1 font-mono text-lg font-black tabular-nums text-sky-700 dark:text-sky-300">
          ⏱ {formatCountdown(left)} 남음
        </p>
      )}
    </li>
  );
}

// The latest missions / penalties of this game, from room:state (kept in the DB, so a refresh or
// a reconnect shows the same records and the same time left). On wide screens a column left of
// the board; below that a section under the board that opens on demand.
export function HistoryPanel({
  entries,
  serverOffset,
  myId,
  className = "",
}: {
  entries: HistoryEntry[];
  serverOffset: number;
  myId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const running = entries.some(
    (entry) => entry.kind === "PENALTY" && entry.status === "IN_PROGRESS" && entry.endsAt !== null,
  );

  // Only repaints the countdowns; the time left always comes from endsAt.
  useEffect(() => {
    if (!running) {
      return;
    }
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [running]);

  return (
    <section aria-labelledby="history-title" className={`${cardClass} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="history-title" className="text-lg font-bold">
          게임 기록
        </h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="history-list"
          className="rounded-lg px-2 py-1 text-sm font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 xl:hidden"
        >
          {open ? "접기 ▲" : `펼치기 ▼${entries.length > 0 ? ` (${entries.length})` : ""}`}
        </button>
      </div>
      <div id="history-list" className={`${open ? "" : "hidden"} mt-3 xl:block`}>
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            아직 기록이 없습니다.
            <br />
            미션이나 벌칙이 나오면 여기에 남습니다.
          </p>
        ) : (
          <ol className="flex flex-col gap-2 xl:max-h-[70vh] xl:overflow-y-auto">
            {entries.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                now={running ? now : null}
                serverOffset={serverOffset}
                isMe={entry.playerId === myId}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
