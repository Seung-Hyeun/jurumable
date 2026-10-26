import { useEffect, useState, type ReactNode } from "react";
import type { BoardTile, HistoryEntry, HistoryStatus } from "@/lib/api";
import { tileName } from "@/lib/board";
import { Badge } from "../../../_components/badge";
import { cardClass } from "../../../_components/page-shell";
import { formatCountdown } from "./mission-panel";

// One roll as this screen saw it (game:dice-rolled), with what the tile did if it was automatic.
// Kept by the game screen while it is open; the backend does not store rolls.
export type RollLogEntry = {
  seq: number;
  playerId: string;
  displayName: string;
  dice: number;
  fromPosition: number;
  toPosition: number;
  tile: BoardTile;
  result?: string;
};

const MISSION_STATUS: Record<HistoryStatus, string> = {
  IN_PROGRESS: "진행 중",
  SUCCESS: "성공",
  FAILED: "실패",
  INVALID: "무효",
  CANCELLED: "중단",
  DONE: "완료",
};

const MISSION_TONE: Partial<Record<HistoryStatus, "success" | "warm" | "info">> = {
  IN_PROGRESS: "info",
  SUCCESS: "success",
  FAILED: "warm",
};

// How long a timer that reached 00:00 still shows 완료 in 현재 진행 중 before it leaves.
const DONE_FLASH_MS = 1500;

// Server clock now, in ms, or null before the first tick.
type Clock = number | null;

// A timed mission / penalty that has started: ms left by the server's clock (never below 0),
// or null when it has no running timer (NORMAL, not started yet, or already settled).
function msLeft(entry: HistoryEntry, clock: Clock) {
  if (entry.status !== "IN_PROGRESS" || !entry.endsAt || clock === null) {
    return null;
  }
  return Math.max(0, Date.parse(entry.endsAt) - clock);
}

const seconds = (ms: number) => Math.ceil(ms / 1000);

const kindLabel = (entry: HistoryEntry) =>
  entry.kind === "MISSION"
    ? entry.durationSeconds !== null
      ? "🎯 시간형 미션"
      : "🎯 미션"
    : entry.penaltySource === "MISSION_FAILURE"
      ? "🎲 미션 실패 벌칙"
      : entry.durationSeconds !== null
        ? "🎲 시간형 벌칙"
        : "🎲 벌칙";

function Name({ entry, isMe }: { entry: { displayName: string }; isMe: boolean }) {
  return (
    <span className="truncate font-bold" title={entry.displayName}>
      {entry.displayName}
      {isMe && <span className="ml-1 text-sm font-semibold text-violet-700 dark:text-violet-300">(나)</span>}
    </span>
  );
}

// 현재 진행 중: one running timer, large; 완료 for a moment once it reaches 00:00.
function LiveTimer({
  entry,
  clock,
  paused,
  isMe,
}: {
  entry: HistoryEntry;
  clock: Clock;
  paused: boolean;
  isMe: boolean;
}) {
  const left = msLeft(entry, clock) ?? 0;
  // An end-game vote stops the mission clock (the server moves endsAt on by the pause);
  // penalties are real time and keep running.
  const frozen = paused && entry.kind === "MISSION";
  return (
    <li className="rounded-2xl bg-violet-50 dark:bg-violet-500/10 px-3 py-2.5 ring-2 ring-violet-200 dark:ring-violet-400/40">
      <div className="flex items-center justify-between gap-2">
        <Name entry={entry} isMe={isMe} />
        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{kindLabel(entry)}</span>
      </div>
      <p
        role="timer"
        aria-live="off"
        className="mt-1 font-mono text-3xl font-black tabular-nums text-violet-700 dark:text-violet-300"
      >
        {frozen
          ? "⏸ 일시정지"
          : left > 0
            ? formatCountdown(Math.min(seconds(left), entry.durationSeconds ?? Infinity))
            : entry.kind === "MISSION"
              ? "00:00 시간 종료"
              : "00:00 완료!"}
      </p>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-zinc-900 dark:text-zinc-100">
        {entry.content}
      </p>
    </li>
  );
}

function RecordItem({ entry, clock, isMe }: { entry: HistoryEntry; clock: Clock; isMe: boolean }) {
  const left = msLeft(entry, clock);
  const mission = entry.kind === "MISSION";
  const timed = entry.durationSeconds !== null;
  // A penalty's timer ends by its endsAt alone, whatever the stored status says.
  const status = mission
    ? MISSION_STATUS[entry.status]
    : !timed
      ? "즉시형"
      : left !== null && left > 0
        ? "진행 중"
        : entry.status === "IN_PROGRESS" && clock === null
          ? "확인 중"
          : "완료";
  const tone = mission ? MISSION_TONE[entry.status] : left !== null && left > 0 ? "info" : undefined;
  return (
    <li className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Name entry={entry} isMe={isMe} />
        <Badge tone={tone}>{status}</Badge>
      </div>
      <p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400 tabular-nums">
        {kindLabel(entry)}
        {timed && entry.durationSeconds !== null && ` · ⏱ ${formatCountdown(entry.durationSeconds)}`}
      </p>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-zinc-900 dark:text-zinc-100">
        {entry.content}
      </p>
    </li>
  );
}

