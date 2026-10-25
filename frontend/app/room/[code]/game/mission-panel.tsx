import { useEffect, useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { ActiveMission, MissionAck, MissionType, VoteProgress } from "@/lib/api";
import { formatDuration } from "@/lib/content";
import { Badge, MissionTypeBadge } from "../../../_components/badge";
import { FormError, primaryButton } from "../../../_components/page-shell";
import { CALLOUT, EVENT_CONTENT, EventHeader, contentSize } from "./event-ui";

const MISSION_ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  INVALID_MISSION_STATE: "현재 이 동작을 할 수 없습니다.",
  GAME_PAUSED: "게임 종료 투표가 진행 중입니다.",
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
};

const VOTE_ERRORS: Record<string, string> = {
  PERFORMER_CANNOT_VOTE: "미션 수행자는 투표할 수 없습니다.",
  VOTING_NOT_ACTIVE: "이미 투표가 끝났습니다.",
  PLAYER_NOT_FOUND: "참가자 정보를 찾을 수 없습니다.",
  GAME_PAUSED: "게임 종료 투표가 진행 중입니다.",
};

// 180 -> "03:00", 65 -> "01:05", 3661 -> "61:01": minutes simply keep counting past an hour.
export function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Always worked out from the server's endsAt and the browser clock corrected by serverOffset;
// the interval only repaints, so a throttled background tab or a refresh shows the real time
// left at once. While an end-game vote pauses the game the interval stops (the value freezes);
// the backend then moves endsAt on by the pause, and the countdown carries on from there.
function MissionCountdown({
  endsAt,
  serverOffset,
  paused,
}: {
  endsAt: string;
  serverOffset: number;
  paused: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (paused) {
      return;
    }
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [paused]);

  // Opened during a pause: there is no shown value to freeze, and endsAt still has the old end.
  const remaining =
    now === null
      ? null
      : Math.max(0, Math.ceil((Date.parse(endsAt) - (now + serverOffset)) / 1000));
  return (
    <div className="flex flex-col items-center gap-1">
      {paused && (
        <Badge tone="warm" size="md">
          <span aria-hidden="true">⏸ </span>일시정지
        </Badge>
      )}
      <p
        role="timer"
        aria-live="off"
        className={`font-mono text-5xl font-black tabular-nums sm:text-6xl ${paused ? "text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}
      >
        {remaining === null ? "--:--" : formatCountdown(remaining)}
      </p>
      {remaining === 0 && !paused && (
        <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">서버에서 결과를 확인하는 중...</p>
      )}
    </div>
  );
}

// The mission is the snapshot from room:state: a refresh shows the same one, and edits to the
// original mission (or deleting it) do not change it.
export function MissionPrompt({
  mission,
  performerName,
  isPerformer,
  performerOnline,
  paused,
  serverOffset,
  voteProgress,
  notice,
}: {
  mission: ActiveMission;
  performerName: string;
  isPerformer: boolean;
  performerOnline: boolean;
  paused: boolean;
  serverOffset: number;
  voteProgress: VoteProgress | null;
  notice: string | null;
}) {
  const { stage, type } = mission;
  const status =
    stage === "READY"
      ? type === "TIMED"
        ? isPerformer
          ? "준비가 되면 시작하세요."
          : `${performerName}님이 미션을 준비 중입니다.`
        : isPerformer
          ? "내 미션입니다."
          : `${performerName}님의 미션 수행을 기다리는 중...`
      : stage === "RUNNING"
        ? isPerformer
          ? "시간이 끝나면 자동으로 종료됩니다."
          : `${performerName}님이 미션을 수행 중입니다.`
        : null;

  return (
    <section aria-labelledby="mission-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader
        id="mission-title"
        tone="primary"
        icon={stage === "AWAITING_VOTE" ? "🗳" : "🎯"}
        label={stage === "AWAITING_VOTE" ? "미션 판정" : "미션"}
        extra={<MissionTypeBadge type={type} durationSeconds={mission.durationSeconds} />}
      >
        {performerName}님의 미션
      </EventHeader>
      <p className={`${EVENT_CONTENT} ${contentSize(mission.content)}`}>{mission.content}</p>
      {stage === "RUNNING" && mission.endsAt && (
        <MissionCountdown endsAt={mission.endsAt} serverOffset={serverOffset} paused={paused} />
      )}
      {status && <p className="font-semibold text-violet-700 dark:text-violet-300">{status}</p>}
      {stage === "AWAITING_VOTE" && (
        // Only how many have voted: no O / X counts and no names until the result.
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-black text-zinc-900 dark:text-zinc-100">
            {isPerformer ? "다른 참가자들이 결과를 투표하고 있습니다." : "성공했나요?"}
          </p>
          {voteProgress && (
            <p className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-sm font-bold text-zinc-700 dark:text-zinc-300 tabular-nums">
              {voteProgress.voted} / {voteProgress.total} 투표 완료
            </p>
          )}
        </div>
      )}
      {stage === "PENALTY_PENDING" && (
        <p className="text-lg font-black text-rose-700 dark:text-rose-300">미션 실패로 벌칙을 진행합니다.</p>
      )}
      {notice && <p className="text-lg font-black text-rose-700 dark:text-rose-300">{notice}</p>}
      {paused && (
        <p className={CALLOUT}>
          {stage === "RUNNING"
            ? "게임 종료 투표로 미션이 일시정지되었습니다."
            : "게임 종료 투표가 진행 중입니다."}
        </p>
      )}
      {stage === "READY" && !performerOnline && (
        <p className={CALLOUT}>{performerName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

const voteButton =
  "flex min-h-14 items-center justify-center rounded-2xl px-2 text-lg font-black text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 dark:disabled:text-zinc-400 disabled:shadow-none";

// Everyone but the performer votes once while the mission is AWAITING_VOTE (PLAYING +
// RESOLVING_TILE + MISSION). room:state does not say whether this player has voted, so it is
// remembered here for this screen; after a refresh the backend's ALREADY_VOTED brings it back.
export function MissionVote({
  socketRef,
  connected,
  paused,
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const [voted, setVoted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  function vote(choice: "O" | "X") {
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
      .emit("game:mission-vote", { choice }, (failure: Error | null, ack: MissionAck) => {
        setSending(false);
        if (failure) {
          pending.current = false;
          setError("서버 응답이 없습니다. 다시 시도해주세요.");
          return;
        }
        if (ack.ok || ack.code === "ALREADY_VOTED") {
          // One vote per player and no changes: the buttons stay off (pending stays set).
          setVoted(true);
          setError(ack.ok ? null : "이미 투표했습니다.");
          return;
        }
        pending.current = false;
        setError(VOTE_ERRORS[ack.code] ?? "투표하지 못했습니다. 다시 시도해주세요.");
      });
  }

  const disabled = voted || sending || paused || !connected;
  const hint = voted
    ? "투표 완료! 다른 참가자의 투표를 기다리는 중입니다."
    : sending
      ? "투표 처리 중..."
      : paused
        ? "게임 종료 투표가 끝나면 투표할 수 있습니다."
        : !connected
          ? "서버와 다시 연결되면 투표할 수 있습니다."
          : "한 번만 투표할 수 있고, 바꿀 수 없습니다.";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => vote("O")}
          disabled={disabled}
          aria-describedby="vote-hint"
          className={`${voteButton} bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-300`}
        >
          O - 성공
        </button>
        <button
          type="button"
          onClick={() => vote("X")}
          disabled={disabled}
          aria-describedby="vote-hint"
          className={`${voteButton} bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300`}
        >
          X - 실패
        </button>
      </div>
      <p id="vote-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {hint}
      </p>
      <FormError message={error} />
    </div>
  );
}

// Only the performer gets this, and only while the mission is READY (PLAYING + RESOLVING_TILE +
// MISSION). NORMAL: 미션 완료. TIMED: 미션 시작 (the server sets the start and end times).
export function MissionAction({
  type,
  durationSeconds,
  socketRef,
  connected,
  paused,
}: {
  type: MissionType;
  durationSeconds: number | null;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const timed = type === "TIMED";

  function act() {
    const socket = socketRef.current;
    if (!socket || pending.current) {
      return;
    }
    pending.current = true;
    setSending(true);
    setError(null);
    // On success room:state moves the mission on (RUNNING / AWAITING_VOTE), which removes this.
    socket
      .timeout(5000)
      .emit(
        timed ? "game:mission-start" : "game:mission-complete",
        {},
        (failure: Error | null, ack: MissionAck) => {
          const message = failure
            ? "서버 응답이 없습니다. 다시 시도해주세요."
            : ack.ok
              ? null
              : (MISSION_ERRORS[ack.code] ?? "미션을 진행하지 못했습니다.");
          if (message === null) {
            return;
          }
          pending.current = false;
          setSending(false);
          setError(message);
        },
      );
  }

  const hint = sending
    ? "요청을 처리하는 중입니다."
    : paused
      ? "게임 종료 투표가 끝나면 진행할 수 있습니다."
      : !connected
        ? "서버와 다시 연결되면 진행할 수 있습니다."
        : timed
          ? `누르면 서버 시간 기준으로 ${formatDuration(durationSeconds ?? 0)} 타이머가 시작됩니다.`
          : "미션을 수행한 뒤 완료 버튼을 눌러주세요.";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <button
        type="button"
        onClick={act}
        disabled={!connected || paused || sending}
        aria-describedby="mission-hint"
        className={primaryButton}
      >
        {sending ? (timed ? "시작 중..." : "처리 중...") : timed ? "미션 시작" : "미션 완료"}
      </button>
      <p id="mission-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {hint}
      </p>
      <FormError message={error} />
    </div>
  );
}
