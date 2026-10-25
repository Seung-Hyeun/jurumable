// The 30-tile board, in the same order as backend/src/rooms/board.ts. The backend decides
// every move; this file only describes how to draw the board.
export type TileType =
  | "START"
  | "MISSION"
  | "REST"
  | "PENALTY"
  | "ONE_DRINK"
  | "TWO_DRINKS"
  | "ADD_DRINK"
  | "DRINK_ACCUMULATED"
  | "QA"
  | "TARGET_DRINK";

export const BOARD_TILES: readonly TileType[] = [
  "START", // 0
  "MISSION", // 1
  "REST", // 2
  "ONE_DRINK", // 3
  "QA", // 4
  "ADD_DRINK", // 5
  "MISSION", // 6
  "TARGET_DRINK", // 7
  "REST", // 8
  "PENALTY", // 9
  "QA", // 10
  "MISSION", // 11
  "ONE_DRINK", // 12
  "REST", // 13
  "ADD_DRINK", // 14
  "QA", // 15
  "MISSION", // 16
  "TWO_DRINKS", // 17
  "TARGET_DRINK", // 18
  "REST", // 19
  "MISSION", // 20
  "ADD_DRINK", // 21
  "QA", // 22
  "ONE_DRINK", // 23
  "PENALTY", // 24
  "MISSION", // 25
  "TARGET_DRINK", // 26
  "DRINK_ACCUMULATED", // 27
  "QA", // 28
  "MISSION", // 29
];

export const BOARD_SIZE = BOARD_TILES.length; // 30, like the backend

export const TILE_LABEL: Record<TileType, string> = {
  START: "출발",
  MISSION: "미션",
  REST: "쉬어가기",
  PENALTY: "벌칙",
  ONE_DRINK: "한 잔",
  TWO_DRINKS: "두 잔",
  ADD_DRINK: "+1 적립",
  DRINK_ACCUMULATED: "적립잔 마시기",
  QA: "Q&A",
  TARGET_DRINK: "지목 한 잔",
};

// For the small tiles on phones.
export const TILE_SHORT: Record<TileType, string> = {
  START: "출발",
  MISSION: "미션",
  REST: "휴식",
  PENALTY: "벌칙",
  ONE_DRINK: "1잔",
  TWO_DRINKS: "2잔",
  ADD_DRINK: "+1",
  DRINK_ACCUMULATED: "적립↓",
  QA: "Q&A",
  TARGET_DRINK: "지목",
};

// One soft color per family (start, rest, events, penalty, drinks, saved drinks) instead of one
// per type; the icon and the label tell the types of a family apart. Decoration only.
export const TILE_TONE: Record<TileType, string> = {
  START: "bg-amber-200 dark:bg-amber-500/35",
  REST: "bg-emerald-100 dark:bg-emerald-500/20",
  MISSION: "bg-violet-100 dark:bg-violet-500/20",
  QA: "bg-violet-50 dark:bg-violet-500/10",
  PENALTY: "bg-rose-200 dark:bg-rose-500/35",
  ONE_DRINK: "bg-orange-100 dark:bg-orange-500/20",
  TWO_DRINKS: "bg-orange-200 dark:bg-orange-500/35",
  TARGET_DRINK: "bg-orange-50 dark:bg-orange-500/10",
  ADD_DRINK: "bg-sky-100 dark:bg-sky-500/20",
  DRINK_ACCUMULATED: "bg-sky-200 dark:bg-sky-500/35",
};

export const TILE_ICON: Record<TileType, string> = {
  START: "🏁",
  MISSION: "🎯",
  REST: "☕",
  PENALTY: "🎡",
  ONE_DRINK: "🥃",
  TWO_DRINKS: "🍻",
  ADD_DRINK: "➕",
  DRINK_ACCUMULATED: "🍶",
  QA: "❓",
  TARGET_DRINK: "👉",
};

// 1-based grid cell of tile `index` on the border of a cols × rows grid, clockwise from the
// top-left corner. A border has 2 × (cols + rows) − 4 cells: 6 × 11 and 9 × 8 both hold 30.
export function perimeterCell(index: number, cols: number, rows: number) {
  const right = cols + rows - 1; // first index past the right column
  const bottom = right + cols - 1; // first index past the bottom row
  if (index < cols) {
    return { row: 1, col: index + 1 };
  }
  if (index < right) {
    return { row: index - cols + 2, col: cols };
  }
  if (index < bottom) {
    return { row: rows, col: cols - (index - right + 1) };
  }
  return { row: rows - (index - bottom + 1), col: 1 };
}
