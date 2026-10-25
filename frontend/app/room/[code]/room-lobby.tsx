"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CONTENT_KINDS,
  type ContentKind,
  type Contents,
  type KickAck,
  type Mission,
  type Penalty,
  type Question,
  type RoomStatePlayer,
  type RoomStatus,
  type StartAck,
} from "@/lib/api";
import { Badge, OnlineBadge, PlayerBadges } from "../../_components/badge";
import {
  FormError,
  PageShell,
  cardClass,
  primaryButton,
  smallDangerButton,
} from "../../_components/page-shell";
import { ContentTabs, type ContentItem } from "./content-panel";
import {
  BlockedScreen,
  ConnectionBadge,
  ConnectionNotice,
  HostChangedNotice,
  KICK_ERRORS,
  LeaveRoomButton,
  RoomLoading,
  RoomNotice,
  ShareActions,
  useTransientMessage,
} from "./room-ui";
import { useRoom } from "./use-room";

const STATUS_LABEL: Record<RoomStatus, string> = {
  WAITING: "대기 중",
  PLAYING: "게임 진행 중",
  ENDED: "게임 종료",
};

const START_ERRORS: Record<string, string> = {
  FORBIDDEN: "방장만 게임을 시작할 수 있습니다.",
  INVALID_ROOM_STATE: "지금은 게임을 시작할 수 없는 방입니다.",
  NOT_ENOUGH_PLAYERS: "최소 2명이 필요합니다.",
  PLAYER_OFFLINE: "모든 참가자가 접속해야 시작할 수 있습니다.",
};

const NO_CONTENTS: Contents = { questions: null, missions: null, penalties: null };

