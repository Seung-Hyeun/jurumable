"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { HostChanged, LeaveAck } from "@/lib/api";
import { clearSession } from "@/lib/session";
import {
  FormError,
  PageShell,
  cardClass,
  primaryButton,
  secondaryButton,
  smallButton,
  smallDangerButton,
} from "../../_components/page-shell";
import { canShare, copyText, inviteUrl, shareInvite } from "./invite";
import type { Connection, Problem } from "./use-room";

const CONNECTION = {
  connecting: { label: "연결 중...", mark: "◌", tone: "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200" },
  connected: { label: "연결됨", mark: "●", tone: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200" },
  reconnecting: { label: "재연결 중...", mark: "◌", tone: "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200" },
  disconnected: { label: "연결 끊김", mark: "○", tone: "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200" },
} satisfies Record<Connection, { label: string; mark: string; tone: string }>;

export function RoomLoading({ message }: { message: string }) {
  return (
    <PageShell width="wide">
      <p role="status" className="mt-16 text-center text-lg font-semibold text-zinc-600 dark:text-zinc-400">
        {message}
      </p>
    </PageShell>
  );
}

export function ConnectionBadge({ connection }: { connection: Connection }) {
  const badge = CONNECTION[connection];
  return (
    <p
      role="status"
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${badge.tone}`}
    >
      <span aria-hidden="true">{badge.mark} </span>
      {badge.label}
    </p>
  );
}

// Under the header while the socket is down. A drop is retried by Socket.IO on its own; only a
// connection closed for good gets a button (it checks the session again, like the first visit).
export function ConnectionNotice({
  connection,
  onRetry,
}: {
  connection: Connection;
  onRetry: () => void;
}) {
  if (connection === "reconnecting") {
    return (
      <p className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-800 dark:text-amber-200">
        서버와 다시 연결하는 중입니다...
      </p>
    );
  }
  if (connection === "disconnected") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 px-4 py-2">
        <p className="text-sm font-bold text-rose-800 dark:text-rose-200">서버와 연결이 끊겼습니다.</p>
        <button type="button" onClick={onRetry} className={smallButton}>
          다시 연결
        </button>
      </div>
    );
  }
  return null;
}

// Passing message card for the fixed message area at the top of the lobby and the game screen.
export function RoomNotice({ text }: { text: string }) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-800 px-4 py-3 text-center shadow-lg ring-1 ring-black/10 dark:ring-white/15">
      <p className="font-black text-zinc-900 dark:text-zinc-100 wrap-anywhere">{text}</p>
    </div>
  );
}

export function HostChangedNotice({ change }: { change: HostChanged }) {
  return <RoomNotice text={`${change.newHostDisplayName}님이 새로운 방장이 되었습니다.`} />;
}

// A message for the fixed area that goes away by itself after a few seconds.
export function useTransientMessage() {
  const [message, setMessage] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);
  return [message?.text ?? null, (text: string) => setMessage({ text, at: Date.now() })] as const;
}

const cardShareButton =
  "h-11 rounded-xl bg-violet-100 dark:bg-violet-500/20 px-3 text-sm font-bold text-violet-700 dark:text-violet-300 transition-colors hover:bg-violet-200 dark:hover:bg-violet-500/30 active:bg-violet-300 dark:active:bg-violet-500/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300";

// Lobby (invite): copy the code, copy the invite link, and the share sheet where the browser
// has one. Game screen: the code only, since a room in play takes no new players.
export function ShareActions({
  code,
  invite,
  onMessage,
}: {
  code: string;
  invite: boolean;
  onMessage: (text: string) => void;
}) {
  const buttonClass = invite ? cardShareButton : smallButton;

  async function copyCode() {
    onMessage(
      (await copyText(code)) ? "방 코드를 복사했습니다." : "복사하지 못했습니다. 코드를 직접 복사해주세요.",
    );
  }
  async function copyInvite() {
    onMessage(
      (await copyText(inviteUrl(code)))
        ? "초대 링크를 복사했습니다."
        : "초대 링크를 복사하지 못했습니다. 방 코드를 직접 알려주세요.",
    );
  }
  async function share() {
    if (!(await shareInvite(code))) {
      await copyInvite();
    }
  }

  return (
    <>
      <button type="button" onClick={copyCode} className={buttonClass}>
        코드 복사
      </button>
      {invite && (
        <button type="button" onClick={copyInvite} className={buttonClass}>
          초대 링크 복사
        </button>
      )}
      {invite && canShare() && (
        <button type="button" onClick={share} className={buttonClass}>
          친구 초대
        </button>
      )}
    </>
  );
}

// player:kick answers, shared by the lobby and the game screen.
export const KICK_ERRORS: Record<string, string> = {
  PLAYER_ONLINE: "접속 중인 참가자는 내보낼 수 없습니다.",
  FORBIDDEN: "방장만 참가자를 내보낼 수 있습니다.",
  INVALID_TARGET: "방장은 내보낼 수 없습니다.",
  PLAYER_NOT_FOUND: "이미 방에 없는 참가자입니다.",
  GAME_PAUSED: "게임이 일시정지된 동안에는 내보낼 수 없습니다.",
};

const LEAVE_ERRORS: Record<string, string> = {
  GAME_PAUSED: "게임 종료 투표가 진행 중에는 방을 나갈 수 없습니다.",
};

// Leaving for good: the server removes the player first, and only after its answer does this
// browser forget the room (the page's own cleanup then closes the socket). Closing the tab or
// refreshing never leaves; that is only a disconnect.
export function LeaveRoomButton({
  socketRef,
  connected,
  playing,
  className = "",
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  playing: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pending until home is shown; Next keeps this page (hidden), so it must not stay "나가는 중...".
  const [navigating, startNavigation] = useTransition();

  function leave() {
    const socket = socketRef.current;
    const question = playing
      ? "게임에서 나가면 현재 참가 정보가 삭제됩니다. 나갈까요?"
      : "방에서 나갈까요?";
    if (!socket || leaving || !window.confirm(question)) {
      return;
    }
    setLeaving(true);
    setError(null);
    socket.timeout(5000).emit("player:leave", {}, (failure: Error | null, ack: LeaveAck) => {
      setLeaving(false);
      // Not confirmed by the server: the session stays, so the player can try again.
      if (failure) {
        setError("서버 응답이 없습니다. 다시 시도해주세요.");
        return;
      }
      // PLAYER_NOT_FOUND: already gone (e.g. left from another tab), so nothing is left to keep.
      if (ack.ok || ack.code === "PLAYER_NOT_FOUND") {
        clearSession();
        startNavigation(() => router.replace("/"));
        return;
      }
      setError(LEAVE_ERRORS[ack.code] ?? "방을 나가지 못했습니다. 다시 시도해주세요.");
    });
  }

  const busy = leaving || navigating;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button type="button" onClick={leave} disabled={!connected || busy} className={smallDangerButton}>
        {busy ? "나가는 중..." : "방 나가기"}
      </button>
      <FormError message={error} />
    </div>
  );
}

export function BlockedScreen({
  problem,
  onRetry,
}: {
  problem: Problem;
  onRetry: () => void;
}) {
  return (
    <PageShell back={{ href: "/", label: "처음으로" }}>
      <section role="alert" className={`${cardClass} mt-8 text-center`}>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{problem.title}</h1>
        <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">{problem.message}</p>
        <div className="mt-6 flex flex-col gap-3">
          {problem.action === "retry" && (
            <button type="button" onClick={onRetry} className={primaryButton}>
              다시 시도
            </button>
          )}
          {problem.action === "join" && (
            <Link href="/join-room" className={primaryButton}>
              다시 참여하기
            </Link>
          )}
          <Link href="/" className={secondaryButton}>
            처음으로
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
