import {
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { errorTrace } from '../error-trace.js';
import { FRONTEND_ORIGIN } from '../frontend-origin.js';
import { TileType } from './board.js';
import { RoomsService, missionEndsAt } from './rooms.service.js';
import { normalizeRoomCode } from './user-input.js';

interface SocketData {
  playerId: string;
  roomId: string;
  roomCode: string;
}

const roomChannel = (roomCode: string) => `room:${roomCode}`;

// How long a disconnected host keeps the role before it moves to an online player.
const HOST_GRACE_MS = 5 * 60 * 1000;

// The longest delay a Node timer takes (about 24.8 days); a longer one fires at once. A mission
// that runs longer just wakes up, finds it is not over yet (NOT_YET) and waits again.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

function connectError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code, message } });
}

type AckError = { ok: false; code: string; message: string };
type KickResult = { ok: true; playerId: string } | AckError;
type StartResult =
  | { ok: true; firstPlayerId: string; firstPlayerDisplayName: string }
  | AckError;

function ackError(code: string, message: string): AckError {
  return { ok: false, code, message };
}

const START_ERRORS = {
  INVALID_ROOM_STATE: 'The game cannot be started',
  NOT_ENOUGH_PLAYERS: 'At least 2 players are required',
};

type RollResult =
  | {
      ok: true;
      dice: number;
      fromPosition: number;
      toPosition: number;
      tile: { index: number; type: TileType };
      autoResolved: boolean;
    }
  | AckError;

// Every state-changing game action is refused while an end-game vote is open.
const GAME_PAUSED = 'The game is paused for an end-game vote';

const KICK_ERRORS = {
  GAME_PAUSED,
  PLAYER_ONLINE: 'Only disconnected players can be kicked',
  PLAYER_NOT_FOUND: 'Player not found',
};

const LEAVE_ERRORS = {
  GAME_PAUSED,
  PLAYER_NOT_FOUND: 'Player not found',
};

const ROLL_ERRORS = {
  GAME_NOT_PLAYING: 'The game is not in progress',
  NOT_YOUR_TURN: 'It is not your turn',
  INVALID_TURN_PHASE: 'The dice cannot be rolled right now',
  GAME_PAUSED,
};

const QA_ERRORS = {
  GAME_NOT_PLAYING: 'The game is not in progress',
  NOT_YOUR_TURN: 'It is not your turn',
  INVALID_TURN_PHASE: 'No Q&A is in progress',
  GAME_PAUSED,
};

// direct: no question from the list, a player or viewer asks it (question.id is null then).
type QaSelectResult =
  | {
      ok: true;
      question: { id: string | null; content: string };
      random: boolean;
      direct: boolean;
    }
  | { ok: true; empty: true }
  | AckError;

const QA_SELECT_ERRORS = {
  GAME_NOT_PLAYING: 'The game is not in progress',
  NOT_YOUR_TURN: 'It is not your turn',
  QA_NOT_SELECTING: 'No Q&A question is being chosen',
  QUESTION_NOT_FOUND: 'Question not found',
  GAME_PAUSED,
};

type VoteResult =
  | { ok: true; completed: false; voted: number; total: number }
  | { ok: true; completed: true; result: string; o: number; x: number }
  | AckError;

const VOTE_ERRORS = {
  VOTING_NOT_ACTIVE: 'Mission voting is not active',
  PERFORMER_CANNOT_VOTE: 'The mission performer cannot vote',
  PLAYER_NOT_FOUND: 'Player not found',
  ALREADY_VOTED: 'You have already voted',
  GAME_PAUSED,
};

type SpinResult =
  | {
      ok: true;
      source: string;
      // startedAt / endsAt only for a timed penalty, which runs on alongside the game.
      penalty: {
        id: string;
        content: string;
        type: string;
        durationSeconds: number | null;
        startedAt: string | null;
        endsAt: string | null;
      };
    }
  | { ok: true; empty: true }
  | AckError;

const PENALTY_ERRORS = {
  PENALTY_NOT_ACTIVE: 'Penalty roulette is not active',
  NOT_YOUR_TURN: 'It is not your turn',
  GAME_PAUSED,
};

type TargetResult =
  | { ok: true; targetPlayer: { id: string; displayName: string } }
  | { ok: true; empty: true }
  | AckError;

const TARGET_ERRORS = {
  TARGET_SELECTION_NOT_ACTIVE: 'Target selection is not active',
  NOT_YOUR_TURN: 'It is not your turn',
  CANNOT_TARGET_SELF: 'You cannot target yourself',
  PLAYER_NOT_FOUND: 'Player not found',
  TARGET_OFFLINE: 'The selected player is offline',
  GAME_PAUSED,
};

