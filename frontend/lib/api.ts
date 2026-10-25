// REST calls and payload types for the NestJS backend (shapes taken from the backend code).
// The base URL comes from .env.local and is inlined into the client bundle at build time.
import type { TileType } from "./board";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type RoomStatus = "WAITING" | "PLAYING" | "ENDED";

export interface RoomInfo {
  id: string;
  code: string;
  maxPlayers: number;
  status: RoomStatus;
}

// Returned once by create / join; the token must only ever go to session storage.
export interface IssuedPlayer {
  id: string;
  nickname: string;
  displayName: string;
  isHost: boolean;
  reconnectToken: string;
}

// `room:state` socket payload, limited to what the lobby and the game screen use.
export interface RoomStatePlayer {
  id: string;
  nickname: string;
  displayName: string;
  isHost: boolean;
  turnOrder: number | null;
  position: number;
  accumulatedDrinks: number;
  isOnline: boolean;
}

export type TurnPhase = "AWAITING_ROLL" | "RESOLVING_TILE";

export interface PlayerName {
  id: string;
  displayName: string;
}

export type MissionStage = "READY" | "RUNNING" | "AWAITING_VOTE" | "PENALTY_PENDING";

// The mission snapshot taken when the tile was reached; startedAt / endsAt only once a timed
// mission runs (server times, ISO strings).
export interface ActiveMission {
  content: string;
  type: MissionType;
  durationSeconds: number | null;
  stage: MissionStage;
  startedAt: string | null;
  endsAt: string | null;
}

// How many have voted on a mission or on ending the game: never who, and never the choices
// until the result.
export interface VoteProgress {
  voted: number;
  total: number;
}

export type PenaltySource = "TILE" | "MISSION_FAILURE";

// QA carries the question snapshot taken when the tile was reached (the backend also sends its
// id). TARGET_DRINK's eligibleTargets is worked out from presence on every room:state. MISSION
// comes with the server's clock (serverTime) for the countdown, and voteProgress while
// AWAITING_VOTE (it does not say whether this player has voted). A failed mission waiting for
// its penalty arrives as PENALTY with source MISSION_FAILURE and that mission's snapshot.
// QA_SELECTING: the current player is on a QA tile and the question is not chosen yet (they
// pick one, or ask the server for a random one); QA follows once it is.
// A QA with direct: true has no question from the list: a player or a viewer asks it live.
export type ActiveEvent =
  | { type: "QA"; question: { content: string }; direct?: true }
  | { type: "QA_SELECTING"; playerId: string; displayName: string }
  | {
      type: "MISSION";
      playerId: string | null;
      displayName: string | null;
      mission: ActiveMission;
      voteProgress: VoteProgress | null;
      serverTime: string;
    }
  | {
      type: "PENALTY";
      playerId: string | null;
      displayName: string | null;
      source: PenaltySource;
      mission: ActiveMission | null;
    }
  | {
      type: "TARGET_DRINK";
      playerId: string;
      displayName: string;
      eligibleTargets: PlayerName[];
    };

export interface RoomStatePayload {
  room: RoomInfo & {
    currentTurnOrder: number | null;
    turnPhase: TurnPhase | null;
  };
  players: RoomStatePlayer[];
  activeEvent: ActiveEvent | null;
  // Present while an end-game vote pauses the game. total is every player in the room, online
  // or not; like voteProgress, it does not say whether this player has voted.
  endVote: { active: true; voted: number; total: number } | null;
  // The latest missions / penalties of this game, newest first (the backend keeps them in the
  // DB, so a refresh shows the same list).
  history: HistoryEntry[];
  // The server clock when this state was sent, for every countdown.
  serverTime: string;
}

export type HistoryStatus = "IN_PROGRESS" | "SUCCESS" | "FAILED" | "INVALID" | "CANCELLED" | "DONE";

