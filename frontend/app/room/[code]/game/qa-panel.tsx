import { useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { QaCompleteAck, QaSelectAck, Question, RoomClient, RoomStatePlayer } from "@/lib/api";
import { FormError, cardClass, primaryButton, secondaryButton } from "../../../_components/page-shell";
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
  NO_QUESTIONS: "등록된 질문이 없습니다. 직접 질문 받기를 이용해주세요.",
  GAME_PAUSED: "게임 종료 투표 중에는 고를 수 없습니다.",
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
};

// Sends the current player's choice: a question id, "random" for the server's pick, or "direct"
// when a player or a viewer asks the question live. The server takes only the first choice; the
// Q&A itself then arrives in room:state.
function useQaChoice(socketRef: RefObject<Socket | null>) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  function choose(choice: string) {
    const socket = socketRef.current;
    if (!socket || busy.current) {
      return;
    }
    busy.current = true;
    setPending(choice);
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
    if (choice === "random") {
      socket.timeout(5000).emit("game:qa-random", {}, done);
    } else if (choice === "direct") {
      socket.timeout(5000).emit("game:qa-direct", {}, done);
    } else {
      socket.timeout(5000).emit("game:qa-select", { questionId: choice }, done);
    }
  }

  return { choose, pending, error };
}

// The QA tile before the question is settled. A player or a viewer asking live (직접 질문 받기) is
// the main way; a random question from the room's list is for when nobody has one. Everyone sees
// whose Q&A it is; only the current player decides (QaChoiceButtons).
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
      <EventHeader id="qa-select-title" tone="primary" icon="❓" label="Q&A">
        {performer.displayName}님의 Q&A
      </EventHeader>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {isPerformer
          ? "시청자나 참가자가 직접 질문해도 됩니다."
          : `${performer.displayName}님이 질문 방식을 고르는 중입니다.`}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {isPerformer
          ? "질문할 사람이 없으면 랜덤 질문을 뽑으세요."
          : "시청자나 참가자가 직접 질문해도 됩니다."}
      </p>
      {paused && <p className={CALLOUT}>게임 종료 투표가 진행 중입니다.</p>}
      {!performer.isOnline && (
        <p className={CALLOUT}>{performer.displayName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

// Only the current player gets these. 직접 질문 받기: no question from the app, someone asks
// live and the answer ends with 답변 완료. 랜덤 질문 뽑기: the server picks one of the room's
// questions. The room's list itself is a small extra (등록된 질문에서 고르기).
export function QaChoiceButtons({
  socketRef,
  connected,
  paused,
  hasQuestions,
  pickerOpen,
  onTogglePicker,
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
  hasQuestions: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const { choose, pending, error } = useQaChoice(socketRef);
  const disabled = !connected || paused || pending !== null;
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <button
        type="button"
        onClick={() => choose("direct")}
        disabled={disabled}
        aria-describedby="qa-choice-hint"
        className={primaryButton}
      >
        <span aria-hidden="true">💬 </span>
        {pending === "direct" ? "시작하는 중..." : "직접 질문 받기"}
      </button>
      <button
        type="button"
        onClick={() => choose("random")}
        disabled={disabled || !hasQuestions}
        aria-describedby="qa-choice-hint"
        className={secondaryButton}
      >
        <span aria-hidden="true">🎲 </span>
        {pending === "random" ? "뽑는 중..." : "랜덤 질문 뽑기"}
      </button>
      <p id="qa-choice-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {paused
          ? "게임 종료 투표가 끝나면 고를 수 있습니다."
          : !connected
            ? "서버와 다시 연결되면 고를 수 있습니다."
            : hasQuestions
              ? "질문은 앱에 입력하지 않아도 됩니다. 말로 받은 질문에 답하면 됩니다."
              : "등록된 질문이 없습니다. 직접 질문 받기를 이용해주세요."}
      </p>
      <FormError message={error} />
      <button
        type="button"
        onClick={onTogglePicker}
        aria-expanded={pickerOpen}
        aria-controls="qa-pick"
        className="self-center rounded-lg px-2 py-1 text-sm font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
      >
        등록된 질문에서 고르기 {pickerOpen ? "▲" : "▼"}
      </button>
    </div>
  );
}

// 등록된 질문에서 고르기: the room's questions for the current player, with "이 질문으로 하기" on each
// (and the usual add / edit / delete). Shown under the board, only when opened.
export function QaQuestionPicker({
  questions,
  loadFailed,
  client,
  onPatch,
  onUnauthorized,
  socketRef,
  connected,
  paused,
}: {
  questions: Question[] | null;
  loadFailed: boolean;
  client: RoomClient;
  onPatch: (update: (list: ContentItem[]) => ContentItem[]) => void;
  onUnauthorized: () => void;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const { choose, pending, error } = useQaChoice(socketRef);
  return (
    <section id="qa-pick" aria-labelledby="qa-pick-title" className={cardClass}>
      <h2 id="qa-pick-title" className="text-lg font-bold">
        등록된 질문에서 고르기
      </h2>
      <p className="mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        질문을 골라 &apos;이 질문으로 하기&apos;를 누르세요.
      </p>
      <div className="mb-3 empty:hidden">
        <FormError message={error} />
      </div>
      <ContentPanel
        standalone
        kind="questions"
        items={questions}
        loadFailed={loadFailed}
        client={client}
        onPatch={onPatch}
        onUnauthorized={onUnauthorized}
        pick={{
          label: "이 질문으로 하기",
          pendingId: pending,
          disabled: !connected || paused || pending !== null,
          onPick: (item) => choose(item.id),
        }}
      />
    </section>
  );
}

// The question is the snapshot from room:state, so a refresh shows the same one and edits to
// the original question (or deleting it) do not change it. direct: no question from the list;
// a player or a viewer asks it live, and the answer ends the same way (답변 완료).
export function QaPrompt({
  question,
  direct,
  performer,
  isPerformer,
  paused,
}: {
  question: string;
  direct: boolean;
  performer: RoomStatePlayer;
  isPerformer: boolean;
  paused: boolean;
}) {
  return (
    <section aria-labelledby="qa-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="qa-title" tone="primary" icon="❓" label={direct ? "Q&A · 직접 질문" : "Q&A"}>
        {performer.displayName}님의 질문
      </EventHeader>
      {direct ? (
        <div className={`${EVENT_CONTENT} text-center`}>
          <p className="text-xl">💬 직접 질문 진행 중</p>
          <p className="mt-1 text-base font-semibold text-zinc-600 dark:text-zinc-400">
            다른 참가자나 시청자가 자유롭게 질문해주세요.
          </p>
        </div>
      ) : (
        <p className={`${EVENT_CONTENT} ${contentSize(question)}`}>“{question}”</p>
      )}
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {direct
          ? isPerformer
            ? "질문에 답한 뒤 답변 완료를 누르세요."
            : `${performer.displayName}님이 질문에 답변하고 있습니다.`
          : isPerformer
            ? "내 질문입니다."
            : `${performer.displayName}님의 답변을 기다리는 중...`}
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