export default function RoomLobby({ code }: { code: string }) {
  const router = useRouter();
  const [contents, setContents] = useState<Contents>(NO_CONTENTS);
  const [contentsFailed, setContentsFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [message, showMessage] = useTransientMessage();
  const startPending = useRef(false);
  // Bumped whenever a list changes from the socket or an edit, so an older GET cannot win.
  const versions = useRef<Record<ContentKind, number>>({
    questions: 0,
    missions: 0,
    penalties: 0,
  });

  const { view, connection, state, socketRef, retry, expireSession, hostChanged, reconnected } = useRoom(
    code,
    (s, { client, expire, isCancelled }) => {
      const replace = (kind: ContentKind, list: Contents[ContentKind]) => {
        versions.current[kind] += 1;
        setContents((current) => ({ ...current, [kind]: list }) as Contents);
      };
      const load = (kind: ContentKind) => {
        const version = versions.current[kind];
        void client.list(kind).then((result) => {
          if (isCancelled() || versions.current[kind] !== version) {
            return;
          }
          if (result.ok) {
            setContentsFailed(false);
            setContents((current) => ({ ...current, [kind]: result.data }) as Contents);
          } else if (result.status === 401) {
            expire();
          } else {
            setContentsFailed(true);
          }
        });
      };

      // Updates broadcast while this socket was away are not replayed, so (re)load the lists.
      s.on("connect", () => CONTENT_KINDS.forEach(load));
      s.on("questions:updated", (payload: { questions: Question[] }) =>
        replace("questions", payload.questions),
      );
      s.on("missions:updated", (payload: { missions: Mission[] }) =>
        replace("missions", payload.missions),
      );
      s.on("penalties:updated", (payload: { penalties: Penalty[] }) =>
        replace("penalties", payload.penalties),
      );
    },
  );
  const status = state?.room.status;

  // Once the game has started, the lobby only forwards to the game screen. replace (not push)
  // keeps the back button from landing here and being forwarded again.
  useEffect(() => {
    if (status && status !== "WAITING") {
      router.replace(`/room/${code}/game`);
    }
  }, [status, code, router]);

  function retryLobby() {
    setContents(NO_CONTENTS);
    retry();
  }

  // Applies the requester's own REST result right away; the socket update follows for everyone.
  function patchContents(
    kind: ContentKind,
    update: (list: ContentItem[]) => ContentItem[],
  ) {
    versions.current[kind] += 1;
    setContents((current) => {
      const list = current[kind];
      return list ? ({ ...current, [kind]: update(list) } as Contents) : current;
    });
  }

  function startGame() {
    const socket = socketRef.current;
    if (!socket || startPending.current) {
      return;
    }
    startPending.current = true;
    setStarting(true);
    setStartError(null);
    // On success the backend broadcasts room:state (PLAYING), which moves every browser on.
    socket
      .timeout(5000)
      .emit("game:start", {}, (error: Error | null, ack: StartAck) => {
        startPending.current = false;
        setStarting(false);
        if (error) {
          setStartError("서버 응답이 없습니다. 다시 시도해주세요.");
        } else if (!ack.ok) {
          setStartError(START_ERRORS[ack.code] ?? "게임을 시작할 수 없습니다.");
        }
      });
  }

  function kickPlayer(player: RoomStatePlayer) {
    const socket = socketRef.current;
    if (
      !socket ||
      kickingId ||
      !window.confirm(`${player.displayName}님을 방에서 내보낼까요?`)
    ) {
      return;
    }
    setKickingId(player.id);
    setKickError(null);
    // On success room:state arrives without the player; the list is never edited locally.
    socket
      .timeout(5000)
      .emit("player:kick", { playerId: player.id }, (error: Error | null, ack: KickAck) => {
        setKickingId(null);
        if (error) {
          setKickError("서버 응답이 없습니다. 다시 시도해주세요.");
        } else if (!ack.ok) {
          setKickError(KICK_ERRORS[ack.code] ?? "참가자를 내보내지 못했습니다.");
        }
      });
  }

  if (view.kind === "checking") {
    return <RoomLoading message="대기방 연결 중..." />;
  }
  if (view.kind === "blocked") {
    return <BlockedScreen problem={view} onRetry={retryLobby} />;
  }
  if (!state) {
    return <RoomLoading message="대기방 연결 중..." />;
  }
  if (state.room.status !== "WAITING") {
    return <RoomLoading message="게임 화면으로 이동 중..." />;
  }

  const { room, players } = state;
  const me = players.find((player) => player.id === view.playerId);
  const isHost = me?.isHost === true;
  const startBlockedBy =
    players.length < 2
      ? "최소 2명이 필요합니다."
      : players.some((player) => !player.isOnline)
        ? "모든 참가자가 접속해야 시작할 수 있습니다."
        : connection !== "connected"
          ? "서버와 다시 연결되면 시작할 수 있습니다."
          : null;
  const canStart = !startBlockedBy && !starting;

  return (
    <PageShell back={{ href: "/", label: "처음으로" }} width="split">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-violet-700 dark:text-violet-300">대기방</h1>
        <ConnectionBadge connection={connection} />
      </div>
      <div className="mt-3 empty:hidden">
        <ConnectionNotice connection={connection} onRetry={retryLobby} />
      </div>

      {/* Phones: one column. Desktop: room + players + start | contents.
          grid-cols-1 (minmax(0, 1fr)) keeps long nicknames truncating instead of widening the page. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
        <section
          aria-labelledby="room-code-title"
          className={`${cardClass} lg:col-start-1 lg:row-start-1`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="room-code-title" className="text-sm font-bold text-zinc-500 dark:text-zinc-400">
              방 코드
            </h2>
            <Badge tone="primary">{STATUS_LABEL[room.status]}</Badge>
          </div>
          <p className="mt-1 font-mono text-4xl font-black tracking-[0.25em] text-zinc-900 dark:text-zinc-100">
            {room.code}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareActions code={room.code} invite onMessage={showMessage} />
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            친구들에게 방 코드나 초대 링크를 보내주세요.
          </p>
        </section>

        <section
          aria-labelledby="players-title"
          className={`${cardClass} lg:col-start-1 lg:row-start-2`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="players-title" className="text-lg font-bold">
              참가자
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              현재 인원{" "}
              <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {players.length} / {room.maxPlayers}
              </span>
            </p>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {players.map((player) => {
              const kickable =
                isHost &&
                player.id !== view.playerId &&
                !player.isHost &&
                !player.isOnline;
              return (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-lg font-bold" title={player.displayName}>
                      {player.displayName}
                    </span>
                    <PlayerBadges isMe={player.id === view.playerId} isHost={player.isHost} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <OnlineBadge online={player.isOnline} />
                    {kickable && (
                      <button
                        type="button"
                        onClick={() => kickPlayer(player)}
                        disabled={kickingId !== null}
                        aria-label={`${player.displayName} 강퇴`}
                        className={smallDangerButton}
                      >
                        {kickingId === player.id ? "내보내는 중..." : "강퇴"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {kickError && (
            <div className="mt-3">
              <FormError message={kickError} />
            </div>
          )}
        </section>

        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <ContentTabs
            contents={contents}
            loadFailed={contentsFailed}
            client={view.client}
            onPatch={patchContents}
            onUnauthorized={expireSession}
          />
        </div>

        <section className="flex flex-col gap-3 lg:col-start-1 lg:row-start-3">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={startGame}
                disabled={!canStart}
                aria-describedby="start-hint"
                className={primaryButton}
              >
                {starting ? "시작하는 중..." : "게임 시작"}
              </button>
              <p id="start-hint" className="text-center text-base text-zinc-600 dark:text-zinc-400">
                {startBlockedBy ?? "모두 모였다면 게임을 시작하세요."}
              </p>
              <FormError message={startError} />
            </>
          ) : (
            <p className="rounded-2xl bg-white/80 dark:bg-zinc-900/80 px-4 py-4 text-center text-base text-zinc-600 dark:text-zinc-400">
              방장이 게임을 시작할 때까지 기다려주세요.
            </p>
          )}
          <LeaveRoomButton
            socketRef={socketRef}
            connected={connection === "connected"}
            playing={false}
            className="mt-2 items-center"
          />
        </section>
      </div>
      {/* Same fixed message area as the game screen; it never takes a tap. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-4 z-30 flex flex-col items-center gap-2 px-4"
      >
        {hostChanged && <HostChangedNotice change={hostChanged} />}
        {reconnected && <RoomNotice text="다시 연결되었습니다." />}
        {message && <RoomNotice text={message} />}
      </div>
    </PageShell>
  );
}
