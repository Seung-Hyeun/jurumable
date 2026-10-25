import type { ReactNode } from "react";
import type { MissionType } from "@/lib/api";
import { formatDuration } from "@/lib/content";

// Small status pills shared by the lobby and the game. Each one says what it means in words; the
// color only groups them (violet = you / the game, amber = host or paused, emerald = online,
// sky = timed, orange = drinks, rose = penalty, zinc = muted).
const TONE = {
  muted: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  primary: "bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-200",
  strong: "bg-violet-600 text-white",
  warm: "bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200",
  success: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  info: "bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-200",
  drink: "bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-200",
  danger: "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200",
};

const SIZE = {
  sm: "px-2 py-0.5 text-xs font-bold",
  md: "px-3 py-1 text-sm font-black",
};

export function Badge({
  tone = "muted",
  size = "sm",
  className = "",
  children,
}: {
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full whitespace-nowrap ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// Who a player is, in the same order everywhere: 나, then 방장.
export function PlayerBadges({ isMe, isHost }: { isMe: boolean; isHost: boolean }) {
  return (
    <>
      {isMe && <Badge tone="primary">나</Badge>}
      {isHost && (
        <Badge tone="warm">
          <span aria-hidden="true">👑 </span>방장
        </Badge>
      )}
    </>
  );
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <Badge tone={online ? "success" : "muted"}>
      <span aria-hidden="true">{online ? "●" : "○"} </span>
      {online ? "온라인" : "오프라인"}
    </Badge>
  );
}

// What NORMAL / TIMED are called for each kind of content.
export const TYPE_LABEL = {
  mission: { NORMAL: "일반", TIMED: "시간제" },
  penalty: { NORMAL: "즉시형", TIMED: "시간형" },
} as const;

// The same NORMAL / TIMED badge in the lobby's mission / penalty lists and on the mission screen.
export function MissionTypeBadge({
  type,
  durationSeconds,
  kind = "mission",
}: {
  type: MissionType;
  durationSeconds: number | null;
  kind?: keyof typeof TYPE_LABEL;
}) {
  if (type === "TIMED" && durationSeconds) {
    return (
      <Badge tone="info">
        <span aria-hidden="true">⏱ </span>
        {TYPE_LABEL[kind].TIMED} · {formatDuration(durationSeconds)}
      </Badge>
    );
  }
  return <Badge>{TYPE_LABEL[kind].NORMAL}</Badge>;
}