// One mission or penalty a player got, as it was at the time (a snapshot). A timed penalty is
// IN_PROGRESS until endsAt; from then on it is over, even if the status still says IN_PROGRESS.
export interface HistoryEntry {
  id: string;
  playerId: string;
  displayName: string;
  kind: "MISSION" | "PENALTY";
  content: string;
  durationSeconds: number | null;
  penaltySource: PenaltySource | null;
  status: HistoryStatus;
  startedAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

// `game:dice-rolled` and `game:tile-resolved` (after an automatic tile) payloads.
export interface DiceRolled {
  playerId: string;
  displayName: string;
  dice: number;
  fromPosition: number;
  toPosition: number;
  tile: { index: number; type: TileType };
}

export type TileEffect =
  | { type: "START" }
  | { type: "REST" }
  | { type: "DRINK"; amount: number }
  | { type: "ADD_DRINK"; before: number; after: number }
  | { type: "DRINK_ACCUMULATED"; amount: number };

export interface TileResolved {
  playerId: string;
  displayName: string;
  tile: { index: number; type: TileType };
  effect: TileEffect;
}

// `game:qa-selected`: the question the current player chose (random: the server picked it;
// direct: none from the list, it is asked live).
export interface QaSelected {
  playerId: string;
  displayName: string;
  question: { id: string | null; content: string };
  random: boolean;
  direct: boolean;
}

// `game:qa-completed` payload.
export interface QaCompleted {
  playerId: string;
  displayName: string;
}

// `game:target-selected` payload. The drink is only an instruction: nothing is recorded.
export interface TargetSelected {
  sourcePlayer: PlayerName;
  targetPlayer: PlayerName;
  effect: { type: "DRINK"; amount: number };
}

// `game:mission-started`: only the server clock is used here; the start and end times are read
// from room:state.
export interface MissionStarted {
  serverTime: string;
}

// `game:mission-finished` payload.
export interface MissionFinished {
  playerId: string;
  displayName: string;
  reason: "COMPLETED" | "TIMER_EXPIRED";
}

// `game:mission-vote-result`: only now are the O / X counts public.
export interface MissionVoteResult {
  playerId: string | null;
  displayName: string | null;
  o: number;
  x: number;
  result: "SUCCESS" | "FAILED" | "INVALID";
}

// `game:penalty-ready` / `game:penalty-empty`: only the source is used here so far.
export interface PenaltyStarted {
  source: PenaltySource;
}

// `game:penalty-result`: the penalty the server picked (final; the screen only shows it).
export interface PenaltyResult {
  playerId: string | null;
  displayName: string | null;
  source: PenaltySource;
  // startedAt / endsAt for a timed penalty, which runs on while the game goes on.
  penalty: {
    id: string;
    content: string;
    type: PenaltyType;
    durationSeconds: number | null;
    startedAt: string | null;
    endsAt: string | null;
  };
}

// `game:end-vote-result`: only now are the YES / NO counts public. ended is the backend's
// decision (a strict majority of every player) and is used as it is.
export interface EndVoteResult {
  ended: boolean;
  yes: number;
  no: number;
  total: number;
}

// `room:host-changed`: the host stayed offline past the grace period and the server gave the
// role to an online player. Only a message: room:state carries the new isHost flags.
export interface HostChanged {
  previousHostPlayerId: string;
  newHostPlayerId: string;
  newHostDisplayName: string;
}

// Socket acknowledgements: `game:start`, `game:roll`, `game:qa-complete`, `game:target-select`,
// `game:mission-start` / `-complete` / `-vote`, `game:penalty-spin`, `game:end-request` /
// `game:end-vote` and `player:kick`.
export type StartAck =
  | { ok: true; firstPlayerId: string; firstPlayerDisplayName: string }
  | { ok: false; code: string; message: string };

export type RollAck =
  | {
      ok: true;
      dice: number;
      fromPosition: number;
      toPosition: number;
      tile: { index: number; type: TileType };
      autoResolved: boolean;
    }
  | { ok: false; code: string; message: string };

export type QaCompleteAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// `game:qa-select` / `game:qa-random` / `game:qa-direct` (NO_QUESTIONS: nothing to draw from).
export type QaSelectAck =
  | { ok: true; question: { id: string | null; content: string }; random: boolean; direct: boolean }
  | { ok: false; code: string; message: string };

// On success the backend also sends targetPlayer, or empty: true when the tile was skipped.
export type TargetSelectAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// For a vote the backend also sends voted / total, or the result on the last vote.
export type MissionAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// On success the backend also sends source + penalty, or empty: true when nothing was left.
export type PenaltySpinAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type EndRequestAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// For a vote the backend also sends completed with voted / total, or ended on the last vote.
export type EndVoteAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type KickAck =
  | { ok: true; playerId: string }
  | { ok: false; code: string; message: string };

export type LeaveAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// Room content (Q&A, missions, penalties): every player in the room may edit it.
export interface Question {
  id: string;
  content: string;
}

export type MissionType = "NORMAL" | "TIMED";

export interface Mission {
  id: string;
  content: string;
  type: MissionType;
  durationSeconds: number | null;
}

// TIMED penalties last durationSeconds while the game goes on; NORMAL ones are done at once.
export type PenaltyType = MissionType;

export interface Penalty {
  id: string;
  content: string;
  type: PenaltyType;
  durationSeconds: number | null;
}

export interface ContentMap {
  questions: Question;
  missions: Mission;
  penalties: Penalty;
}

export type ContentKind = keyof ContentMap;

export const CONTENT_KINDS: ContentKind[] = ["questions", "missions", "penalties"];

// null = not loaded yet.
export type Contents = { [K in ContentKind]: ContentMap[K][] | null };

// PATCH replaces the whole item, so it takes the same body as POST.
export interface ContentInputMap {
  questions: { content: string };
  missions:
    | { content: string; type: "NORMAL" }
    | { content: string; type: "TIMED"; durationSeconds: number };
  penalties:
    | { content: string; type: "NORMAL" }
    | { content: string; type: "TIMED"; durationSeconds: number };
}

// The single-item key in POST / PATCH responses: { question }, { mission }, { penalty }.
const ITEM_KEY = {
  questions: "question",
  missions: "mission",
  penalties: "penalty",
} as const;

export type ApiFailure = { ok: false; status: number; message: unknown };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const MALFORMED: ApiFailure = { ok: false, status: 500, message: null };

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  { body, token }: { body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  if (!API_BASE_URL) {
    console.error("NEXT_PUBLIC_API_BASE_URL is not set (see frontend/.env.local)");
    return { ok: false, status: 0, message: null };
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    // The reconnect token only ever leaves the browser in this header (and the socket handshake).
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      return { ok: true, data: json as T };
    }
    const message = (json as { message?: unknown } | null)?.message ?? null;
    return { ok: false, status: res.status, message };
  } catch {
    // fetch only rejects when the server could not be reached at all.
    return { ok: false, status: 0, message: null };
  }
}