type EndVoteResult =
  | { ok: true; completed: false; voted: number; total: number }
  | { ok: true; completed: true; ended: boolean }
  | AckError;

const END_REQUEST_ERRORS = {
  GAME_NOT_PLAYING: 'The game is not in progress',
  END_VOTE_ALREADY_ACTIVE: 'An end-game vote is already active',
};

const END_VOTE_ERRORS = {
  END_VOTE_NOT_ACTIVE: 'There is no active end-game vote',
  PLAYER_NOT_FOUND: 'Player not found',
  ALREADY_VOTED: 'You have already voted',
};

@WebSocketGateway({ cors: { origin: FRONTEND_ORIGIN } })
export class RoomsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationBootstrap,
    OnModuleDestroy
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  // playerId -> ids of that player's open sockets (one per browser tab)
  private readonly onlineSockets = new Map<string, Set<string>>();

  // Also read by RoomCleanupService so rooms with someone connected are never removed.
  readonly isOnline = (playerId: string) => this.onlineSockets.has(playerId);

  // roomId -> timer that fires when the running timed mission should end.
  // Only a trigger: the DB (startedAt + durationSeconds) decides the real state.
  private readonly missionTimers = new Map<string, NodeJS.Timeout>();

  // roomId -> timer that hands the host role on if the host is still offline when it fires.
  // Only a trigger: migrateHost checks the DB and presence again.
  private readonly hostTimers = new Map<string, NodeJS.Timeout>();

  // Tests shorten this; the server always runs with HOST_GRACE_MS.
  hostGraceMs = HOST_GRACE_MS;

  // Set once the app starts shutting down: no new timers are scheduled, and the disconnects
  // caused by the server closing are not treated as players leaving.
  private shuttingDown = false;

  constructor(private readonly roomsService: RoomsService) {}

  // Server start, before anyone reconnects: timed missions that were running when the server
  // stopped get their timer back, or are finished if their time ran out meanwhile. Same path as
  // a reconnect (syncMissionTimer), driven by the start time in the DB, so no clock restarts.
  async onApplicationBootstrap() {
    try {
      const rooms = await this.roomsService.listRunningMissionRooms();
      let rescheduled = 0;
      let expired = 0;
      for (const room of rooms) {
        const result = await this.syncMissionTimer(room.id, room.code);
        rescheduled += result === 'scheduled' ? 1 : 0;
        expired += result === 'expired' ? 1 : 0;
      }
      if (rooms.length > 0) {
        this.logger.log(
          `startup: rescheduled ${rescheduled} timed missions, finished ${expired} expired`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to restore timed missions', errorTrace(error));
    }
  }

  // Shutdown (SIGTERM / SIGINT / app.close()), before Socket.IO closes. Timers are only
  // triggers: the DB keeps each mission's start time, and the next start rebuilds them.
  onModuleDestroy() {
    this.shuttingDown = true;
    const missions = this.missionTimers.size;
    const hosts = this.hostTimers.size;
    for (const timer of [
      ...this.missionTimers.values(),
      ...this.hostTimers.values(),
    ]) {
      clearTimeout(timer);
    }
    this.missionTimers.clear();
    this.hostTimers.clear();
    this.logger.log(
      `shutdown: stopped ${missions} mission timers and ${hosts} host timers`,
    );
  }

  afterInit(server: Server) {
    // Authenticate in the handshake so rejected sockets never connect.
    server.use((socket, next) => {
      this.authenticate(socket).then(
        (ok) =>
          next(
            ok
              ? undefined
              : connectError('UNAUTHORIZED', 'Invalid room or reconnect token'),
          ),
        (error: unknown) => {
          this.logger.error('Socket authentication failed', errorTrace(error));
          next(connectError('INTERNAL_ERROR', 'Could not connect'));
        },
      );
    });
  }

  async handleConnection(socket: Socket) {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    const sockets = this.onlineSockets.get(playerId) ?? new Set<string>();
    sockets.add(socket.id);
    this.onlineSockets.set(playerId, sockets);
    await socket.join(roomChannel(roomCode));
    await this.syncMissionTimer(roomId, roomCode);
    await this.broadcastRoomState(roomCode);
    // A player came online: the host may be back, or (after a restart) still away.
    if (sockets.size === 1) {
      await this.syncHostMigration(roomId, roomCode);
    }
  }

  async handleDisconnect(socket: Socket) {
    const { playerId, roomId, roomCode } = socket.data as Partial<SocketData>;
    // During shutdown everyone is disconnected by the server itself; nobody is left to tell.
    if (!playerId || !roomId || !roomCode || this.shuttingDown) {
      return;
    }
    const sockets = this.onlineSockets.get(playerId);
    sockets?.delete(socket.id);
    const wentOffline = sockets?.size === 0;
    if (wentOffline) {
      this.onlineSockets.delete(playerId);
    }
    await this.broadcastRoomState(roomCode);
    if (wentOffline) {
      await this.syncHostMigration(roomId, roomCode);
    }
  }

  @SubscribeMessage('player:kick')
  async handleKick(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<KickResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    const targetId = (body as { playerId?: unknown } | null)?.playerId;
    if (typeof targetId !== 'string' || !targetId) {
      return ackError('BAD_REQUEST', 'playerId is required');
    }
    try {
      const requester = await this.roomsService.findRoomPlayer(
        roomId,
        playerId,
      );
      if (!requester?.isHost) {
        return ackError('FORBIDDEN', 'Only the host can kick players');
      }
      const target = await this.roomsService.findRoomPlayer(roomId, targetId);
      if (!target) {
        return ackError('PLAYER_NOT_FOUND', 'Player not found');
      }
      if (target.id === requester.id || target.isHost) {
        return ackError('INVALID_TARGET', 'The host cannot be kicked');
      }
      if (this.onlineSockets.has(target.id)) {
        return ackError(
          'PLAYER_ONLINE',
          'Only disconnected players can be kicked',
        );
      }
      const removed = await this.roomsService.removePlayer(
        roomId,
        target.id,
        this.isOnline,
      );
      if (!removed.ok) {
        return ackError(removed.code, KICK_ERRORS[removed.code]);
      }
      if (removed.wasCurrent) {
        // Their turn was dropped, including a running timed mission.
        this.cancelMissionTimer(roomId);
      }
      if (removed.missionVote) {
        // The kicked voter was the last one missing, so the mission vote is settled.
        this.broadcastMissionVoteResult(roomCode, removed.missionVote);
      }
      // The player may have reconnected between the online check and the delete.
      for (const socketId of this.onlineSockets.get(target.id) ?? []) {
        const kicked = this.server.sockets.sockets.get(socketId);
        kicked?.emit('player:kicked', {
          code: 'KICKED',
          message: 'You were removed from the room',
        });
        kicked?.disconnect(true);
      }
      await this.broadcastRoomState(roomCode);
      return { ok: true, playerId: target.id };
    } catch (error) {
      this.logger.error('Failed to kick player', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not kick player');
    }
  }

  // Leaving for good (unlike a disconnect): the player of this socket only, never one named in
  // the payload. Same removal as a kick; a leaving host hands the role on at once, no grace period.
  @SubscribeMessage('player:leave')
  async handleLeave(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true } | AckError> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const left = await this.roomsService.leaveRoom(
        roomId,
        playerId,
        this.isOnline,
      );
      if (!left.ok) {
        return ackError(left.code, LEAVE_ERRORS[left.code]);
      }
      // Their other tabs are closed; this socket only leaves the room channel, so the ack still
      // reaches it and the client disconnects itself.
      for (const socketId of this.onlineSockets.get(playerId) ?? []) {
        if (socketId !== socket.id) {
          this.server.sockets.sockets.get(socketId)?.disconnect(true);
        }
      }
      this.onlineSockets.delete(playerId);
      await socket.leave(roomChannel(roomCode));
      if (left.roomDeleted || left.wasCurrent) {
        // Their turn was dropped (or the room is gone), including a running timed mission.
        this.cancelMissionTimer(roomId);
      }
      if (left.roomDeleted) {
        this.cancelHostMigration(roomId);
        return { ok: true };
      }
      if (left.missionVote) {
        this.broadcastMissionVoteResult(roomCode, left.missionVote);
      }
      if (left.hostChange) {
        this.logger.log(
          `host left (room ${roomId}, new host ${left.hostChange.newHostPlayerId})`,
        );
        this.server
          .to(roomChannel(roomCode))
          .emit('room:host-changed', left.hostChange);
      }
      await this.broadcastRoomState(roomCode);
      if (left.hostChange) {
        // Cancels a pending grace timer, or starts one if the new host is offline.
        await this.syncHostMigration(roomId, roomCode);
      }
      return { ok: true };
    } catch (error) {
      this.logger.error('Failed to leave room', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not leave the room');
    }
  }

  @SubscribeMessage('game:start')
  async handleGameStart(
    @ConnectedSocket() socket: Socket,
  ): Promise<StartResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const requester = await this.roomsService.findRoomPlayer(
        roomId,
        playerId,
      );
      if (!requester?.isHost) {
        return ackError('FORBIDDEN', 'Only the host can start the game');
      }
      const state = await this.roomsService.getRoomState(roomCode);
      if (state?.room.status !== 'WAITING') {
        return ackError('INVALID_ROOM_STATE', START_ERRORS.INVALID_ROOM_STATE);
      }
      if (state.players.length < 2) {
        return ackError('NOT_ENOUGH_PLAYERS', START_ERRORS.NOT_ENOUGH_PLAYERS);
      }
      // Presence is in-memory, so it is checked before the DB transaction.
      if (!state.players.every((player) => this.onlineSockets.has(player.id))) {
        return ackError(
          'PLAYER_OFFLINE',
          'All players must be online to start',
        );
      }
      const result = await this.roomsService.startGame(roomId);
      if (!result.ok) {
        return ackError(result.code, START_ERRORS[result.code]);
      }
      await this.broadcastRoomState(roomCode);
      return {
        ok: true,
        firstPlayerId: result.firstPlayer.id,
        firstPlayerDisplayName: result.firstPlayer.displayName,
      };
    } catch (error) {
      this.logger.error('Failed to start game', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not start the game');
    }
  }

  @SubscribeMessage('game:roll')
  async handleRoll(@ConnectedSocket() socket: Socket): Promise<RollResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.rollDice(roomId, playerId);
      if (!result.ok) {
        return ackError(result.code, ROLL_ERRORS[result.code]);
      }
      const { playerId: rollerId, displayName, qaReady, qaEmpty } = result;
      const { mission, missionEmpty, penaltyReady, penaltyEmpty } = result;
      const { dice, fromPosition, toPosition, tile, effect } = result;
      const broadcast = this.server.to(roomChannel(roomCode));
      broadcast.emit('game:dice-rolled', {
        playerId: rollerId,
        displayName,
        dice,
        fromPosition,
        toPosition,
        tile,
      });
      if (effect) {
        broadcast.emit('game:tile-resolved', {
          playerId: rollerId,
          displayName,
          tile,
          effect,
        });
      } else if (qaReady) {
        // The question selection opens; game:qa-selected follows with the question.
        broadcast.emit('game:qa', { playerId: rollerId, displayName });
      } else if (qaEmpty) {
        broadcast.emit('game:qa-empty', { playerId: rollerId, displayName });
      } else if (mission) {
        broadcast.emit('game:mission', {
          playerId: rollerId,
          displayName,
          mission: { ...mission, stage: 'READY' },
        });
      } else if (missionEmpty) {
        broadcast.emit('game:mission-empty', {
          playerId: rollerId,
          displayName,
        });
      } else if (penaltyReady || penaltyEmpty) {
        broadcast.emit(
          penaltyReady ? 'game:penalty-ready' : 'game:penalty-empty',
          {
            playerId: rollerId,
            displayName,
            source: 'TILE',
          },
        );
      }
      let targetEmpty = false;
      if (tile.type === TileType.TARGET_DRINK) {
        // Who is online is only known here, so the gateway opens the selection.
        const opened = await this.roomsService.openTargetSelection(
          roomId,
          rollerId,
          this.isOnline,
        );
        targetEmpty = opened.ok && opened.eligibleTargets.length === 0;
        if (opened.ok) {
          broadcast.emit(
            targetEmpty ? 'game:target-empty' : 'game:target-required',
            targetEmpty
              ? { playerId: rollerId, displayName }
              : {
                  playerId: rollerId,
                  displayName,
                  eligibleTargets: opened.eligibleTargets,
                },
          );
        }
      }
      await this.broadcastRoomState(roomCode);
      return {
        ok: true,
        dice,
        fromPosition,
        toPosition,
        tile,
        autoResolved:
          effect !== null ||
          qaEmpty ||
          missionEmpty ||
          penaltyEmpty ||
          targetEmpty,
      };
    } catch (error) {
      this.logger.error('Failed to roll dice', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not roll the dice');
    }
  }

  // The current player picks one of the room's questions for their Q&A.
  @SubscribeMessage('game:qa-select')
  handleQaSelect(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<QaSelectResult> {
    const questionId = (body as { questionId?: unknown } | null)?.questionId;
    if (
      typeof questionId !== 'string' ||
      questionId.length === 0 ||
      questionId.length > 100
    ) {
      return Promise.resolve(
        ackError('BAD_REQUEST', 'questionId must be a question id'),
      );
    }
    return this.selectQuestion(socket, questionId);
  }

  // The current player lets the server pick the Q&A question at random.
  @SubscribeMessage('game:qa-random')
  handleQaRandom(@ConnectedSocket() socket: Socket): Promise<QaSelectResult> {
    return this.selectQuestion(socket, null);
  }

  // 직접 질문할게요: the current player skips the list; a player or a viewer asks the question.
  @SubscribeMessage('game:qa-direct')
  handleQaDirect(@ConnectedSocket() socket: Socket): Promise<QaSelectResult> {
    return this.selectQuestion(socket, null, true);
  }

  private async selectQuestion(
    socket: Socket,
    questionId: string | null,
    direct = false,
  ): Promise<QaSelectResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.selectQuestion(
        roomId,
        playerId,
        questionId,
        direct,
      );
      if (!result.ok) {
        return ackError(result.code, QA_SELECT_ERRORS[result.code]);
      }
      const broadcast = this.server.to(roomChannel(roomCode));
      const who = {
        playerId: result.playerId,
        displayName: result.displayName,
      };
      if (result.empty) {
        broadcast.emit('game:qa-empty', who);
        await this.broadcastRoomState(roomCode);
        return { ok: true, empty: true };
      }
      broadcast.emit('game:qa-selected', {
        ...who,
        question: result.question,
        random: result.random,
        direct: result.direct,
      });
      await this.broadcastRoomState(roomCode);
      const { question, random } = result;
      return { ok: true, question, random, direct: result.direct };
    } catch (error) {
      this.logger.error('Failed to select Q&A question', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not select the question');
    }
  }

  @SubscribeMessage('game:qa-complete')
  async handleQaComplete(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true } | AckError> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.completeQa(roomId, playerId);
      if (!result.ok) {
        return ackError(result.code, QA_ERRORS[result.code]);
      }
      this.server.to(roomChannel(roomCode)).emit('game:qa-completed', {
        playerId: result.playerId,
        displayName: result.displayName,
      });
      await this.broadcastRoomState(roomCode);
      return { ok: true };
    } catch (error) {
      this.logger.error('Failed to complete Q&A', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not complete the Q&A');
    }
  }

  @SubscribeMessage('game:mission-start')
  async handleMissionStart(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true } | AckError> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.startMission(roomId, playerId);
      if (!result.ok) {
        return result.code === 'INVALID_MISSION_STATE'
          ? ackError(result.code, 'The mission cannot be started right now')
          : ackError(result.code, ROLL_ERRORS[result.code]);
      }
      const { startedAt, durationSeconds } = result.mission;
      this.server.to(roomChannel(roomCode)).emit('game:mission-started', {
        playerId: result.playerId,
        displayName: result.displayName,
        mission: {
          ...result.mission,
          stage: 'RUNNING',
          startedAt: startedAt.toISOString(),
          endsAt: missionEndsAt(startedAt, durationSeconds).toISOString(),
        },
        serverTime: new Date().toISOString(),
      });
      this.scheduleMissionTimer(roomId, roomCode, startedAt, durationSeconds);
      await this.broadcastRoomState(roomCode);
      return { ok: true };
    } catch (error) {
      this.logger.error('Failed to start mission', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not start the mission');
    }
  }

  @SubscribeMessage('game:mission-complete')
  async handleMissionComplete(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true } | AckError> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.completeMission(roomId, playerId);
      if (!result.ok) {
        return result.code === 'INVALID_MISSION_STATE'
          ? ackError(result.code, 'The mission cannot be completed right now')
          : ackError(result.code, ROLL_ERRORS[result.code]);
      }
      this.server.to(roomChannel(roomCode)).emit('game:mission-finished', {
        playerId: result.playerId,
        displayName: result.displayName,
        reason: 'COMPLETED',
        mission: result.mission,
      });
      await this.broadcastRoomState(roomCode);
      return { ok: true };
    } catch (error) {
      this.logger.error('Failed to complete mission', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not complete the mission');
    }
  }

  @SubscribeMessage('game:mission-vote')
  async handleMissionVote(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<VoteResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    const choice = (body as { choice?: unknown } | null)?.choice;
    if (choice !== 'O' && choice !== 'X') {
      return ackError('BAD_REQUEST', 'choice must be O or X');
    }
    try {
      const result = await this.roomsService.voteMission(
        roomId,
        playerId,
        choice,
      );
      if (!result.ok) {
        return ackError(result.code, VOTE_ERRORS[result.code]);
      }
      const broadcast = this.server.to(roomChannel(roomCode));
      if (!result.completed) {
        // Progress only; who voted what stays hidden until everyone has voted.
        const { voted, total } = result;
        broadcast.emit('game:mission-vote-progress', { voted, total });
        return { ok: true, completed: false, voted, total };
      }
      this.broadcastMissionVoteResult(roomCode, result);
      await this.broadcastRoomState(roomCode);
      const { o, x } = result;
      return { ok: true, completed: true, result: result.result, o, x };
    } catch (error) {
      this.logger.error('Failed to record mission vote', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not record the vote');
    }
  }

  @SubscribeMessage('game:penalty-spin')
  async handlePenaltySpin(
    @ConnectedSocket() socket: Socket,
  ): Promise<SpinResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const result = await this.roomsService.spinPenalty(roomId, playerId);
      if (!result.ok) {
        return ackError(result.code, PENALTY_ERRORS[result.code]);
      }
      const { source, penalty } = result;
      const target = {
        playerId: result.playerId,
        displayName: result.displayName,
        source,
      };
      const broadcast = this.server.to(roomChannel(roomCode));
      if (!penalty) {
        // Every penalty was deleted while waiting; move on instead of stalling.
        broadcast.emit('game:penalty-empty', target);
        await this.broadcastRoomState(roomCode);
        return { ok: true, empty: true };
      }
      // The result is final now; the client only animates towards it.
      broadcast.emit('game:penalty-result', { ...target, penalty });
      await this.broadcastRoomState(roomCode);
      return { ok: true, source, penalty };
    } catch (error) {
      this.logger.error('Failed to spin penalty roulette', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not spin the penalty roulette');
    }
  }

  @SubscribeMessage('game:target-select')
  async handleTargetSelect(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<TargetResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    const targetPlayerId = (body as { targetPlayerId?: unknown } | null)
      ?.targetPlayerId;
    if (typeof targetPlayerId !== 'string' || !targetPlayerId) {
      return ackError('BAD_REQUEST', 'targetPlayerId is required');
    }
    try {
      const result = await this.roomsService.selectTarget(
        roomId,
        playerId,
        targetPlayerId,
        this.isOnline,
      );
      if (!result.ok) {
        return ackError(result.code, TARGET_ERRORS[result.code]);
      }
      const { source, target } = result;
      const broadcast = this.server.to(roomChannel(roomCode));
      if (!target) {
        // Everyone else went offline before a valid pick; the tile was skipped.
        broadcast.emit('game:target-empty', {
          playerId: source.id,
          displayName: source.displayName,
        });
        await this.broadcastRoomState(roomCode);
        return { ok: true, empty: true };
      }
      broadcast.emit('game:target-selected', {
        sourcePlayer: source,
        targetPlayer: target,
        // A game instruction for the UI only; accumulatedDrinks is not touched.
        effect: { type: 'DRINK', amount: 1 },
      });
      await this.broadcastRoomState(roomCode);
      return { ok: true, targetPlayer: target };
    } catch (error) {
      this.logger.error('Failed to select drink target', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not select the target');
    }
  }

  @SubscribeMessage('game:end-request')
  async handleEndRequest(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true } | AckError> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    try {
      const requester = await this.roomsService.findRoomPlayer(
        roomId,
        playerId,
      );
      if (!requester?.isHost) {
        return ackError(
          'FORBIDDEN',
          'Only the host can request to end the game',
        );
      }
      // A timed mission whose time is already up is finished first, so it is not paused as RUNNING.
      const running = await this.roomsService.getRunningMission(roomId);
      if (
        running &&
        missionEndsAt(running.startedAt, running.durationSeconds).getTime() <=
          Date.now()
      ) {
        await this.expireMission(roomId, roomCode, running.startedAt);
      }
      const result = await this.roomsService.requestEndVote(roomId);
      if (!result.ok) {
        return ackError(result.code, END_REQUEST_ERRORS[result.code]);
      }
      // The mission clock stops with the game; the vote result decides how it resumes.
      this.cancelMissionTimer(roomId);
      this.server.to(roomChannel(roomCode)).emit('game:end-vote-progress', {
        voted: 0,
        total: result.total,
      });
      await this.broadcastRoomState(roomCode);
      return { ok: true };
    } catch (error) {
      this.logger.error('Failed to start end-game vote', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not start the end-game vote');
    }
  }

  @SubscribeMessage('game:end-vote')
  async handleEndVote(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<EndVoteResult> {
    const { playerId, roomId, roomCode } = socket.data as SocketData;
    const choice = (body as { choice?: unknown } | null)?.choice;
    if (choice !== 'YES' && choice !== 'NO') {
      return ackError('BAD_REQUEST', 'choice must be YES or NO');
    }
    try {
      const result = await this.roomsService.voteEndGame(
        roomId,
        playerId,
        choice,
      );
      if (!result.ok) {
        return ackError(result.code, END_VOTE_ERRORS[result.code]);
      }
      const broadcast = this.server.to(roomChannel(roomCode));
      if (!result.completed) {
        // Progress only; YES/NO and who voted stay hidden until everyone has voted.
        const { voted, total } = result;
        broadcast.emit('game:end-vote-progress', { voted, total });
        return { ok: true, completed: false, voted, total };
      }
      const { ended, yes, no, total, resumedMission } = result;
      if (resumedMission) {
        // Rescheduled from the shifted start, so only the remaining time is left.
        this.scheduleMissionTimer(
          roomId,
          roomCode,
          resumedMission.startedAt,
          resumedMission.durationSeconds,
        );
      }
      broadcast.emit('game:end-vote-result', { ended, yes, no, total });
      await this.broadcastRoomState(roomCode);
      return { ok: true, completed: true, ended };
    } catch (error) {
      this.logger.error('Failed to record end-game vote', errorTrace(error));
      return ackError('INTERNAL_ERROR', 'Could not record the vote');
    }
  }

  broadcastQuestions(
    roomCode: string,
    questions: { id: string; content: string }[],
  ) {
    this.server.to(roomChannel(roomCode)).emit('questions:updated', {
      questions,
    });
  }

  broadcastMissions(
    roomCode: string,
    missions: {
      id: string;
      content: string;
      type: string;
      durationSeconds: number | null;
    }[],
  ) {
    this.server.to(roomChannel(roomCode)).emit('missions:updated', {
      missions,
    });
  }

  broadcastPenalties(
    roomCode: string,
    penalties: { id: string; content: string }[],
  ) {
    this.server.to(roomChannel(roomCode)).emit('penalties:updated', {
      penalties,
    });
  }

  private cancelMissionTimer(roomId: string) {
    clearTimeout(this.missionTimers.get(roomId));
    this.missionTimers.delete(roomId);
  }

  // The final O/X count, then the penalty roulette (or its skip) for a failed mission.
  private broadcastMissionVoteResult(
    roomCode: string,
    result: {
      playerId: string | null;
      displayName: string | null;
      o: number;
      x: number;
      result: string;
      penaltyReady: boolean;
      penaltyEmpty: boolean;
    },
  ) {
    const broadcast = this.server.to(roomChannel(roomCode));
    broadcast.emit('game:mission-vote-result', {
      playerId: result.playerId,
      displayName: result.displayName,
      o: result.o,
      x: result.x,
      result: result.result,
    });
    if (result.penaltyReady || result.penaltyEmpty) {
      broadcast.emit(
        result.penaltyReady ? 'game:penalty-ready' : 'game:penalty-empty',
        {
          playerId: result.playerId,
          displayName: result.displayName,
          source: 'MISSION_FAILURE',
        },
      );
    }
  }

  private scheduleMissionTimer(
    roomId: string,
    roomCode: string,
    startedAt: Date,
    durationSeconds: number,
  ) {
    if (this.shuttingDown) {
      return;
    }
    clearTimeout(this.missionTimers.get(roomId));
    const remainingMs =
      missionEndsAt(startedAt, durationSeconds).getTime() - Date.now();
    const timer = setTimeout(
      () => void this.expireMission(roomId, roomCode, startedAt),
      Math.min(Math.max(0, remainingMs), MAX_TIMER_DELAY_MS),
    );
    this.missionTimers.set(roomId, timer);
  }

  private async expireMission(
    roomId: string,
    roomCode: string,
    startedAt: Date,
  ) {
    try {
      this.missionTimers.delete(roomId);
      const result = await this.roomsService.expireMission(roomId, startedAt);
      if (result.status === 'NOT_YET') {
        const running = await this.roomsService.getRunningMission(roomId);
        if (running) {
          this.scheduleMissionTimer(
            roomId,
            roomCode,
            running.startedAt,
            running.durationSeconds,
          );
        }
        return;
      }
      if (result.status !== 'EXPIRED') {
        return;
      }
      this.server.to(roomChannel(roomCode)).emit('game:mission-finished', {
        playerId: result.playerId,
        displayName: result.displayName,
        reason: 'TIMER_EXPIRED',
        mission: result.mission,
      });
      await this.broadcastRoomState(roomCode);
    } catch (error) {
      this.logger.error('Failed to expire mission', errorTrace(error));
    }
  }

  // After a server restart the in-memory timer is gone; rebuild it from the DB
  // (or finish the mission right away if its time is already up).
  private async syncMissionTimer(roomId: string, roomCode: string) {
    if (this.missionTimers.has(roomId)) {
      return;
    }
    try {
      const running = await this.roomsService.getRunningMission(roomId);
      if (!running) {
        return;
      }
      const { startedAt, durationSeconds } = running;
      if (missionEndsAt(startedAt, durationSeconds).getTime() <= Date.now()) {
        await this.expireMission(roomId, roomCode, startedAt);
        return 'expired';
      }
      this.scheduleMissionTimer(roomId, roomCode, startedAt, durationSeconds);
      return 'scheduled';
    } catch (error) {
      this.logger.error('Failed to restore mission timer', errorTrace(error));
    }
  }

  // Runs when a player comes online or goes offline. While the host is offline (and the game
  // has not ended) one grace timer per room is pending; it is cancelled once the host is back.
  // Because it also runs on connect, a room whose host left before a server restart gets a new
  // timer when the others reconnect.
  private async syncHostMigration(roomId: string, roomCode: string) {
    if (this.shuttingDown) {
      return;
    }
    try {
      const host = await this.roomsService.findHost(roomId);
      const hostAway =
        host !== null &&
        host.room.status !== 'ENDED' &&
        !this.isOnline(host.id);
      if (!hostAway) {
        this.cancelHostMigration(roomId);
        return;
      }
      if (!this.hostTimers.has(roomId)) {
        const timer = setTimeout(
          () => void this.migrateHost(roomId, roomCode),
          this.hostGraceMs,
        );
        this.hostTimers.set(roomId, timer);
      }
    } catch (error) {
      this.logger.error('Failed to sync host migration', errorTrace(error));
    }
  }

  private cancelHostMigration(roomId: string) {
    clearTimeout(this.hostTimers.get(roomId));
    this.hostTimers.delete(roomId);
  }

  private async migrateHost(roomId: string, roomCode: string) {
    try {
      this.hostTimers.delete(roomId);
      const change = await this.roomsService.migrateHost(roomId, this.isOnline);
      if (!change) {
        return;
      }
      this.logger.log(
        `host migrated (room ${roomId}, new host ${change.newHostPlayerId})`,
      );
      this.server.to(roomChannel(roomCode)).emit('room:host-changed', change);
      await this.broadcastRoomState(roomCode);
    } catch (error) {
      this.logger.error('Failed to migrate host', errorTrace(error));
    }
  }

  private async authenticate(socket: Socket) {
    const auth: Record<string, unknown> = socket.handshake.auth ?? {};
    const { reconnectToken } = auth;
    // Same code rules as the REST routes (RoomCodePipe).
    const roomCode = normalizeRoomCode(auth.roomCode);
    // Keep the raw token out of long-lived server memory.
    delete auth.reconnectToken;
    if (!roomCode || typeof reconnectToken !== 'string' || !reconnectToken) {
      return false;
    }
    try {
      const { room, player } = await this.roomsService.reconnect(roomCode, {
        reconnectToken,
      });
      const data: SocketData = {
        playerId: player.id,
        roomId: room.id,
        roomCode: room.code,
      };
      socket.data = data;
      return true;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        return false;
      }
      throw error;
    }
  }

  private async broadcastRoomState(roomCode: string) {
    try {
      const state = await this.roomsService.getRoomState(roomCode);
      if (!state) {
        return;
      }
      const players = state.players.map((player) => ({
        ...player,
        isOnline: this.onlineSockets.has(player.id),
      }));
      const { activeEvent } = state;
      this.server.to(roomChannel(roomCode)).emit('room:state', {
        room: state.room,
        players,
        // Eligible targets depend on presence, so they are worked out here.
        activeEvent:
          activeEvent?.type === 'TARGET_DRINK'
            ? {
                ...activeEvent,
                eligibleTargets: players
                  .filter(
                    (player) =>
                      player.id !== activeEvent.playerId && player.isOnline,
                  )
                  .map(({ id, displayName }) => ({ id, displayName })),
              }
            : activeEvent,
        endVote: state.endVote,
        history: state.history,
        serverTime: state.serverTime,
      });
    } catch (error) {
      this.logger.error('Failed to broadcast room state', errorTrace(error));
    }
  }
}
