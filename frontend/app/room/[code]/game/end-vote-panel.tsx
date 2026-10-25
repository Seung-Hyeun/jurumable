import { useEffect, useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { EndVoteAck, EndVoteResult, RoomStatePlayer, VoteProgress } from "@/lib/api";
import { Badge, PlayerBadges } from "../../../_components/badge";
import { FormError, cardClass, primaryButton } from "../../../_components/page-shell";
import { PlayerToken } from "./game-board";

const END_VOTE_ERRORS: Record<string, string> = {
  END_VOTE_NOT_ACTIVE: "게임 종료 투표가 이미 끝났습니다.",
  PLAYER_NOT_FOUND: "참가자 정보를 찾을 수 없습니다.",
};

const voteButton =
  "flex min-h-14 w-full items-center justify-center rounded-2xl px-4 text-lg font-black text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 dark:disabled:text-zinc-400 disabled:shadow-none";

// Shown to everyone in the room, the host too (nobody's vote is filled in), while
// room:state.endVote is set (PLAYING). It only covers the game: the board and the event under it
// stay as they are, paused, and carry on from the next room:state once the vote is over.
export function EndVoteOverlay({
  progress,
  socketRef,
  connected,
}: {
  progress: VoteProgress;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
}) {
  // room:state does not say whether this player has voted, so this only holds for this page;
  // after a refresh the buttons are back and the backend answers ALREADY_VOTED.
  const [voted, setVoted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const dialog = useRef<HTMLElement>(null);

  // Like a dialog, it takes the focus when it opens, so keyboard and screen reader users start here.
  useEffect(() => {
    dialog.current?.focus();
  }, []);

  function vote(choice: "YES" | "NO") {
    const socket = socketRef.current;
    if (!socket || pending.current) {
      return;
    }
    pending.current = true;
    setSending(true);
    setError(null);
    // Only the choice: the voter, the room and the voting round are known to the server.
    socket
      .timeout(5000)
      .emit("game:end-vote", { choice }, (failure: Error | null, ack: EndVoteAck) => {
        setSending(false);
        if (failure) {
          pending.current = false;
          setError("서버 응답이 없습니다. 다시 시도해주세요.");
          return;
        }
        if (ack.ok || ack.code === "ALREADY_VOTED") {
          // One vote per player and no changes: the buttons stay off (pending stays set).
          setVoted(true);
          setError(ack.ok ? null : "이미 게임 종료 투표에 참여했습니다.");
          return;
        }
        pending.current = false;
        setError(END_VOTE_ERRORS[ack.code] ?? "투표하지 못했습니다. 다시 시도해주세요.");
      });
  }

  const disabled = voted || sending || !connected;
  const hint = voted
    ? "다른 참가자의 투표를 기다리는 중..."
    : sending
      ? "투표 처리 중..."
      : !connected
        ? "서버와 다시 연결되면 투표할 수 있습니다."
        : "한 번만 투표할 수 있고, 바꿀 수 없습니다.";

  return (
    // Dimmed, not hidden: the paused board stays visible behind the vote.
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/50 p-4 dark:bg-black/70">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-vote-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-sm flex-col items-center gap-3 overflow-y-auto rounded-3xl bg-white p-5 text-center dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 shadow-xl outline-none starting:scale-95 starting:opacity-0 motion-safe:transition-[scale,opacity] motion-safe:duration-200 sm:p-6"
      >
        <Badge tone="warm" size="md">
          <span aria-hidden="true">⏸ </span>게임 일시정지
        </Badge>
        <h2 id="end-vote-title" className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
          게임 종료 투표
        </h2>
        <p className="font-bold text-zinc-700 dark:text-zinc-300">방장이 게임 종료를 요청했습니다.</p>
        {/* Only how many have voted: never YES / NO or who chose what before the result. */}
        <p role="status" className="text-xl font-black text-violet-700 dark:text-violet-300 tabular-nums">
          {progress.voted} / {progress.total}명 투표 완료
        </p>
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => vote("YES")}
            disabled={disabled}
            aria-describedby="end-vote-hint"
            className={`${voteButton} bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300`}
          >
            YES - 게임 종료
          </button>
          <button
            type="button"
            onClick={() => vote("NO")}
            disabled={disabled}
            aria-describedby="end-vote-hint"
            className={`${voteButton} bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-300`}
          >
            NO - 계속하기
          </button>
        </div>
        <div id="end-vote-hint" role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {voted && <p className="text-base font-black text-emerald-700 dark:text-emerald-300">투표를 완료했습니다.</p>}
          <p>{hint}</p>
        </div>
        <FormError message={error} />
      </section>
    </div>
  );
}

// room.status ENDED wins over every event: this replaces the whole game, with no board and no
// game action at all. There is no winner; it only shows where everyone ended up.
export function GameEnded({
  players,
  myId,
  result,
  onHome,
}: {
  players: RoomStatePlayer[];
  myId: string;
  result: EndVoteResult | null;
  onHome: () => void;
}) {
  const panel = useRef<HTMLElement>(null);

  // The vote overlay that had the focus is gone, so the result takes it.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <section
      ref={panel}
      aria-labelledby="ended-title"
      tabIndex={-1}
      className={`${cardClass} mt-4 w-full outline-none`}
    >
      <div className="text-center">
        <h2 id="ended-title" className="text-3xl font-black text-violet-700 dark:text-violet-300">
          <span aria-hidden="true">🎉 </span>게임 종료
        </h2>
        <p className="mt-2 text-lg font-bold text-zinc-800 dark:text-zinc-200">게임이 종료되었습니다.</p>
        {/* Only on screens that were open for the result; it is not kept anywhere. */}
        {result && (
          <p className="mt-1 font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">
            YES {result.yes} / NO {result.no}
          </p>
        )}
      </div>
      <h3 className="mt-6 font-bold text-zinc-800 dark:text-zinc-200">함께 플레이한 참가자</h3>
      <ol className="mt-2 flex flex-col gap-2">
        {players.map((player) => {
          const isMe = player.id === myId;
          return (
            <li key={player.id} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <PlayerToken player={player} isMe={isMe} />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 font-bold tabular-nums">
                    {(player.turnOrder ?? 0) + 1}.
                  </span>
                  <span className="truncate font-bold" title={player.displayName}>
                    {player.displayName}
                  </span>
                </span>
                <PlayerBadges isMe={isMe} isHost={player.isHost} />
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                최종 위치 {player.position} · 적립 {player.accumulatedDrinks}잔
              </p>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onHome} className={`mt-6 ${primaryButton}`}>
        메인으로 돌아가기
      </button>
    </section>
  );
}