export function createRoom(nickname: string, maxPlayers: number) {
  return request<{ room: RoomInfo; host: IssuedPlayer }>("POST", "/rooms", {
    body: { nickname, maxPlayers },
  });
}

export function joinRoom(code: string, nickname: string) {
  return request<{ room: RoomInfo; player: IssuedPlayer }>(
    "POST",
    `/rooms/${encodeURIComponent(code)}/join`,
    { body: { nickname } },
  );
}

export function reconnectRoom(code: string, reconnectToken: string) {
  return request<{ room: RoomInfo; player: { id: string; displayName: string } }>(
    "POST",
    `/rooms/${encodeURIComponent(code)}/reconnect`,
    { body: { reconnectToken } },
  );
}

// Content API for one room, authorized with that player's reconnect token. The token stays in
// this closure, so components never hold it in state.
export function createRoomClient(code: string, token: string) {
  const base = `/rooms/${encodeURIComponent(code)}`;
  return {
    async list<K extends ContentKind>(kind: K): Promise<ApiResult<ContentMap[K][]>> {
      const result = await request<Record<string, unknown>>("GET", `${base}/${kind}`, { token });
      if (!result.ok) {
        return result;
      }
      const list = result.data?.[kind];
      return Array.isArray(list) ? { ok: true, data: list as ContentMap[K][] } : MALFORMED;
    },
    async create<K extends ContentKind>(
      kind: K,
      input: ContentInputMap[K],
    ): Promise<ApiResult<ContentMap[K]>> {
      const result = await request<Record<string, unknown>>("POST", `${base}/${kind}`, {
        body: input,
        token,
      });
      return itemOf(result, ITEM_KEY[kind]);
    },
    async update<K extends ContentKind>(
      kind: K,
      id: string,
      input: ContentInputMap[K],
    ): Promise<ApiResult<ContentMap[K]>> {
      const result = await request<Record<string, unknown>>(
        "PATCH",
        `${base}/${kind}/${encodeURIComponent(id)}`,
        { body: input, token },
      );
      return itemOf(result, ITEM_KEY[kind]);
    },
    remove(kind: ContentKind, id: string) {
      return request<{ id: string }>("DELETE", `${base}/${kind}/${encodeURIComponent(id)}`, {
        token,
      });
    },
  };
}

