"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  DiceRolled,
  EndRequestAck,
  EndVoteResult,
  KickAck,
  MissionFinished,
  MissionStarted,
  MissionVoteResult,
  Penalty,
  PenaltyResult,
  PenaltyStarted,
  QaCompleted,
  Question,
  RollAck,
  RoomStatePayload,
  RoomStatePlayer,
  TargetSelected,
  TileResolved,
  TurnPhase,
  VoteProgress,
} from "@/lib/api";
import { BOARD_SIZE, TILE_LABEL } from "@/lib/board";
import { formatDuration } from "@/lib/content";
import { clearSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Badge, PlayerBadges } from "../../../_components/badge";
import {
  FormError,
  PageShell,
  cardClass,
  primaryButton,
  smallDangerButton,
} from "../../../_components/page-shell";
import {
  BlockedScreen,
  ConnectionBadge,
  ConnectionNotice,
  HostChangedNotice,
  KICK_ERRORS,
  LeaveRoomButton,
  RoomLoading,
  RoomNotice,
  ShareActions,
  useTransientMessage,
} from "../room-ui";
import type { ContentItem } from "../content-panel";
import { useRoom } from "../use-room";
import { EndVoteOverlay, GameEnded } from "./end-vote-panel";
import { CALLOUT, contentSize } from "./event-ui";
import { Die, GameBoard, PlayerToken } from "./game-board";
import { HistoryPanel, type RollLogEntry } from "./history-panel";
import { MissionAction, MissionPrompt, MissionVote } from "./mission-panel";
import { PenaltyPrompt, PenaltyRoulette, PenaltySpin, rouletteFrames } from "./penalty-panel";
import {
  QaChoiceButtons,
  QaCompleteButton,
  QaPrompt,
  QaQuestionPicker,
  QaSelectPrompt,
} from "./qa-panel";
import { TargetChoices, TargetPrompt } from "./target-panel";

const PHASE_LABEL: Record<TurnPhase, string> = {
  AWAITING_ROLL: "주사위 대기",
  RESOLVING_TILE: "칸 효과 처리 중",
};

// The backend skips a manual tile, and moves the turn on, when there is nothing to play.
const SKIPPED = {
  qa: "등록된 Q&A가 없어 이번 칸은 넘어갑니다.",
  mission: "등록된 미션이 없어 이번 칸은 넘어갑니다.",
  penalty: "등록된 벌칙이 없어 이번 벌칙은 넘어갑니다.",
  failedPenalty: "등록된 벌칙이 없어 미션 실패 벌칙을 넘어갑니다.",
  target: "지목할 수 있는 접속 중 참가자가 없어 이번 칸은 넘어갑니다.",
};

const ROLL_ERRORS: Record<string, string> = {
  GAME_NOT_PLAYING: "게임이 진행 중이 아닙니다.",
  NOT_YOUR_TURN: "내 차례가 아닙니다.",
  INVALID_TURN_PHASE: "지금은 주사위를 굴릴 수 없습니다.",
  GAME_PAUSED: "게임 종료 투표 중에는 주사위를 굴릴 수 없습니다.",
};

const END_REQUEST_ERRORS: Record<string, string> = {
  FORBIDDEN: "방장만 게임 종료를 요청할 수 있습니다.",
  END_VOTE_ALREADY_ACTIVE: "이미 게임 종료 투표가 진행 중입니다.",
  GAME_NOT_PLAYING: "현재 게임을 종료 요청할 수 없습니다.",
};

// Only tells what the backend already applied; drinking itself is never checked or recorded.
function effectMessage({ displayName: name, tile, effect }: TileResolved) {
  switch (effect.type) {
    case "START":
      return "출발 칸입니다.";
    case "REST":
      return "쉬어가기!";
    case "DRINK":
      return tile.type === "TWO_DRINKS" ? `${name}님 두 잔!` : `${name}님 한 잔!`;
    case "ADD_DRINK":
      return `${name}님의 적립잔이 ${effect.after}잔이 되었습니다.`;
    case "DRINK_ACCUMULATED":
      return `${name}님, 적립된 ${effect.amount}잔!`;
  }
}

// seq changes on every roll, so the same result twice in a row still shows up again.
type ShownRoll = DiceRolled & { seq: number };

// How a roll is shown, the same on every screen: the die tumbles, the server's number shows, the
// token walks tile by tile, the tile it lands on lights up, and only then the tile's event. The
// server has already applied everything; this only holds back what is drawn. `base` is the state
// from before the roll (whose turn it was, the token's drinks); `tick` counts tumbles while
// rolling and tiles walked while moving.
type RollShow = {
  roll: DiceRolled;
  seq: number;
  phase: "rolling" | "reveal" | "moving" | "arrived";
  tick: number;
  base: RoomStatePayload | null;
};

// Faces shown while the die tumbles: a fixed sequence for show, never a game result.
const TUMBLE_FACES = [1, 3, 5, 2, 6, 4];
const TUMBLE_MS = 100;
const TUMBLES = 8; // 800 ms
const REVEAL_MS = 400;
const STEP_MS = 220;
const ARRIVAL_MS = 500;

const SHOW_DELAY: Record<RollShow["phase"], number> = {
  rolling: TUMBLE_MS,
  reveal: REVEAL_MS,
  moving: STEP_MS,
  arrived: ARRIVAL_MS,
};