function LogItem({ entry, isMe }: { entry: RollLogEntry; isMe: boolean }) {
  return (
    <li className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Name entry={entry} isMe={isMe} />
        <span className="font-black tabular-nums">🎲 {entry.dice}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
        {entry.fromPosition} → {entry.toPosition} · 도착:{" "}
        <span className="font-bold text-zinc-900 dark:text-zinc-100">{tileName(entry.tile)}</span>
      </p>
      {entry.result && <p className="mt-1 text-sm font-bold text-rose-700 dark:text-rose-300">{entry.result}</p>}
    </li>
  );
}

// One card of the record column: a heading, and on phones / tablets a button that opens it (on
// wide screens it is always open).
function RecordCard({
  id,
  title,
  badge,
  className,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby={`${id}-title`} className={`${cardClass} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="rounded-lg px-2 py-1 text-sm font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 xl:hidden"
        >
          {open ? "접기 ▲" : `펼치기 ▼${badge ? ` (${badge})` : ""}`}
        </button>
      </div>
      <div
        id={`${id}-body`}
        className={`${open ? "" : "hidden"} mt-3 xl:block xl:max-h-[38vh] xl:overflow-y-auto`}
      >
        {children}
      </div>
    </section>
  );
}

// Two separate cards: 게임 기록, the game's progress only (the rolls this screen has seen: who,
// 🎲, from → to, the tile, and what an automatic tile did; never a mission or penalty text), and
// 미션/벌칙, the missions and penalties from room:state (kept in the DB, so a refresh or a reconnect
// shows the same records and the same time left), with the timers still running on top.
// On wide screens they stack in the column left of the board; below that they sit under the board.
export function HistoryPanel({
  entries,
  log,
  serverOffset,
  myId,
  paused,
  className = "",
}: {
  entries: HistoryEntry[];
  log: RollLogEntry[];
  serverOffset: number;
  myId: string;
  paused: boolean;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  const timed = entries.some((entry) => entry.status === "IN_PROGRESS" && entry.endsAt !== null);

  // Only repaints the countdowns; the time left always comes from endsAt.
  useEffect(() => {
    if (!timed) {
      return;
    }
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [timed]);

  const clock: Clock = timed && now !== null ? now + serverOffset : null;
  const live =
    clock === null
      ? []
      : entries.filter((entry) => {
          const left = msLeft(entry, clock);
          return left !== null && (left > 0 || clock - Date.parse(entry.endsAt ?? "") < DONE_FLASH_MS);
        });
  // Below the running timers: everything else, a finished timer included (as 완료).
  const past = entries.filter((entry) => !live.includes(entry));

  return (
    <div className={`flex min-w-0 flex-col gap-4 ${className}`}>
      <RecordCard id="game-log" title="게임 기록" className="">
        {log.length === 0 ? (
          <p className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            아직 주사위 기록이 없습니다.
            <br />
            이 화면을 연 뒤의 주사위 결과가 여기에 남습니다.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {log.map((entry) => (
              <LogItem key={entry.seq} entry={entry} isMe={entry.playerId === myId} />
            ))}
          </ol>
        )}
      </RecordCard>
      <RecordCard
        id="mission-penalty"
        title="미션/벌칙"
        badge={live.length > 0 ? `진행 중 ${live.length}` : undefined}
        className=""
      >
        <div className="flex flex-col gap-3">
          {live.length > 0 && (
            <section aria-labelledby="history-live-title">
              <h3 id="history-live-title" className="mb-2 text-sm font-black text-violet-700 dark:text-violet-300">
                현재 진행 중
              </h3>
              <ol className="flex flex-col gap-2">
                {live.map((entry) => (
                  <LiveTimer
                    key={entry.id}
                    entry={entry}
                    clock={clock}
                    paused={paused}
                    isMe={entry.playerId === myId}
                  />
                ))}
              </ol>
            </section>
          )}
          {entries.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
              아직 기록이 없습니다.
              <br />
              미션이나 벌칙이 나오면 여기에 남습니다.
            </p>
          ) : (
            past.length > 0 && (
            <section aria-labelledby="history-records-title">
              <h3 id="history-records-title" className="mb-2 text-sm font-black text-zinc-700 dark:text-zinc-300">
                기록
              </h3>
              <ol className="flex flex-col gap-2">
                {past.map((entry) => (
                  <RecordItem key={entry.id} entry={entry} clock={clock} isMe={entry.playerId === myId} />
                ))}
              </ol>
            </section>
            )
          )}
        </div>
      </RecordCard>
    </div>
  );
}
