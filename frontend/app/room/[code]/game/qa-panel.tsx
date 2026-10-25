import { useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { QaCompleteAck, QaSelectAck, Question, RoomClient, RoomStatePlayer } from "@/lib/api";
import { FormError, cardClass, primaryButton } from "../../../_components/page-shell";
import { ContentPanel, type ContentItem } from "../content-panel";
import { CALLOUT, EVENT_CONTENT, EventHeader, contentSize } from "./event-ui";

const QA_ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  INVALID_TURN_PHASE: "이미 처리된 Q&A입니다.",
  GAME_PAUSED: "게임 종료 투표 중에는 완료할 수 없습니다.",
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
};

const QA_SELECT_ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  QA_NOT_SELECTING: "이미 질문이 정해졌습니다.",
  QUESTION_NOT_FOUND: "삭제된 질문입니다. 목록에서 다시 골라주세요.",
  GAME_PAUSED: "게임 종료 투표 중에는 고를 수 없습니다.",
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
};

// Sends the current player's choice: a question id, or null for the server's random pick. The
// server takes only the first choice; the Q&A itself then arrives in room:state.
function useQaChoice(socketRef: RefObject<Socket | null>) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  function choose(questionId: string | null) {
    const socket = socketRef.current;
    if (!socket || busy.current) {
      return;
    }
    busy.current = true;
    setPending(questionId ?? "random");
    setError(null);
    const done = (failure: Error | null, ack: QaSelectAck) => {
      busy.current = false;
      setPending(null);
      if (failure) {
        setError("서버 응답이 없습니다. 다시 시도해주세요.");
      } else if (!ack.ok) {
        setError(QA_SELECT_ERRORS[ack.code] ?? "질문을 정하지 못했습니다.");
      }
    };
    if (questionId === null) {
      socket.timeout(5000).emit("game:qa-random", {}, done);
    } else {
      socket.timeout(5000).emit("game:qa-select", { questionId }, done);
    }
  }

  return { choose, pending, error };
}

// The QA tile before a question is chosen. Everyone sees whose Q&A it is; the list to choose
// from (where anyone can add a question, e.g. one a viewer suggested) is QaQuestionPicker.
export function QaSelectPrompt({
  performer,
  isPerformer,
  paused,
}: {
  performer: RoomStatePlayer;
  isPerformer: boolean;
  paused: boolean;
}) {
  return (
    <section aria-labelledby="qa-select-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="qa-select-title" tone="primary" icon="❓" label="Q&A 질문 선택">
        {performer.displayName}님의 Q&A
      </EventHeader>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {isPerformer
          ? "아래 목록에서 질문을 고르거나, 랜덤으로 정하세요."
          : `${performer.displayName}님이 질문을 고르는 중입니다.`}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        다른 참가자나 시청자가 낸 질문도 목록에 추가해서 고를 수 있습니다.
      </p>
      {paused && <p className={CALLOUT}>게임 종료 투표가 진행 중입니다.</p>}
      {!performer.isOnline && (
        <p className={CALLOUT}>{performer.displayName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

// Only the current player gets this: the server picks one of the room's questions at random.
export function QaRandomButton({
  socketRef,
  connected,
  paused,
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const { choose, pending, error } = useQaChoice(socketRef);
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <button
        type="button"
        onClick={() => choose(null)}
        disabled={!connected || paused || pending !== null}
        aria-describedby="qa-random-hint"
        className={primaryButton}
      >
        {pending ? "정하는 중..." : "랜덤으로 결정"}
      </button>
      <p id="qa-random-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {paused
          ? "게임 종료 투표가 끝나면 고를 수 있습니다."
          : !connected
            ? "서버와 다시 연결되면 고를 수 있습니다."
            : "질문을 정하지 못했다면 서버가 목록에서 하나를 뽑습니다."}
      </p>
      <FormError message={error} />
    </div>
  );
}

// The room's questions with the usual add / edit / delete for everyone; the current player also
// gets "이 질문으로 하기" on each. Shown under the board while the question is being chosen.
export function QaQuestionPicker({
  questions,
  loadFailed,
  client,
  onPatch,
  onUnauthorized,
  performerName,
  isPerformer,
  socketRef,
  connected,
  paused,
}: {
  questions: Question[] | null;
  loadFailed: boolean;
  client: RoomClient;
  onPatch: (update: (list: ContentItem[]) => ContentItem[]) => void;
  onUnauthorized: () => void;
  performerName: string;
  isPerformer: boolean;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const { choose, pending, error } = useQaChoice(socketRef);
  return (
    <section aria-labelledby="qa-pick-title" className={cardClass}>
      <h2 id="qa-pick-title" className="text-lg font-bold">
        Q&A 질문 목록
      </h2>
      <p className="mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        {isPerformer
          ? "질문을 골라 '이 질문으로 하기'를 누르세요."
          : `질문은 누구나 추가·수정할 수 있습니다. 최종 선택은 ${performerName}님이 합니다.`}
      </p>
      {isPerformer && (
        <div className="mb-3 empty:hidden">
          <FormError message={error} />
        </div>
      )}
      <ContentPanel
        standalone
        kind="questions"
        items={questions}
        loadFailed={loadFailed}
        client={client}
        onPatch={onPatch}
        onUnauthorized={onUnauthorized}
        pick={
          isPerformer
            ? {
                label: "이 질문으로 하기",
                pendingId: pending,
                disabled: !connected || paused || pending !== null,
                onPick: (item) => choose(item.id),
              }
            : undefined
        }
      />
    </section>
  );
}

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