function nextShow(show: RollShow): RollShow | null {
  switch (show.phase) {
    case "rolling":
      return show.tick + 1 < TUMBLES
        ? { ...show, tick: show.tick + 1 }
        : { ...show, phase: "reveal", tick: 0 };
    case "reveal":
      return { ...show, phase: "moving", tick: 1 };
    case "moving":
      return show.tick < show.roll.dice
        ? { ...show, tick: show.tick + 1 }
        : { ...show, phase: "arrived" };
    case "arrived":
      return null;
  }
}

// Where the rolling token is drawn: one tile further per step, wrapping from 29 to 0.
function shownPosition({ roll, phase, tick }: RollShow) {
  if (phase === "rolling" || phase === "reveal") {
    return roll.fromPosition;
  }
  return phase === "moving" ? (roll.fromPosition + tick) % BOARD_SIZE : roll.toPosition;
}

// The latest state as it is drawn during a roll: the turn, the turn phase, the roller's drinks
// and the mission / penalty history from before it (a mission picked on landing must not show up
// there first), the roller's token where the walk has got to, and no event yet. Everything else
// (presence, host, an end-game vote) is the latest.
function duringShow(show: RollShow, state: RoomStatePayload): RoomStatePayload {
  const base = show.base ?? state;
  const before = base.players.find((player) => player.id === show.roll.playerId);
  const position = shownPosition(show);
  return {
    ...state,
    room: {
      ...state.room,
      currentTurnOrder: base.room.currentTurnOrder,
      turnPhase: base.room.turnPhase,
    },
    players: state.players.map((player) =>
      player.id === show.roll.playerId
        ? { ...player, position, accumulatedDrinks: before?.accumulatedDrinks ?? player.accumulatedDrinks }
        : player,
    ),
    activeEvent: null,
    history: base.history,
  };
}

// The penalty roulette: penalties flick by, slowing down, and stop on the server's result
// (already picked and stored; the turn has already moved on). Like a roll it holds back the turn
// and the history until it has stopped, and plays only with motion allowed.
type SpinShow = { result: PenaltyResult; tick: number; base: RoomStatePayload | null };
const SPIN_FRAMES = 13;
const spinDelay = (tick: number) => (tick === SPIN_FRAMES - 1 ? 700 : 50 + tick * 13); // ~1.7 s, then the result

function duringSpin(spin: SpinShow, state: RoomStatePayload): RoomStatePayload {
  const base = spin.base ?? state;
  return {
    ...state,
    room: {
      ...state.room,
      currentTurnOrder: base.room.currentTurnOrder,
      turnPhase: base.room.turnPhase,
    },
    activeEvent: null,
    history: base.history,
  };
}

