import { useRef, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { ActiveMission, PenaltySource, PenaltySpinAck } from "@/lib/api";
import { FormError, primaryButton } from "../../../_components/page-shell";
import { CALLOUT, EventHeader } from "./event-ui";

const SPIN_ERRORS: Record<string, string> = {
  PENALTY_NOT_ACTIVE: "현재 벌칙 룰렛을 진행할 수 없습니다.",
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다.",
  GAME_PAUSED: "게임 종료 투표가 진행 중입니다.",
};

const SOURCE_LINE: Record<PenaltySource, string> = {
  TILE: "벌칙 칸에 도착했습니다.",
  MISSION_FAILURE: "미션 실패로 벌칙을 받습니다.",
};

// Decoration only: no segment stands for a penalty, and nothing here picks one.
function Wheel() {
  return (
    <div aria-hidden="true" className="relative flex size-28 items-center justify-center">
      <span className="absolute -top-1 z-10 text-lg text-zinc-800 dark:text-zinc-200">▼</span>
      <div className="flex size-24 items-center justify-center rounded-full bg-[conic-gradient(var(--color-rose-200)_0_25%,var(--color-amber-200)_0_50%,var(--color-emerald-200)_0_75%,var(--color-sky-200)_0)] shadow-inner ring-4 ring-white dark:ring-zinc-800">
        <span className="text-4xl">🎡</span>
      </div>
    </div>
  );
}

// The roulette landing on the server's result, the same on every screen. The penalties flicking
// by are the room's list in order, for show only: the last frame is always the result the server
// already picked (and stored); nothing here chooses anything.
export function rouletteFrames(candidates: string[], result: string, count: number) {
  const list = candidates.length > 0 ? candidates : [result];
  const at = Math.max(0, list.indexOf(result));
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? result : list[(at - (count - 1 - i) + list.length * count) % list.length],
  );
}

export function PenaltyRoulette({
  performerName,
  label,
  frame,
  stopped,
}: {
  performerName: string;
  label: string;
  frame: string;
  stopped: boolean;
}) {
  return (
    <section aria-labelledby="roulette-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="roulette-title" tone="danger" icon="🎡" label="벌칙 룰렛">
        {performerName}님의 벌칙
      </EventHeader>
      <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">{label}</p>
      <div
        aria-hidden={!stopped}
        className={`flex min-h-24 w-full max-w-xs items-center justify-center rounded-2xl px-4 py-3 text-center font-black whitespace-pre-wrap wrap-anywhere ring-2 ${stopped ? "bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-rose-300 dark:ring-rose-400/50" : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 ring-zinc-200 dark:ring-zinc-700"}`}
      >
        {frame}
      </div>
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {stopped ? "벌칙이 정해졌습니다!" : "룰렛이 돌아가는 중..."}
      </p>
    </section>
  );
}

// TILE and MISSION_FAILURE share this screen; only the source line (and the failed mission's
// snapshot, when the backend sends it) differ.
export function PenaltyPrompt({
  performerName,
  isPerformer,
  performerOnline,
  source,
  failedMission,
  paused,
  notice,
}: {
  performerName: string;
  isPerformer: boolean;
  performerOnline: boolean;
  source: PenaltySource;
  failedMission: ActiveMission | null;
  paused: boolean;
  notice: { text: string; lines?: string[] } | null;
}) {
  return (
    <section aria-labelledby="penalty-title" className="flex w-full flex-col items-center gap-3">
      <EventHeader id="penalty-title" tone="danger" icon="🎡" label="벌칙 룰렛">
        {performerName}님의 벌칙
      </EventHeader>
      <p className="font-bold text-zinc-700 dark:text-zinc-300">{SOURCE_LINE[source]}</p>
      {failedMission && (
        <p className="w-full max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          실패한 미션: <span className="font-bold text-zinc-800 dark:text-zinc-200">{failedMission.content}</span>
        </p>
      )}
      <Wheel />
      <p className="font-semibold text-violet-700 dark:text-violet-300">
        {isPerformer
          ? "준비가 되면 룰렛을 돌리세요."
          : `${performerName}님이 룰렛을 돌리기를 기다리는 중...`}
      </p>
      {notice && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-black text-rose-700 dark:text-rose-300">{notice.text}</p>
          {notice.lines?.map((line) => (
            <p key={line} className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {line}
            </p>
          ))}
        </div>
      )}
      {paused && <p className={CALLOUT}>게임 종료 투표가 진행 중입니다.</p>}
      {!performerOnline && (
        <p className={CALLOUT}>{performerName}님의 재접속을 기다리는 중입니다.</p>
      )}
    </section>
  );
}

// Only the player getting the penalty has this, while the roulette waits (PLAYING +
// RESOLVING_TILE + PENALTY). The request carries nothing: the server picks from the latest list.
export function PenaltySpin({
  socketRef,
  connected,
  paused,
}: {
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  paused: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  function spin() {
    const socket = socketRef.current;
    if (!socket || pending.current) {
      return;
    }
    pending.current = true;
    setSpinning(true);
    setError(null);
    socket
      .timeout(5000)
      .emit("game:penalty-spin", {}, (failure: Error | null, ack: PenaltySpinAck) => {
        const message = failure
          ? "서버 응답이 없습니다. 다시 시도해주세요."
          : ack.ok
            ? null
            : (SPIN_ERRORS[ack.code] ?? "룰렛을 돌리지 못했습니다.");
        if (message === null) {
          // game:penalty-result (or -empty) and the next turn's room:state close this screen.
          return;
        }
        pending.current = false;
        setSpinning(false);
        setError(message);
      });
  }

  const hint = spinning
    ? "룰렛 돌리는 중..."
    : paused
      ? "게임 종료 투표가 끝나면 돌릴 수 있습니다."
      : !connected
        ? "서버와 다시 연결되면 돌릴 수 있습니다."
        : "누르면 등록된 벌칙 중 하나가 정해집니다.";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <button
        type="button"
        onClick={spin}
        disabled={!connected || paused || spinning}
        aria-describedby="penalty-hint"
        className={primaryButton}
      >
        {spinning ? (
          <>
            <span aria-hidden="true" className="mr-2 inline-block motion-safe:animate-spin">
              🎡
            </span>
            룰렛 돌리는 중...
          </>
        ) : (
          "룰렛 돌리기"
        )}
      </button>
      <p id="penalty-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
        {hint}
      </p>
      <FormError message={error} />
    </div>
  );
}
