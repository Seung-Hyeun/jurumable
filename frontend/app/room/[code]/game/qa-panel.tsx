import { useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { QaCompleteAck, RoomStatePlayer } from "@/lib/api";
import { FormError, primaryButton } from "../../../_components/page-shell";
import { CALLOUT, EVENT_CONTENT, EventHeader, contentSize } from "./event-ui";

const QA_ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  INVALID_TURN_PHASE: "이미 처리된 Q&A입니다.",
  GAME_PAUSED: "게임 종료 투표 중에는 완료할 수 없습니다.",
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
};

// The question is the snapshot from room:state, so a refresh shows the same one and edits to
// the original question (or deleting it) do not change it.
export function QaPrompt({
  question,
  performer,
  isPerformer,
  paused,
}: {
  question: string;
  performer: RoomStatePlayer;
  isPerformer: boolean;
  paused: boolean;
}) {
  return (
    <section aria-labelledby="qa-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="qa-title" tone="primary" icon="❓" label="Q&A">
        {performer.displayName}님의 질문
      </EventHeader>
      <p className={`${EVENT_CONTENT} ${contentSize(question)}`}>“{question}”</p>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {isPerformer ? "내 질문입니다." : `${performer.displayName}님의 답변을 기다리는 중...`}
      </p>
      {paused && <p className={CALLOUT}>게임 종료 투표가 진행 중입니다.</p>}
      {!performer.isOnline && (
        <p className={CALLOUT}>{performer.displayName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

// Only the current player gets this, and only while their Q&A is the active event (PLAYING +
// RESOLVING_TILE + QA). What is left to check here: connection, end-game vote, a request in flight.
export function QaCompleteButton({
  socketRef,
  connected,
  paused,
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  function complete() {
    const socket = socketRef.current;
    if (!socket || pending.current) {
      return;
    }
    pending.current = true;
    setCompleting(true);
    setError(null);
    // On success the backend sends game:qa-completed and the next turn in room:state, which
    // removes this button; until then it stays "처리 중...".
    socket
      .timeout(5000)
      .emit("game:qa-complete", {}, (failure: Error | null, ack: QaCompleteAck) => {
        const message = failure
          ? "서버 응답이 없습니다. 다시 시도해주세요."
          : ack.ok
            ? null
            : (QA_ERRORS[ack.code] ?? "Q&A를 완료하지 못했습니다.");
        if (message === null) {
          return;
        }
        pending.current = false;
        setCompleting(false);
        setError(message);
      });
  }

  const hint = completing
    ? "답변 완료를 처리하는 중입니다."
    : paused
      ? "게임 종료 투표가 끝나면 완료할 수 있습니다."
      : !connected
        ? "서버와 다시 연결되면 완료할 수 있습니다."
        : "답변을 마친 뒤 완료 버튼을 눌러주세요.";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <button
        type="button"
        onClick={complete}
        disabled={!connected || paused || completing}
        aria-describedby="qa-hint"
        className={primaryButton}
      >
        {completing ? "처리 중..." : "답변 완료"}
      </button>
      <p id="qa-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {hint}
      </p>
      <FormError message={error} />
    </div>
  );
}