// 설정 > 애니메이션 끔 or the OS "reduce motion": the result is shown at once instead.
function motionAllowed() {
  return (
    getSettings().animationsEnabled &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// The latest event message, the same for everyone; lines are smaller lines under it. targetId
// marks a 지목 result, so the chosen player's own screen can say it more clearly. penalty is a
// roulette result, shown as its own card (the turn has already moved on by then).
type Notice = {
  text: string;
  lines?: string[];
  targetId?: string;
  penalty?: { label: string; content: string; durationSeconds: number | null };
};

// The O / X counts are public only now, with the result. For FAILED the next step is added by the
// penalty event that follows (roulette or nothing to spin).
function voteResultNotice({ result, o, x }: MissionVoteResult): Notice {
  const counts = `최종 투표 O ${o} : X ${x}`;
  switch (result) {
    case "SUCCESS":
      return { text: "미션 성공! 🎉", lines: [counts] };
    case "INVALID":
      return { text: "동률! 이번 미션은 무효입니다.", lines: ["벌칙 없이 다음 차례로 넘어갑니다.", counts] };
    case "FAILED":
      return { text: "미션 실패!", lines: [counts] };
  }
}

// Puts what happens after a failed mission above the vote result's counts.
const afterFailed = (line: string) => (previous: Notice | null) =>
  previous ? { ...previous, lines: [line, ...(previous.lines ?? [])] } : { text: line };

export default function GameScreen({ code }: { code: string }) {
  const router = useRouter();
  const [lastRoll, setLastRoll] = useState<ShownRoll | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Server clock minus browser clock, from the latest serverTime; keeps every countdown on the
  // server's endsAt even when a browser's clock is off.
  const [serverOffset, setServerOffset] = useState(0);
  // Mission vote progress from game:mission-vote-progress; the backend sends no room:state while
  // votes come in, so this keeps the count current between room:state updates.
  const [liveVote, setLiveVote] = useState<VoteProgress | null>(null);
  // The same for the end-game vote (game:end-vote-progress).
  const [liveEndVote, setLiveEndVote] = useState<VoteProgress | null>(null);
  // Keys the vote overlay, so a new end-game vote (or a reconnect, after which this page cannot
  // know whether it has voted) always starts with fresh buttons.
  const [endRound, setEndRound] = useState(0);
  // The latest game:end-vote-result: YES / NO counts only exist here, never in room:state.
  const [endResult, setEndResult] = useState<EndVoteResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const rollPending = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [endRequestError, setEndRequestError] = useState<string | null>(null);
  const requestPending = useRef(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [message, showMessage] = useTransientMessage();
  // The room's questions, for choosing the Q&A question (loaded like the lobby's lists).
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [questionsFailed, setQuestionsFailed] = useState(false);
  // Bumped whenever the list changes from the socket or an edit, so an older GET cannot win.
  const questionsVersion = useRef(0);
  // The room's penalties: what the roulette flicks through before it stops on the result.
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  // The roll being shown (see RollShow); null when nothing is held back.
  const [show, setShow] = useState<RollShow | null>(null);
  // The penalty roulette being shown (see SpinShow).
  const [spin, setSpin] = useState<SpinShow | null>(null);
  // 게임 기록: the latest rolls this screen has seen, newest first (not stored by the backend).
  const [log, setLog] = useState<RollLogEntry[]>([]);
  const rollSeq = useRef(0);
  // The state last drawn, so a roll can start from how things were just before it.
  const latest = useRef<RoomStatePayload | null>(null);

  const { view, connection, state, socketRef, retry, expireSession, hostChanged, reconnected } = useRoom(code, (s, { client, expire, isCancelled }) => {
    const loadQuestions = () => {
      const version = questionsVersion.current;
      void client.list("questions").then((result) => {
        if (isCancelled() || questionsVersion.current !== version) {
          return;
        }
        if (result.ok) {
          setQuestionsFailed(false);
          setQuestions(result.data);
        } else if (result.status === 401) {
          expire();
        } else {
          setQuestionsFailed(true);
        }
      });
    };
    // Rolls broadcast while this socket was away are not replayed, so an old one is dropped
    // (and never shown again); updates to the questions / penalties are not replayed either.
    s.on("connect", () => {
      setLastRoll(null);
      setShow(null);
      setSpin(null);
      setNotice(null);
      setLiveVote(null);
      setLiveEndVote(null);
      setEndRound((round) => round + 1);
      loadQuestions();
      void client.list("penalties").then((result) => {
        if (!isCancelled() && result.ok) {
          setPenalties(result.data);
        }
      });
    });
    s.on("questions:updated", (payload: { questions: Question[] }) => {
      questionsVersion.current += 1;
      setQuestions(payload.questions);
    });
    s.on("penalties:updated", (payload: { penalties: Penalty[] }) => setPenalties(payload.penalties));
    // Transient display only: the result and positions always come from the latest room:state.
    // The show starts from the state drawn so far, which is still the one before this roll.
    s.on("game:dice-rolled", (payload: DiceRolled) => {
      rollSeq.current += 1;
      const seq = rollSeq.current;
      setLastRoll({ ...payload, seq });
      setLog((list) =>
        [
          {
            seq,
            playerId: payload.playerId,
            displayName: payload.displayName,
            dice: payload.dice,
            fromPosition: payload.fromPosition,
            toPosition: payload.toPosition,
            tile: payload.tile.type,
          },
          ...list,
        ].slice(0, 20),
      );
      setNotice(null);
      setSpin(null);
      setShow(
        motionAllowed()
          ? { roll: payload, seq, phase: "rolling", tick: 0, base: latest.current }
          : null,
      );
    });
    s.on("game:tile-resolved", (payload: TileResolved) => {
      setNotice({ text: effectMessage(payload) });
      setLog((list) =>
        list.map((entry) =>
          entry.seq === rollSeq.current ? { ...entry, result: effectMessage(payload) } : entry,
        ),
      );
    });
    // The Q&A, 지목 and mission screens come from room:state.activeEvent (also after a
    // refresh), so these start signals only clear the previous message.
    s.on("game:qa", () => setNotice(null));
    s.on("game:qa-selected", () => setNotice(null));
    s.on("game:target-required", () => setNotice(null));
    s.on("game:mission", () => setNotice(null));
    s.on("room:state", (payload: RoomStatePayload) => {
      setServerOffset(Date.parse(payload.serverTime) - Date.now());
    });
    s.on("game:mission-started", (payload: MissionStarted) => {
      setServerOffset(Date.parse(payload.serverTime) - Date.now());
      setNotice({ text: "미션이 시작되었습니다." });
    });
    s.on("game:mission-finished", (payload: MissionFinished) => {
      setLiveVote(null); // a new voting round starts
      setNotice({
        text:
          payload.reason === "TIMER_EXPIRED" ? "시간이 종료되었습니다." : "미션 수행이 완료되었습니다.",
      });
    });
    s.on("game:mission-vote-progress", (payload: VoteProgress) => setLiveVote(payload));
    s.on("game:mission-vote-result", (payload: MissionVoteResult) => {
      setLiveVote(null);
      setNotice(voteResultNotice(payload));
    });
    s.on("game:penalty-ready", (payload: PenaltyStarted) => {
      if (payload.source === "MISSION_FAILURE") {
        setNotice(afterFailed("벌칙 룰렛으로 넘어갑니다."));
      }
    });
    s.on("game:qa-completed", (payload: QaCompleted) =>
      setNotice({ text: `${payload.displayName}님의 Q&A가 완료되었습니다.` }),
    );
    s.on("game:target-selected", ({ sourcePlayer, targetPlayer }: TargetSelected) => {
      setNotice({
        text: `${sourcePlayer.displayName}님이 ${targetPlayer.displayName}님을 지목했습니다! ${targetPlayer.displayName}님 한 잔!`,
        targetId: targetPlayer.id,
      });
      setLog((list) =>
        list.map((entry, i) =>
          i === 0 && entry.playerId === sourcePlayer.id
            ? { ...entry, result: `👉 ${targetPlayer.displayName}님 지목, 한 잔!` }
            : entry,
        ),
      );
    });
    s.on("game:qa-empty", () => setNotice({ text: SKIPPED.qa }));
    s.on("game:mission-empty", () => setNotice({ text: SKIPPED.mission }));
    s.on("game:penalty-empty", (payload: PenaltyStarted) =>
      setNotice(
        payload.source === "MISSION_FAILURE"
          ? afterFailed(SKIPPED.failedPenalty)
          : { text: SKIPPED.penalty },
      ),
    );
    // The server's pick, the same on every screen; it stays up after the turn moves on. With
    // motion allowed the roulette plays first and stops on it.
    s.on("game:penalty-result", (payload: PenaltyResult) => {
      const { displayName, source, penalty } = payload;
      setNotice({
        text: `${displayName ?? ""}님의 벌칙`,
        penalty: {
          label: source === "MISSION_FAILURE" ? "미션 실패 벌칙" : "벌칙 칸 결과",
          content: penalty.content,
          durationSeconds: penalty.durationSeconds,
        },
      });
      setSpin(motionAllowed() ? { result: payload, tick: 0, base: latest.current } : null);
    });
    s.on("game:target-empty", () => setNotice({ text: SKIPPED.target }));
    // Only voted / total while the end-game vote runs. Only the request sends voted 0, so that
    // marks a new vote.
    s.on("game:end-vote-progress", (payload: VoteProgress) => {
      setLiveEndVote(payload);
      if (payload.voted === 0) {
        setEndRound((round) => round + 1);
      }
    });
    // Whether the game ended is the backend's `ended`, as it is; room:state follows with the
    // ENDED status or the paused game state.
    s.on("game:end-vote-result", (payload: EndVoteResult) => {
      setEndRequestError(null);
      setEndResult(payload);
    });
  });
  const status = state?.room.status;

  // A rejected vote is only a passing message: the game is already back, and it goes after a few
  // seconds (an ended one stays on the ENDED screen until this page is left).
  useEffect(() => {
    if (!endResult || endResult.ended) {
      return;
    }
    const timer = window.setTimeout(() => setEndResult(null), 4000);
    return () => window.clearTimeout(timer);
  }, [endResult]);

  // A room that has not started belongs to the lobby. The lobby only forwards here when the
  // status is not WAITING, so the two pages can never bounce between each other.
  useEffect(() => {
    if (status === "WAITING") {
      router.replace(`/room/${code}`);
    }
  }, [status, code, router]);

  // game:dice-rolled arrives before the roll's room:state, so this still holds the state from
  // before the roll when the show starts.
  useEffect(() => {
    latest.current = state;
  }, [state]);

  // Moves the show on one tumble / tile / phase at a time; at the end the latest state is drawn.
  useEffect(() => {
    if (!show) {
      return;
    }
    const timer = window.setTimeout(
      () => setShow((current) => (current ? nextShow(current) : null)),
      SHOW_DELAY[show.phase],
    );
    return () => window.clearTimeout(timer);
  }, [show]);

  // The roulette slows down frame by frame, holds the result a moment, then lets the game on.
  useEffect(() => {
    if (!spin) {
      return;
    }
    const timer = window.setTimeout(
      () =>
        setSpin((current) =>
          current && current.tick + 1 < SPIN_FRAMES ? { ...current, tick: current.tick + 1 } : null,
        ),
      spinDelay(spin.tick),
    );
    return () => window.clearTimeout(timer);
  }, [spin]);

  function roll() {
    const socket = socketRef.current;
    if (!socket || rollPending.current) {
      return;
    }
    rollPending.current = true;
    setRolling(true);
    setRollError(null);
    // The backend rolls; every browser, this one included, sees it via game:dice-rolled.
    socket
      .timeout(5000)
      .emit("game:roll", {}, (error: Error | null, ack: RollAck) => {
        rollPending.current = false;
        setRolling(false);
        if (error) {
          setRollError("서버 응답이 없습니다. 다시 시도해주세요.");
        } else if (!ack.ok) {
          setRollError(ROLL_ERRORS[ack.code] ?? "주사위를 굴리지 못했습니다.");
        }
      });
  }

  function requestEnd() {
    const socket = socketRef.current;
    if (!socket || requestPending.current) {
      return;
    }
    if (!window.confirm("게임 종료 투표를 시작할까요?")) {
      return;
    }
    requestPending.current = true;
    setRequesting(true);
    setEndRequestError(null);
    // Nothing in the payload: the server checks who asks (and that it is the host) on the socket.
    // The overlay comes from room:state.endVote, which the server sends before this reply.
    socket
      .timeout(5000)
      .emit("game:end-request", {}, (error: Error | null, ack: EndRequestAck) => {
        requestPending.current = false;
        setRequesting(false);
        if (error) {
          setEndRequestError("서버 응답이 없습니다. 다시 시도해주세요.");
        } else if (!ack.ok) {
          setEndRequestError(END_REQUEST_ERRORS[ack.code] ?? "게임 종료를 요청하지 못했습니다.");
        }
      });
  }

  // The same kick as in the lobby: a player who stays away can be taken out of the game, so their
  // turn or vote does not hold everyone up (the backend closes up the turn order).
  function kickPlayer(player: RoomStatePlayer) {
    const socket = socketRef.current;
    if (
      !socket ||
      kickingId ||
      !window.confirm(`${player.displayName}님을 게임에서 내보낼까요?`)
    ) {
      return;
    }
    setKickingId(player.id);
    setKickError(null);
    socket
      .timeout(5000)
      .emit("player:kick", { playerId: player.id }, (error: Error | null, ack: KickAck) => {
        setKickingId(null);
        if (error) {
          setKickError("서버 응답이 없습니다. 다시 시도해주세요.");
        } else if (!ack.ok) {
          setKickError(KICK_ERRORS[ack.code] ?? "참가자를 내보내지 못했습니다.");
        }
      });
  }

  // Only this browser leaves: the session goes, while the room and its players stay in the DB.
  function goHome() {
    clearSession();
    router.push("/");
  }

  function retryGame() {
    setLastRoll(null);
    setShow(null);
    setNotice(null);
    retry();
  }

  // Applies the requester's own REST result right away; the socket update follows for everyone.
  function patchQuestions(update: (list: ContentItem[]) => ContentItem[]) {
    questionsVersion.current += 1;
    setQuestions((list) => (list ? update(list) : list));
  }

  if (view.kind === "checking") {
    return <RoomLoading message="게임 화면 연결 중..." />;
  }
  if (view.kind === "blocked") {
    return <BlockedScreen problem={view} onRetry={retryGame} />;
  }
  if (!state) {
    return <RoomLoading message="게임 화면 연결 중..." />;
  }
  if (state.room.status === "WAITING") {
    return <RoomLoading message="대기방으로 이동 중..." />;
  }

  // What is drawn: the latest state, held back where a roll is still being shown.
  const shown = show ? duringShow(show, state) : spin ? duringSpin(spin, state) : state;
  const { room, activeEvent, endVote, history } = shown;
  const last = shown.players.length;
  const players = [...shown.players].sort(
    (a, b) => (a.turnOrder ?? last) - (b.turnOrder ?? last),
  );
  const ended = room.status === "ENDED";
  // Host rights come from the latest room:state only, never from anything kept in the browser.
  const isHost = players.some((player) => player.id === view.playerId && player.isHost);
  // An end-game vote pauses the game: every game action below waits for its result.
  const paused = endVote !== null;
  // As with the mission vote, room:state's count is the base and a newer progress event can only
  // be higher within the same vote.
  const endProgress = endVote
    ? { total: endVote.total, voted: Math.max(endVote.voted, liveEndVote?.voted ?? 0) }
    : null;
  // Worked out from every room:state; never kept as separate state.
  const current =
    room.currentTurnOrder === null
      ? undefined
      : players.find((player) => player.turnOrder === room.currentTurnOrder);
  const isMyTurn = current !== undefined && current.id === view.playerId;
  const canRoll =
    room.status === "PLAYING" &&
    isMyTurn &&
    room.turnPhase === "AWAITING_ROLL" &&
    !paused &&
    connection === "connected" &&
    !rolling &&
    !show &&
    !spin;
  // The QA tile before its question is chosen (from room:state only).
  const qaSelecting =
    room.status === "PLAYING" &&
    room.turnPhase === "RESOLVING_TILE" &&
    activeEvent?.type === "QA_SELECTING"
      ? activeEvent
      : null;
  const qaSelectingPerformer = qaSelecting
    ? players.find((player) => player.id === qaSelecting.playerId)
    : undefined;
  // The Q&A in progress, taken from room:state only; it is always the current player's.
  const qa =
    room.status === "PLAYING" &&
    room.turnPhase === "RESOLVING_TILE" &&
    activeEvent?.type === "QA"
      ? activeEvent.question
      : null;
  // The 지목 in progress, also from room:state only (eligibleTargets follows presence there).
  const target =
    room.status === "PLAYING" &&
    room.turnPhase === "RESOLVING_TILE" &&
    activeEvent?.type === "TARGET_DRINK"
      ? activeEvent
      : null;
  // The mission in progress, from room:state only (stage, startedAt / endsAt, serverTime).
  const mission =
    room.status === "PLAYING" &&
    room.turnPhase === "RESOLVING_TILE" &&
    activeEvent?.type === "MISSION"
      ? activeEvent
      : null;
  // room:state's count is the base (also after a refresh); a newer progress event can only be
  // higher within the same round, so the larger one is the latest.
  const voteProgress =
    mission?.mission.stage === "AWAITING_VOTE" && mission.voteProgress
      ? {
          total: mission.voteProgress.total,
          voted: Math.max(mission.voteProgress.voted, liveVote?.voted ?? 0),
        }
      : null;
  // The penalty roulette waiting to be spun (a PENALTY tile or a failed mission), from room:state.
  const penalty =
    room.status === "PLAYING" &&
    room.turnPhase === "RESOLVING_TILE" &&
    activeEvent?.type === "PENALTY"
      ? activeEvent
      : null;
  // A rejected end-game vote, shown for a few seconds once the game is back.
  const rejected = endResult && !endResult.ended && !endVote ? endResult : null;
  const rollHint =
    connection !== "connected"
      ? "서버와 다시 연결되면 굴릴 수 있습니다."
      : !current
        ? ""
        : !isMyTurn
          ? "내 차례가 되면 굴릴 수 있습니다."
          : room.turnPhase === "RESOLVING_TILE"
            ? "칸 효과 처리가 끝나면 다음 차례로 넘어갑니다."
            : rolling || show
              ? "주사위를 굴리는 중입니다."
              : paused
                ? "게임 종료 투표가 끝나면 굴릴 수 있습니다."
                : "주사위를 굴려주세요!";
  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-violet-700 dark:text-violet-300">주루마블</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            방 코드{" "}
            <span className="font-mono font-bold tracking-widest text-zinc-700 dark:text-zinc-300">
              {room.code}
            </span>
          </p>
        </div>
        {/* Up here, far from the dice and event buttons, so nobody ends the game by a slip. */}
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionBadge connection={connection} />
          {isHost && !ended && (
            <button
              type="button"
              onClick={requestEnd}
              disabled={paused || requesting || connection !== "connected"}
              className={smallDangerButton}
            >
              {requesting ? "요청 중..." : "게임 종료"}
            </button>
          )}
        </div>
      </div>
      {/* Small and above the board, so it never competes with the dice or event buttons. */}
      {!ended && (
        <div className="flex flex-wrap items-start gap-2">
          <ShareActions code={room.code} invite={false} onMessage={showMessage} />
          <LeaveRoomButton
            socketRef={socketRef}
            connected={connection === "connected"}
            playing
          />
        </div>
      )}
      <div className="empty:hidden">
        <ConnectionNotice connection={connection} onRetry={retryGame} />
      </div>
      {!ended && <FormError message={endRequestError} />}
    </div>
  );

  // ENDED wins over every event: no board and no game action, only the final screen.
  if (ended) {
    return (
      <PageShell>
        {header}
        <GameEnded
          players={players}
          myId={view.playerId}
          result={endResult?.ended ? endResult : null}
          onHome={goHome}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="game">
      {header}

      {/* Phones / tablets: board, game history (opens on demand), players. lg: board | players
          with the history under the board. xl: history | board | players. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1 xl:col-start-2">
          <GameBoard
            players={players}
            myId={view.playerId}
            currentId={current?.id ?? null}
            arrival={show?.phase === "arrived" ? show.roll.toPosition : null}
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-white/85 dark:bg-zinc-900/85 p-3 text-center wrap-anywhere sm:p-4">
              <div role="status" className="flex w-full flex-col items-center gap-3">
                {show ? (
                  // The roll, step by step; the tile's event (or the next turn) follows after it.
                  <div className="flex flex-col items-center gap-3">
                    <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                      {show.roll.playerId === view.playerId
                        ? "주사위를 굴립니다!"
                        : `${show.roll.displayName}님이 주사위를 굴립니다`}
                    </h2>
                    <Die
                      key={show.phase === "rolling" ? "rolling" : "result"}
                      value={
                        show.phase === "rolling"
                          ? TUMBLE_FACES[show.tick % TUMBLE_FACES.length]
                          : show.roll.dice
                      }
                      rolling={show.phase === "rolling"}
                    />
                    <p className="text-2xl font-black tabular-nums text-violet-700 dark:text-violet-300">
                      {show.phase === "rolling" ? "🎲 ..." : `🎲 ${show.roll.dice}`}
                    </p>
                    {show.phase !== "rolling" && (
                      <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {show.roll.fromPosition} → {show.roll.toPosition}
                        {show.phase === "arrived" && ` · ${TILE_LABEL[show.roll.tile.type]} 도착!`}
                      </p>
                    )}
                  </div>
                ) : spin ? (
                <PenaltyRoulette
                  performerName={spin.result.displayName ?? ""}
                  label={spin.result.source === "MISSION_FAILURE" ? "미션 실패 벌칙" : "벌칙 칸 결과"}
                  frame={
                    rouletteFrames(
                      penalties.map((penalty) => penalty.content),
                      spin.result.penalty.content,
                      SPIN_FRAMES,
                    )[spin.tick]
                  }
                  stopped={spin.tick === SPIN_FRAMES - 1}
                />
              ) : qaSelecting && qaSelectingPerformer ? (
                  <QaSelectPrompt
                    performer={qaSelectingPerformer}
                    isPerformer={qaSelecting.playerId === view.playerId}
                    paused={paused}
                  />
                ) : qa && current ? (
                  <QaPrompt
                    question={qa.content}
                    direct={activeEvent?.type === "QA" && activeEvent.direct === true}
                    performer={current}
                    isPerformer={isMyTurn}
                    paused={paused}
                  />
                ) : target ? (
                  <TargetPrompt
                    performerName={target.displayName}
                    isPerformer={target.playerId === view.playerId}
                    performerOnline={
                      players.find((player) => player.id === target.playerId)?.isOnline === true
                    }
                    paused={paused}
                  />
                ) : mission ? (
                  <MissionPrompt
                    mission={mission.mission}
                    performerName={mission.displayName ?? ""}
                    isPerformer={mission.playerId === view.playerId}
                    performerOnline={
                      players.find((player) => player.id === mission.playerId)?.isOnline === true
                    }
                    paused={paused}
                    serverOffset={serverOffset}
                    voteProgress={voteProgress}
                    notice={notice?.text ?? null}
                  />
                ) : penalty ? (
                  <PenaltyPrompt
                    performerName={penalty.displayName ?? ""}
                    isPerformer={penalty.playerId === view.playerId}
                    performerOnline={
                      players.find((player) => player.id === penalty.playerId)?.isOnline === true
                    }
                    source={penalty.source}
                    failedMission={penalty.mission}
                    paused={paused}
                    notice={notice}
                  />
                ) : (
                  <>
                    {/* Whose turn it is comes first; the phase is only a small badge under it. */}
                    {current && (
                      <h2
                        className={
                          isMyTurn
                            ? "text-2xl font-black text-violet-700 dark:text-violet-300"
                            : "text-xl font-black text-zinc-900 dark:text-zinc-100"
                        }
                      >
                        {isMyTurn ? "내 차례입니다!" : `${current.displayName}님의 차례`}
                      </h2>
                    )}
                    {room.turnPhase && <Badge size="md">{PHASE_LABEL[room.turnPhase]}</Badge>}
                    {(lastRoll || (notice && !notice.penalty)) && (
                      // The latest roll and what it did, the same on every screen. Small and
                      // below the turn, so it never covers the next action; the next roll replaces it.
                      <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-800 p-3 text-left shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                        <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">최근 결과</p>
                        {lastRoll && (
                          <div key={lastRoll.seq} className="mt-2 flex items-center gap-3">
                            <Die value={lastRoll.dice} />
                            <div className="min-w-0">
                              <p className="font-bold">
                                {lastRoll.displayName}님이 🎲 {lastRoll.dice}
                              </p>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                                {lastRoll.fromPosition} → {lastRoll.toPosition}
                              </p>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                도착:{" "}
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                  {TILE_LABEL[lastRoll.tile.type]}
                                </span>
                              </p>
                            </div>
                          </div>
                        )}
                        {notice && !notice.penalty && (
                          <div
                            className={`text-center ${lastRoll ? "mt-2 border-t border-zinc-100 dark:border-zinc-700 pt-2" : "mt-1"}`}
                          >
                            <p className="text-lg font-black text-rose-700 dark:text-rose-300">{notice.text}</p>
                            {notice.lines?.map((line) => (
                              <p key={line} className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {notice?.penalty && (
                      <div className="w-full max-w-xs rounded-2xl bg-rose-50 dark:bg-rose-500/10 px-4 py-3 ring-2 ring-rose-200 dark:ring-rose-400/40 starting:scale-90 starting:opacity-0 motion-safe:transition-[scale,opacity] motion-safe:duration-300">
                        <p className="text-sm font-black text-rose-700 dark:text-rose-300">
                          <span aria-hidden="true">🎡 </span>벌칙 결과 · {notice.penalty.label}
                        </p>
                        <p className="mt-1 text-sm font-bold text-zinc-600 dark:text-zinc-400">{notice.text}</p>
                        <p
                          className={`mt-1 font-black whitespace-pre-wrap text-zinc-900 dark:text-zinc-100 ${contentSize(notice.penalty.content)}`}
                        >
                          {notice.penalty.content}
                        </p>
                        {notice.penalty.durationSeconds !== null && (
                          // It runs on while the game goes on; the time left is in 게임 기록.
                          <p className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-300">
                            ⏱ 시간형 · {formatDuration(notice.penalty.durationSeconds)} 동안 · 게임 기록에서 남은 시간 확인
                          </p>
                        )}
                      </div>
                    )}
                    {notice?.targetId === view.playerId && (
                      <p className="w-full max-w-xs rounded-xl bg-rose-100 dark:bg-rose-500/20 px-3 py-2 text-lg font-black text-rose-800 dark:text-rose-200">
                        내가 지목되었습니다! 한 잔!
                      </p>
                    )}
                    {current && !current.isOnline && (
                      <p className={CALLOUT}>{current.displayName}님의 재접속을 기다리는 중입니다.</p>
                    )}
                  </>
                )}
              </div>
              {show || spin ? null : qaSelecting ? (
                // Only the current player decides; everyone may still add questions to the list.
                qaSelecting.playerId === view.playerId && (
                  <QaChoiceButtons
                    socketRef={socketRef}
                    connected={connection === "connected"}
                    paused={paused}
                  />
                )
              ) : qa && current ? (
                // Other players get no button at all, so nobody else seems able to finish it.
                isMyTurn && (
                  <QaCompleteButton
                    socketRef={socketRef}
                    connected={connection === "connected"}
                    paused={paused}
                  />
                )
              ) : target ? (
                // Picking happens only here, never on the player list, and only for the picker.
                target.playerId === view.playerId && (
                  <TargetChoices
                    targets={target.eligibleTargets}
                    socketRef={socketRef}
                    connected={connection === "connected"}
                    paused={paused}
                  />
                )
              ) : mission ? (
                // The performer acts only while READY (a running timed mission cannot be ended
                // early); everyone else votes while AWAITING_VOTE. The performer never gets O / X.
                mission.playerId === view.playerId ? (
                  mission.mission.stage === "READY" && (
                    <MissionAction
                      type={mission.mission.type}
                      durationSeconds={mission.mission.durationSeconds}
                      socketRef={socketRef}
                      connected={connection === "connected"}
                      paused={paused}
                    />
                  )
                ) : (
                  mission.mission.stage === "AWAITING_VOTE" && (
                    <MissionVote
                      socketRef={socketRef}
                      connected={connection === "connected"}
                      paused={paused}
                    />
                  )
                )
              ) : penalty ? (
                // Only the player getting the penalty spins; nobody can do it for them.
                penalty.playerId === view.playerId && (
                  <PenaltySpin
                    socketRef={socketRef}
                    connected={connection === "connected"}
                    paused={paused}
                  />
                )
              ) : (
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <button
                    type="button"
                    onClick={roll}
                    disabled={!canRoll}
                    aria-describedby="roll-hint"
                    className={primaryButton}
                  >
                    {rolling ? "굴리는 중..." : "주사위 굴리기"}
                  </button>
                  <p id="roll-hint" className="text-sm text-zinc-600 dark:text-zinc-400">
                    {rollHint}
                  </p>
                  <FormError message={rollError} />
                </div>
              )}
            </div>
          </GameBoard>
          {qaSelecting && qaSelectingPerformer && (
            <QaQuestionPicker
              questions={questions}
              loadFailed={questionsFailed}
              client={view.client}
              onPatch={patchQuestions}
              onUnauthorized={expireSession}
              performerName={qaSelectingPerformer.displayName}
              isPerformer={qaSelecting.playerId === view.playerId}
              socketRef={socketRef}
              connected={connection === "connected"}
              paused={paused}
            />
          )}
        </div>

        <HistoryPanel
          entries={history}
          // The roll still being shown stays out of 게임 기록 until it has landed.
          log={show ? log.filter((entry) => entry.seq !== show.seq) : log}
          serverOffset={serverOffset}
          myId={view.playerId}
          paused={paused}
          className="lg:col-start-1 lg:row-start-2 xl:sticky xl:top-4 xl:col-start-1 xl:row-start-1"
        />

        <section
          aria-labelledby="game-players-title"
          className={`${cardClass} lg:col-start-2 lg:row-start-1 xl:col-start-3`}
        >
          <h2 id="game-players-title" className="text-lg font-bold">
            참가자
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {players.map((player) => {
              const isCurrent = player.id === current?.id;
              const isMe = player.id === view.playerId;
              return (
                <li
                  key={player.id}
                  className={`rounded-2xl px-3 py-2.5 ${isCurrent ? "bg-violet-50 dark:bg-violet-500/10 ring-2 ring-violet-300 dark:ring-violet-400/60" : "bg-zinc-50 dark:bg-zinc-800/60"}`}
                >
                  <div className="flex items-center gap-2">
                    <PlayerToken player={player} isMe={isMe} isCurrent={isCurrent} />
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 font-bold tabular-nums">
                        {(player.turnOrder ?? 0) + 1}.
                      </span>
                      <span className="truncate font-bold" title={player.displayName}>
                        {player.displayName}
                      </span>
                    </span>
                    <PlayerBadges isMe={isMe} isHost={player.isHost} />
                    {isCurrent && (
                      <Badge tone="strong" className="ml-auto">
                        현재 턴
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      위치 {player.position} · 적립 {player.accumulatedDrinks}잔 ·{" "}
                      <span
                        className={
                          player.isOnline ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        <span aria-hidden="true">{player.isOnline ? "●" : "○"} </span>
                        {player.isOnline ? "온라인" : "오프라인"}
                      </span>
                    </p>
                    {isHost && !isMe && !player.isHost && !player.isOnline && (
                      <button
                        type="button"
                        onClick={() => kickPlayer(player)}
                        disabled={kickingId !== null || paused || connection !== "connected"}
                        aria-label={`${player.displayName} 강퇴`}
                        className={`shrink-0 ${smallDangerButton}`}
                      >
                        {kickingId === player.id ? "내보내는 중..." : "강퇴"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {kickError && (
            <div className="mt-3">
              <FormError message={kickError} />
            </div>
          )}
        </section>
      </div>

      {endProgress && (
        <EndVoteOverlay
          key={endRound}
          progress={endProgress}
          socketRef={socketRef}
          connected={connection === "connected"}
        />
      )}
      {/* Fixed at the top so it is seen wherever the page is scrolled; it never takes a tap. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-4 z-30 flex flex-col items-center gap-2 px-4"
      >
        {hostChanged && <HostChangedNotice change={hostChanged} />}
        {reconnected && <RoomNotice text="다시 연결되었습니다." />}
        {message && <RoomNotice text={message} />}
        {rejected && (
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-800 px-4 py-3 text-center shadow-lg ring-1 ring-black/10 dark:ring-white/15">
            <p className="font-black text-zinc-900 dark:text-zinc-100">게임 종료 투표가 부결되었습니다.</p>
            <p className="mt-1 text-sm font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">
              YES {rejected.yes} / NO {rejected.no} · 게임을 계속합니다.
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