export type RoomClient = ReturnType<typeof createRoomClient>;

function itemOf<T>(result: ApiResult<Record<string, unknown>>, key: string): ApiResult<T> {
  if (!result.ok) {
    return result;
  }
  const item = result.data?.[key];
  return item && typeof item === "object" ? { ok: true, data: item as T } : MALFORMED;
}

// Backend messages are English (and partly internal), so users get Korean text instead.
export function requestErrorMessage({ status, message }: ApiFailure, action: "create" | "join") {
  const text = Array.isArray(message) ? message.join(" ") : String(message ?? "");
  if (status === 0) {
    return "서버에 연결할 수 없습니다.";
  }
  if (status === 429) {
    return action === "create"
      ? "방 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
      : "참여 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status === 404) {
    return "존재하지 않는 방입니다.";
  }
  if (status === 409) {
    return text.includes("full")
      ? "방의 인원이 가득 찼습니다."
      : "이미 게임이 시작된 방입니다.";
  }
  if (status === 400) {
    if (text.includes("maxPlayers")) {
      return "최대 인원은 2~6명 중에서 골라주세요.";
    }
    return text.includes("nickname")
      ? "닉네임은 1~20자로 입력해주세요."
      : "입력값을 다시 확인해주세요.";
  }
  return status >= 500
    ? "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

const CONTENT_ACTION = { create: "추가", update: "수정", delete: "삭제" } as const;

// e.g. "질문을 추가하지 못했습니다." (질문 / 미션 / 벌칙 all take 을 / 이).
export function contentErrorMessage(
  noun: string,
  action: keyof typeof CONTENT_ACTION,
  { status }: ApiFailure,
) {
  const base = `${noun}을 ${CONTENT_ACTION[action]}하지 못했습니다.`;
  if (status === 0) {
    return `${base} 서버에 연결할 수 없습니다.`;
  }
  if (status === 404) {
    return `${base} 이미 삭제된 ${noun}입니다.`;
  }
  if (status === 400) {
    return `${base} 입력값을 다시 확인해주세요.`;
  }
  if (status === 429) {
    return `${base} 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.`;
  }
  return base;
}

// Input rules mirrored from the backend DTOs, only for quick feedback; the backend decides.
export const NICKNAME_MAX_LENGTH = 20;
export const MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6];
export const ROOM_CODE_LENGTH = 6;

export function nicknameError(nickname: string) {
  const value = nickname.trim();
  if (!value) {
    return "닉네임을 입력해주세요.";
  }
  // Code points, like the backend: an emoji counts as one character.
  if (Array.from(value).length > NICKNAME_MAX_LENGTH) {
    return `닉네임은 ${NICKNAME_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  return null;
}

export function normalizeRoomCode(value: string) {
  return value.replace(/\s/g, "").toUpperCase().slice(0, ROOM_CODE_LENGTH);
}

// The characters the backend makes room codes from (its ROOM_CODE_CHARS).
const ROOM_CODE_PATTERN = new RegExp(`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{${ROOM_CODE_LENGTH}}$`);

export function isRoomCode(value: string) {
  return ROOM_CODE_PATTERN.test(value);
}
