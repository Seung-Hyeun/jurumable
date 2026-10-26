"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { BoardTile } from "@/lib/api";
import {
  BOARD_TILES,
  EDITABLE_TILE_TYPES,
  TILE_ICON,
  TILE_LABEL,
  TILE_LABEL_MAX_LENGTH,
  tileName,
  type TileType,
} from "@/lib/board";
import {
  FormError,
  cardClass,
  smallButton,
  smallDangerButton,
  smallPrimaryButton,
} from "../../_components/page-shell";
import { GameBoard } from "./game/game-board";

const BOARD_ERRORS: Record<string, string> = {
  FORBIDDEN: "방장만 보드를 수정할 수 있습니다.",
  BOARD_LOCKED: "게임이 시작된 후에는 보드를 수정할 수 없습니다.",
  INVALID_TILE: `칸 종류와 이름(${TILE_LABEL_MAX_LENGTH}자 이하)을 확인해주세요.`,
  PLAYER_NOT_FOUND: "참가자 정보를 찾을 수 없습니다.",
};

type BoardAck = { ok: true } | { ok: false; code: string; message: string };

// Sends one board change and reports a failure in words; the new board itself comes back to every
// screen in room:state.
function sendBoard(
  socket: Socket | null,
  event: "board:update-tile" | "board:reset",
  payload: object,
  done: (error: string | null) => void,
) {
  if (!socket) {
    done("서버와 연결되지 않았습니다.");
    return;
  }
  socket.timeout(5000).emit(event, payload, (failure: Error | null, ack: BoardAck) => {
    done(
      failure
        ? "서버 응답이 없습니다. 다시 시도해주세요."
        : ack.ok
          ? null
          : (BOARD_ERRORS[ack.code] ?? "보드를 바꾸지 못했습니다."),
    );
  });
}

// The room's board in the lobby, the same one the game will use. The host can change tiles 1..29
// before the game starts (보드 편집); everyone sees each change at once.
export function BoardPanel({
  board,
  isHost,
  socketRef,
  connected,
}: {
  board: BoardTile[];
  isHost: boolean;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tileIndex, setTileIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const changed = board.some((tile, index) => tile.label !== null || tile.type !== BOARD_TILES[index]);
  // Someone else may have become host (or the role moved away): editing is only for the host.
  const canEdit = isHost && editing;

  function reset() {
    if (resetting || !window.confirm("보드 설정을 기본값으로 되돌릴까요?")) {
      return;
    }
    setResetting(true);
    setError(null);
    sendBoard(socketRef.current, "board:reset", {}, (message) => {
      setResetting(false);
      setError(message);
    });
  }

  return (
    <section aria-labelledby="board-title" className={cardClass}>
      {/* The title and what can be done on the left; the host's 보드 편집 at the top right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="board-title" className="text-lg font-bold">
            보드
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {isHost
              ? "게임 시작 전에 칸 종류와 이름을 바꿀 수 있습니다."
              : "방장이 게임 시작 전에 칸을 바꿀 수 있습니다."}
          </p>
        </div>
        {isHost && (
          <button
            type="button"
            onClick={() => {
              setEditing((value) => !value);
              setError(null);
            }}
            disabled={!connected}
            aria-pressed={editing}
            className={`shrink-0 ${smallPrimaryButton}`}
          >
            {editing ? "완료" : "✏️ 보드 편집"}
          </button>
        )}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-violet-50 dark:bg-violet-500/10 px-4 py-3 ring-2 ring-violet-200 dark:ring-violet-400/40 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-violet-800 dark:text-violet-200">
            보드 편집 중 · 바꿀 칸을 누르세요. 0번 출발 칸은 바꿀 수 없습니다.
          </p>
          <button
            type="button"
            onClick={reset}
            disabled={!connected || resetting || !changed}
            className={`shrink-0 ${smallDangerButton}`}
          >
            {resetting ? "되돌리는 중..." : "기본 보드로 되돌리기"}
          </button>
        </div>
      )}
      <div className="mt-3 empty:hidden">
        <FormError message={error} />
      </div>
      <div className="mt-3">
        <GameBoard
          players={[]}
          myId=""
          currentId={null}
          tiles={board}
          onEdit={canEdit ? setTileIndex : undefined}
        >
          <div className="flex flex-1 items-center justify-center rounded-2xl bg-white/85 dark:bg-zinc-900/85 p-3 text-center">
            <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
              {canEdit ? "✏️ 보드 편집 중" : changed ? "이 방의 보드" : "기본 보드"}
            </p>
          </div>
        </GameBoard>
      </div>
      {canEdit && tileIndex !== null && board[tileIndex] && (
        <TileEditor
          key={tileIndex}
          tile={board[tileIndex]}
          socketRef={socketRef}
          connected={connected}
          onClose={() => setTileIndex(null)}
        />
      )}
    </section>
  );
}

// One tile's editor: its type (only the types the game supports) and an optional name. A sheet at
// the bottom on phones, a dialog in the middle on wider screens.
function TileEditor({
  tile,
  socketRef,
  connected,
  onClose,
}: {
  tile: BoardTile;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState<TileType>(tile.type);
  const [label, setLabel] = useState(tile.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const length = Array.from(label.trim()).length;

  // Escape closes it, like the cancel button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    if (length > TILE_LABEL_MAX_LENGTH) {
      setError(`이름은 ${TILE_LABEL_MAX_LENGTH}자 이하로 입력해주세요.`);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    sendBoard(
      socketRef.current,
      "board:update-tile",
      { index: tile.index, type, label: label.trim() },
      (message) => {
        pending.current = false;
        setSaving(false);
        if (message) {
          setError(message);
        } else {
          onClose();
        }
      },
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/40 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="tile-editor-title"
        onSubmit={save}
        noValidate
        className="flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white dark:bg-zinc-900 p-5 shadow-xl sm:max-w-sm sm:rounded-3xl"
      >
        <h2 id="tile-editor-title" className="text-lg font-black">
          보드 칸 수정 · {tile.index}번
        </h2>
        <div className="flex flex-col gap-2">
          <label htmlFor="tile-type" className="text-base font-bold">
            종류
          </label>
          <select
            id="tile-type"
            value={type}
            autoFocus
            onChange={(event) => setType(event.target.value as TileType)}
            className="h-12 w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-100 dark:focus-visible:ring-violet-500/30"
          >
            {EDITABLE_TILE_TYPES.map((option) => (
              <option key={option} value={option}>
                {TILE_ICON[option]} {TILE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="tile-label" className="text-base font-bold">
              표시 이름 <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">(선택)</span>
            </label>
            <span
              id="tile-label-count"
              className={`text-sm ${length > TILE_LABEL_MAX_LENGTH ? "font-bold text-rose-700 dark:text-rose-300" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {length}/{TILE_LABEL_MAX_LENGTH}
            </span>
          </div>
          <input
            id="tile-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={TILE_LABEL[type]}
            aria-describedby="tile-label-count tile-label-hint"
            className="h-12 w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-100 dark:focus-visible:ring-violet-500/30"
          />
          <p id="tile-label-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
            비워 두면 &quot;{tileName({ type, label: null })}&quot;(으)로 보입니다. 아이콘은 종류에 맞게 바뀝니다.
          </p>
        </div>
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={saving || !connected} className={smallPrimaryButton}>
            {saving ? "저장 중..." : "저장"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className={smallButton}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
