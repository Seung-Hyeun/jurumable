export enum TileType {
  START = 'START',
  MISSION = 'MISSION',
  REST = 'REST',
  PENALTY = 'PENALTY',
  ONE_DRINK = 'ONE_DRINK',
  TWO_DRINKS = 'TWO_DRINKS',
  ADD_DRINK = 'ADD_DRINK',
  DRINK_ACCUMULATED = 'DRINK_ACCUMULATED',
  QA = 'QA',
  TARGET_DRINK = 'TARGET_DRINK',
}

// Initial balance before play-testing: change the tile layout here only.
export const BOARD_TILES = [
  TileType.START, // 0
  TileType.MISSION, // 1
  TileType.REST, // 2
  TileType.ONE_DRINK, // 3
  TileType.QA, // 4
  TileType.ADD_DRINK, // 5
  TileType.MISSION, // 6
  TileType.TARGET_DRINK, // 7
  TileType.REST, // 8
  TileType.PENALTY, // 9
  TileType.QA, // 10
  TileType.MISSION, // 11
  TileType.ONE_DRINK, // 12
  TileType.REST, // 13
  TileType.ADD_DRINK, // 14
  TileType.QA, // 15
  TileType.MISSION, // 16
  TileType.TWO_DRINKS, // 17
  TileType.TARGET_DRINK, // 18
  TileType.REST, // 19
  TileType.MISSION, // 20
  TileType.ADD_DRINK, // 21
  TileType.QA, // 22
  TileType.ONE_DRINK, // 23
  TileType.PENALTY, // 24
  TileType.MISSION, // 25
  TileType.TARGET_DRINK, // 26
  TileType.DRINK_ACCUMULATED, // 27
  TileType.QA, // 28
  TileType.MISSION, // 29
] as const;

export const BOARD_SIZE = BOARD_TILES.length;

export function movePosition(fromPosition: number, dice: number) {
  return (fromPosition + dice) % BOARD_SIZE;
}

export function getTile(position: number): { index: number; type: TileType } {
  if (!Number.isInteger(position) || position < 0 || position >= BOARD_SIZE) {
    throw new RangeError(`Invalid board position: ${position}`);
  }
  return { index: position, type: BOARD_TILES[position] };
}

export type TileEffect =
  | { type: 'START' }
  | { type: 'REST' }
  | { type: 'DRINK'; amount: number }
  | { type: 'ADD_DRINK'; before: number; after: number }
  | { type: 'DRINK_ACCUMULATED'; amount: number };

// Tiles the server resolves on its own. Returns null for tiles that need
// player input (MISSION, PENALTY, QA, TARGET_DRINK).
export function resolveAutoTile(
  type: TileType,
  accumulatedDrinks: number,
): { effect: TileEffect; accumulatedDrinks: number } | null {
  switch (type) {
    case TileType.START:
      return { effect: { type: 'START' }, accumulatedDrinks };
    case TileType.REST:
      return { effect: { type: 'REST' }, accumulatedDrinks };
    case TileType.ONE_DRINK:
      return { effect: { type: 'DRINK', amount: 1 }, accumulatedDrinks };
    case TileType.TWO_DRINKS:
      return { effect: { type: 'DRINK', amount: 2 }, accumulatedDrinks };
    case TileType.ADD_DRINK:
      return {
        effect: {
          type: 'ADD_DRINK',
          before: accumulatedDrinks,
          after: accumulatedDrinks + 1,
        },
        accumulatedDrinks: accumulatedDrinks + 1,
      };
    case TileType.DRINK_ACCUMULATED:
      return {
        effect: { type: 'DRINK_ACCUMULATED', amount: accumulatedDrinks },
        accumulatedDrinks: 0,
      };
    default:
      return null;
  }
}
