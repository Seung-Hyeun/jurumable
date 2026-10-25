import type { CSSProperties, ReactNode } from "react";
import type { RoomStatePlayer } from "@/lib/api";
import {
  BOARD_TILES,
  TILE_ICON,
  TILE_LABEL,
  TILE_SHORT,
  TILE_TONE,
  perimeterCell,
} from "@/lib/board";

// The 30 tiles run clockwise around the border of a grid: 6 × 11 on phones (tall and
// narrow), 9 × 8 from sm up. Each tile carries both cells as CSS variables.
const CELLS = BOARD_TILES.map((type, index) => {
  const phone = perimeterCell(index, 6, 11);
  const wide = perimeterCell(index, 9, 8);
  const style = {
    "--phone-row": phone.row,
    "--phone-col": phone.col,
    "--wide-row": wide.row,
    "--wide-col": wide.col,
  } as CSSProperties;
  return { index, type, style };
});

// One color per turn order; the number on the token is what identifies it. Your own token is
// drawn inverted (white, dark border, "나"), so it does not depend on color either. The player
// whose turn it is also gets an amber ring inside the token (inside, so it never covers a
// neighbor); the list and the center panel say whose turn it is in words. In the dark theme the
// colored tokens get a light outline and the tiles a faint border, so neither melts into the
// dark board; your white token and the white die stay as they are.
const TOKEN_TONE = [
  "bg-violet-700",
  "bg-sky-700",
  "bg-emerald-700",
  "bg-orange-700",
  "bg-rose-700",
  "bg-slate-700",
];
const MY_TOKEN = "border-2 border-zinc-900 bg-white text-zinc-900";

// Entering the DOM (a new tile, or a new roll) starts from these styles, so moves "pop" in.
const POP_IN =
  "starting:scale-50 starting:opacity-0 motion-safe:transition-[scale,opacity] motion-safe:duration-300";

export function PlayerToken({
  player,
  isMe,
  isCurrent = false,
}: {
  player: RoomStatePlayer;
  isMe: boolean;
  isCurrent?: boolean;
}) {
  const order = player.turnOrder ?? 0;
  return (
    <span
      aria-hidden="true"
      title={player.displayName}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-black sm:size-6 sm:text-xs ${isMe ? MY_TOKEN : `${TOKEN_TONE[order % TOKEN_TONE.length]} text-white dark:outline dark:outline-white/50`} ${isCurrent ? "ring-2 ring-amber-300 ring-inset" : ""} ${POP_IN}`}
    >
      {isMe ? "나" : order + 1}
    </span>
  );
}

// Pip cells on a 3 × 3 grid, 0 = top-left and 8 = bottom-right.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Draws the value the server rolled. While rolling it only tumbles through faces for show
// (the caller passes them in turn); the value that counts is the server's, shown after.
export function Die({ value, rolling = false }: { value: number; rolling?: boolean }) {
  const pips = PIPS[value] ?? [];
  return (
    <span
      aria-hidden="true"
      className={`grid size-12 shrink-0 grid-cols-3 grid-rows-3 rounded-xl bg-white p-1.5 shadow-md ring-1 ring-black/10 dark:ring-white/15 sm:size-14 sm:p-2 ${rolling ? "dice-rolling" : POP_IN}`}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <span
          key={cell}
          className={`m-auto size-2 rounded-full sm:size-2.5 ${pips.includes(cell) ? "bg-zinc-900" : ""}`}
        />
      ))}
    </span>
  );
}

// Tiles are decoration for sighted players; the same facts are in the player list as text.
// arrival: the tile a token has just reached at the end of a roll, briefly marked.
export function GameBoard({
  players,
  myId,
  currentId,
  arrival = null,
  children,
}: {
  players: RoomStatePlayer[];
  myId: string;
  currentId: string | null;
  arrival?: number | null;
  children: ReactNode;
}) {
  const current = players.find((player) => player.id === currentId);
  return (
    <div className="grid grid-cols-6 grid-rows-[repeat(11,minmax(3.5rem,auto))] gap-1 rounded-3xl bg-white/70 dark:bg-zinc-900/70 p-2 shadow-sm ring-1 ring-black/5 dark:ring-white/10 sm:grid-cols-9 sm:grid-rows-[repeat(8,minmax(4.75rem,auto))] sm:gap-1.5 sm:p-3">
      {CELLS.map(({ index, type, style }) => {
        const here = players.filter((player) => player.position === index);
        return (
          <div
            key={index}
            data-tile={index}
            title={`${index} · ${TILE_LABEL[type]}`}
            aria-hidden="true"
            style={style}
            className={`flex min-w-0 flex-col gap-0.5 rounded-lg p-1 col-(--phone-col) row-(--phone-row) sm:col-(--wide-col) sm:row-(--wide-row) sm:p-1.5 ${TILE_TONE[type]} ${arrival === index ? "tile-arrival ring-4 ring-amber-400" : current?.position === index ? "ring-2 ring-violet-600 dark:ring-violet-400" : "dark:ring-1 dark:ring-white/10"}`}
          >
            <span className="flex items-center justify-between gap-0.5 text-[10px] leading-none font-bold text-zinc-600 dark:text-zinc-300 tabular-nums sm:text-xs">
              {index}
              <span className="text-xs leading-none sm:text-sm">{TILE_ICON[type]}</span>
            </span>
            <span className="text-[11px] leading-tight font-bold text-zinc-800 dark:text-zinc-200 sm:text-xs">
              <span className="sm:hidden">{TILE_SHORT[type]}</span>
              <span className="hidden sm:inline">{TILE_LABEL[type]}</span>
            </span>
            {here.length > 0 && (
              // Several players on one tile wrap side by side instead of covering each other.
              <span className="mt-auto flex flex-wrap gap-0.5">
                {here.map((player) => (
                  <PlayerToken
                    key={player.id}
                    player={player}
                    isMe={player.id === myId}
                    isCurrent={player.id === currentId}
                  />
                ))}
              </span>
            )}
          </div>
        );
      })}
      <div className="col-[2/-2] row-[2/-2] flex min-w-0 flex-col">
        {children}
      </div>
    </div>
  );
}
