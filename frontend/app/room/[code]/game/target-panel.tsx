import { useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { PlayerName, TargetSelectAck } from "@/lib/api";
import { FormError } from "../../../_components/page-shell";
import { CALLOUT, EventHeader } from "./event-ui";

const TARGET_ERRORS: Record<string, string> = {
  CANNOT_TARGET_SELF: "자기 자신은 선택할 수 없습니다.",
  TARGET_OFFLINE: "선택한 참가자의 연결이 끊겼습니다. 다른 사람을 선택해주세요.",
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  TARGET_SELECTION_NOT_ACTIVE: "이미 지목 단계가 종료되었습니다.",
  PLAYER_NOT_FOUND: "선택한 참가자가 방에 없습니다. 다른 사람을 선택해주세요.",
  GAME_PAUSED: "게임 종료 투표 중에는 선택할 수 없습니다.",
};

// Like the shared secondary button, but grows with a long name instead of a fixed height.
const choiceButton =
  "flex min-h-14 w-full items-center justify-center rounded-2xl bg-white dark:bg-zinc-800 px-4 py-3 text-lg font-bold text-violet-700 dark:text-violet-300 ring-2 ring-violet-200 dark:ring-violet-400/40 transition-colors hover:bg-violet-50 dark:hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-500 dark:disabled:text-zinc-400 disabled:ring-zinc-200 dark:disabled:ring-zinc-700";

export function TargetPrompt({
  performerName,
  isPerformer,
  performerOnline,
  paused,
}: {
  performerName: string;
  isPerformer: boolean;
  performerOnline: boolean;
  paused: boolean;
}) {
  return (
    <section aria-labelledby="target-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="target-title" tone="drink" icon="👉" label="지목 한 잔">
        {performerName}님이 한 명을 선택합니다.
      </EventHeader>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {isPerformer
          ? "한 잔 마실 사람을 선택하세요."
          : `${performerName}님이 지목할 사람을 선택하는 중입니다.`}
      </p>
      {paused && <p className={CALLOUT}>게임 종료 투표가 진행 중입니다.</p>}
      {!performerOnline && (
        <p className={CALLOUT}>{performerName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

// Only the player who 지목s gets these. `targets` is room:state's eligibleTargets (who else
// is online right now), so it is only a hint: the backend checks every pick again.
export function TargetChoices({
  targets,
  socketRef,
  connected,
  paused,
}: {
  targets: PlayerName[];
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  function select(targetPlayerId: string) {
    const socket = socketRef.current;
    if (!socket || pending.current) {
      return;
    }
    pending.current = true;
    setSelectingId(targetPlayerId);
    setError(null);
    // Only the target's id: who picks, the room and the drink are decided by the server.
    socket
      .timeout(5000)
      .emit(
        "game:target-select",
        { targetPlayerId },
        (failure: Error | null, ack: TargetSelectAck) => {
          const message = failure
            ? "서버 응답이 없습니다. 다시 시도해주세요."
            : ack.ok
              ? null
              : (TARGET_ERRORS[ack.code] ?? "지목하지 못했습니다. 다시 시도해주세요.");
          if (message === null) {
            // game:target-selected and the next turn's room:state close this screen.
            return;
          }
          pending.current = false;
          setSelectingId(null);
          setError(message);
        },
      );
  }

  const hint =
    selectingId !== null
      ? "선택을 처리하는 중입니다."
      : paused
        ? "게임 종료 투표가 끝나면 선택할 수 있습니다."
        : !connected
          ? "서버와 다시 연결되면 선택할 수 있습니다."
          : targets.length === 0
            ? "지금 지목할 수 있는 접속 중 참가자가 없습니다. 누군가 다시 접속하면 선택할 수 있습니다."
            : "누르는 즉시 그 사람이 지목됩니다.";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      {targets.length > 0 && (
        <ul className="flex flex-col gap-2">
          {targets.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                onClick={() => select(target.id)}
                disabled={!connected || paused || selectingId !== null}
                aria-describedby="target-hint"
                className={choiceButton}
              >
                {selectingId === target.id
                  ? `${target.displayName} · 선택 중...`
                  : target.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p id="target-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {hint}
      </p>
      <FormError message={error} />
    </div>
  );
}
