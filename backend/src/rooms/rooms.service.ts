import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import type {
  EndVoteChoice,
  MissionType,
  MissionVoteChoice,
  Room,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { TileType, getTile, movePosition, resolveAutoTile } from './board.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { ReconnectRoomDto } from './dto/reconnect-room.dto.js';
import { SaveMissionDto } from './dto/save-mission.dto.js';
import { SavePenaltyDto } from './dto/save-penalty.dto.js';
import { SaveQuestionDto } from './dto/save-question.dto.js';
import { createReconnectToken, hashReconnectToken } from './reconnect-token.js';
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from './user-input.js';

// Ten collisions in a row in a 32^6 code space means something is wrong, not bad luck.
const ROOM_CODE_MAX_ATTEMPTS = 10;
const MISSION_FIELDS = {
  id: true,
  content: true,
  type: true,
  durationSeconds: true,
} as const;

export function missionEndsAt(startedAt: Date, durationSeconds: number) {
  return new Date(startedAt.getTime() + durationSeconds * 1000);
}

// What removing a player needs to know about the room.
type RemovalRoom = Pick<
  Room,
  | 'status'
  | 'currentTurnOrder'
  | 'activeMissionStage'
  | 'activeMissionVoteRoundId'
>;

// Who takes over as host: the first online non-host player in the order given (host-migration
// order: turn order, then join order). Shared by the migration timer and a leaving host.
function nextHost<T extends { id: string; isHost: boolean }>(
  players: T[],
  isOnline: (playerId: string) => boolean,
) {
  return players.find((player) => !player.isHost && isOnline(player.id));
}

// True only when the unique index on Room.code rejected an insert. With the pg driver adapter
// Prisma reports the violated index in meta.driverAdapterError.cause.constraint (there is no
// meta.target), so other unique conflicts, e.g. Player.reconnectTokenHash, do not match.
function isRoomCodeConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | {
        modelName?: string;
        driverAdapterError?: {
          cause?: { constraint?: { index?: string; fields?: string[] } };
        };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  return (
    meta?.modelName === 'Room' &&
    (constraint?.index === 'Room_code_key' ||
      constraint?.fields?.includes('code') === true)
  );
}

// Fisher-Yates with a crypto RNG so every order is equally likely.
function shuffle<T>(items: readonly T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create({ nickname, maxPlayers }: CreateRoomDto) {
    // A failed attempt is rolled back as a whole, so the same token goes with the next code.
    const { token, hash } = createReconnectToken();

    // The unique index on Room.code is what keeps codes unique, also between concurrent
    // creates: insert with a fresh code, and only if that index rejects it try another one.
    for (let attempt = 1; attempt <= ROOM_CODE_MAX_ATTEMPTS; attempt++) {
      const code = this.generateRoomCode();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: { code, maxPlayers },
            select: { id: true, code: true, maxPlayers: true, status: true },
          });
          const host = await tx.player.create({
            data: {
              roomId: room.id,
              nickname,
              displayName: nickname,
              isHost: true,
              reconnectTokenHash: hash,
            },
            select: {
              id: true,
              nickname: true,
              displayName: true,
              isHost: true,
            },
          });
          return { room, host: { ...host, reconnectToken: token } };
        });
      } catch (error) {
        if (!isRoomCodeConflict(error)) {
          throw error;
        }
        this.logger.warn(
          `room code collision (${attempt}/${ROOM_CODE_MAX_ATTEMPTS})`,
        );
      }
    }
    this.logger.error(
      `no free room code after ${ROOM_CODE_MAX_ATTEMPTS} attempts`,
    );
    throw new InternalServerErrorException(
      'Failed to generate a unique room code',
    );
  }

  async join(code: string, { nickname }: JoinRoomDto) {
    const { token, hash } = createReconnectToken();

    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so concurrent joins to the same room run one at a time.
      const locked = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM "Room" WHERE "code" = ${code} FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('Room not found');
      }

      const room = await tx.room.findUniqueOrThrow({
        where: { code },
        select: { id: true, code: true, maxPlayers: true, status: true },
      });
      if (room.status !== 'WAITING') {
        throw new ConflictException('Room is not accepting new players');
      }

      const players = await tx.player.findMany({
        where: { roomId: room.id },
        select: { displayName: true },
      });
      if (players.length >= room.maxPlayers) {
        throw new ConflictException('Room is full');
      }

      const player = await tx.player.create({
        data: {
          roomId: room.id,
          nickname,
          displayName: this.getAvailableDisplayName(
            nickname,
            players.map((p) => p.displayName),
          ),
          reconnectTokenHash: hash,
        },
        select: { id: true, nickname: true, displayName: true, isHost: true },
      });
      await this.touchRoom(tx, room.id);
      return { room, player: { ...player, reconnectToken: token } };
    });
  }

  async reconnect(code: string, { reconnectToken }: ReconnectRoomDto) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: { id: true, code: true, maxPlayers: true, status: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = await this.prisma.player.findUnique({
      where: {
        reconnectTokenHash: hashReconnectToken(reconnectToken),
        roomId: room.id,
      },
      select: {
        id: true,
        nickname: true,
        displayName: true,
        isHost: true,
        turnOrder: true,
        position: true,
        accumulatedDrinks: true,
      },
    });
    if (!player) {
      throw new UnauthorizedException('Invalid reconnect token');
    }
    // Also reached by every socket handshake and content API call (authorizeMember).
    await this.touchRoom(this.prisma, room.id);
    return { room, player };
  }

  async getRoomState(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        maxPlayers: true,
        status: true,
        currentTurnOrder: true,
        turnPhase: true,
        activeQuestionId: true,
        activeQuestionContent: true,
        activeMissionContent: true,
        activeMissionType: true,
        activeMissionDurationSeconds: true,
        activeMissionStartedAt: true,
        activeMissionStage: true,
        activeMissionVoteRoundId: true,
        activePenaltySource: true,
        activeEndVoteRoundId: true,
        players: {
          select: {
            id: true,
            nickname: true,
            displayName: true,
            isHost: true,
            turnOrder: true,
            position: true,
            accumulatedDrinks: true,
          },
          orderBy: [{ turnOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!room) {
      return null;
    }
    const {
      players,
      activeQuestionId,
      activeQuestionContent,
      activeMissionContent,
      activeMissionType,
      activeMissionDurationSeconds,
      activeMissionStartedAt,
      activeMissionStage,
      activeMissionVoteRoundId,
      activePenaltySource,
      activeEndVoteRoundId,
      ...roomInfo
    } = room;
    const current = players.find(
      (player) => player.turnOrder === roomInfo.currentTurnOrder,
    );
    // Only how many have voted; the O/X split stays hidden until the result.
    const voteProgress =
      activeMissionStage === 'AWAITING_VOTE' && activeMissionVoteRoundId
        ? {
            voted: await this.prisma.missionVote.count({
              where: { voteRoundId: activeMissionVoteRoundId },
            }),
            total: players.length - 1,
          }
        : null;
    const missionEvent =
      activeMissionContent !== null &&
      activeMissionType !== null &&
      activeMissionStage !== null
        ? {
            type: 'MISSION' as const,
            playerId: current?.id ?? null,
            displayName: current?.displayName ?? null,
            mission: {
              content: activeMissionContent,
              type: activeMissionType,
              durationSeconds: activeMissionDurationSeconds,
              stage: activeMissionStage,
              startedAt: activeMissionStartedAt?.toISOString() ?? null,
              endsAt:
                activeMissionStartedAt && activeMissionDurationSeconds !== null
                  ? missionEndsAt(
                      activeMissionStartedAt,
                      activeMissionDurationSeconds,
                    ).toISOString()
                  : null,
            },
            voteProgress,
            serverTime: new Date().toISOString(),
          }
        : null;
    const penaltyEvent =
      activePenaltySource !== null
        ? {
            type: 'PENALTY' as const,
            playerId: current?.id ?? null,
            displayName: current?.displayName ?? null,
            source: activePenaltySource,
            // The failed mission, so the penalty screen can show what was failed.
            mission:
              activePenaltySource === 'MISSION_FAILURE'
                ? (missionEvent?.mission ?? null)
                : null,
          }
        : null;
    // TARGET_DRINK has no DB state: the current player standing on the tile is the signal.
    // The gateway adds eligibleTargets, since only it knows who is online.
    const targetEvent =
      roomInfo.turnPhase === 'RESOLVING_TILE' &&
      current &&
      getTile(current.position).type === TileType.TARGET_DRINK
        ? {
            type: 'TARGET_DRINK' as const,
            playerId: current.id,
            displayName: current.displayName,
          }
        : null;
    const activeEvent =
      penaltyEvent ??
      (activeQuestionContent !== null
        ? {
            type: 'QA' as const,
            question: { id: activeQuestionId, content: activeQuestionContent },
          }
        : (missionEvent ?? targetEvent));
    // The game is paused underneath; only how many have voted is shown, never YES/NO.
    const endVote = activeEndVoteRoundId
      ? {
          active: true as const,
          voted: await this.prisma.gameEndVote.count({
            where: { voteRoundId: activeEndVoteRoundId },
          }),
          total: players.length,
        }
      : null;
    return { room: roomInfo, players, activeEvent, endVote };
  }

  async listMissions(roomId: string) {
    return this.prisma.mission.findMany({
      where: { roomId },
      select: MISSION_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMission(roomId: string, dto: SaveMissionDto) {
    return this.prisma.mission.create({
      data: {
        roomId,
        content: dto.content,
        type: dto.type,
        durationSeconds: dto.type === 'TIMED' ? dto.durationSeconds : null,
      },
      select: MISSION_FIELDS,
    });
  }

  async updateMission(roomId: string, missionId: string, dto: SaveMissionDto) {
    const data = {
      content: dto.content,
      type: dto.type,
      durationSeconds:
        dto.type === 'TIMED' ? (dto.durationSeconds ?? null) : null,
    };
    const { count } = await this.prisma.mission.updateMany({
      where: { id: missionId, roomId },
      data,
    });
    if (count === 0) {
      throw new NotFoundException('Mission not found');
    }
    return { id: missionId, ...data };
  }

  async deleteMission(roomId: string, missionId: string) {
    const { count } = await this.prisma.mission.deleteMany({
      where: { id: missionId, roomId },
    });
    if (count === 0) {
      throw new NotFoundException('Mission not found');
    }
  }

  async listQuestions(roomId: string) {
    return this.prisma.question.findMany({
      where: { roomId },
      select: { id: true, content: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createQuestion(roomId: string, { content }: SaveQuestionDto) {
    return this.prisma.question.create({
      data: { roomId, content },
      select: { id: true, content: true },
    });
  }

  async updateQuestion(
    roomId: string,
    questionId: string,
    { content }: SaveQuestionDto,
  ) {
    const { count } = await this.prisma.question.updateMany({
      where: { id: questionId, roomId },
      data: { content },
    });
    if (count === 0) {
      throw new NotFoundException('Question not found');
    }
    return { id: questionId, content };
  }

  async deleteQuestion(roomId: string, questionId: string) {
    const { count } = await this.prisma.question.deleteMany({
      where: { id: questionId, roomId },
    });
    if (count === 0) {
      throw new NotFoundException('Question not found');
    }
  }

  async listPenalties(roomId: string) {
    return this.prisma.penalty.findMany({
      where: { roomId },
      select: { id: true, content: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createPenalty(roomId: string, { content }: SavePenaltyDto) {
    return this.prisma.penalty.create({
      data: { roomId, content },
      select: { id: true, content: true },
    });
  }

  async updatePenalty(
    roomId: string,
    penaltyId: string,
    { content }: SavePenaltyDto,
  ) {
    const { count } = await this.prisma.penalty.updateMany({
      where: { id: penaltyId, roomId },
      data: { content },
    });
    if (count === 0) {
      throw new NotFoundException('Penalty not found');
    }
    return { id: penaltyId, content };
  }

  async deletePenalty(roomId: string, penaltyId: string) {
    const { count } = await this.prisma.penalty.deleteMany({
      where: { id: penaltyId, roomId },
    });
    if (count === 0) {
      throw new NotFoundException('Penalty not found');
    }
  }

  async findRoomPlayer(roomId: string, playerId: string) {
    return this.prisma.player.findFirst({
      where: { id: playerId, roomId },
      select: { id: true, isHost: true },
    });
  }

  // The room's host and the room status, for the gateway's host-migration timer.
  async findHost(roomId: string) {
    return this.prisma.player.findFirst({
      where: { roomId, isHost: true },
      select: { id: true, room: { select: { status: true } } },
    });
  }

  // Hands the host role to an online player once the host has stayed offline past the grace
  // period. Only isHost changes: turn order, the current turn and any active event stay as
  // they are. Returns null when there is nothing to do (room gone or ENDED, host back
  // online, nobody else online).
  async migrateHost(roomId: string, isOnline: (playerId: string) => boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { status: true },
      });
      if (!room || room.status === 'ENDED') {
        return null;
      }
      // Lowest turn order first (PLAYING); before the game turnOrder is null for everyone,
      // so it falls back to join order (WAITING).
      const players = await tx.player.findMany({
        where: { roomId },
        select: { id: true, displayName: true, isHost: true },
        orderBy: [
          { turnOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });
      const host = players.find((player) => player.isHost);
      // Presence lives in memory, so it is read here while the room lock is held.
      if (!host || isOnline(host.id)) {
        return null;
      }
      const next = nextHost(players, isOnline);
      if (!next) {
        return null;
      }
      // Both in this transaction, so the room never ends up with no host or two hosts.
      await tx.player.update({
        where: { id: host.id },
        data: { isHost: false },
      });
      await tx.player.update({
        where: { id: next.id },
        data: { isHost: true },
      });
      return {
        previousHostPlayerId: host.id,
        newHostPlayerId: next.id,
        newHostDisplayName: next.displayName,
      };
    });
  }

  // Kick: the host removes a player who is offline (never the host).
  async removePlayer(
    roomId: string,
    playerId: string,
    isOnline: (playerId: string) => boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Kicking during an end-game vote would change who gets to vote.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      // Presence lives in memory, so it is checked again now that the room is locked.
      if (isOnline(playerId)) {
        return { ok: false as const, code: 'PLAYER_ONLINE' as const };
      }
      const { room, players } = await this.readForRemoval(tx, roomId);
      const target = players.find(
        (player) => player.id === playerId && !player.isHost,
      );
      if (!room || !target) {
        return { ok: false as const, code: 'PLAYER_NOT_FOUND' as const };
      }
      return {
        ok: true as const,
        ...(await this.dropPlayer(tx, roomId, room, players, target)),
      };
    });
  }

  // A player leaves the room for good, by their own choice: the same removal as a kick. A leaving
  // host hands the role on first, to the player a host migration would pick (or, with nobody else
  // online, the next one in that order). The last player takes the room with them.
  async leaveRoom(
    roomId: string,
    playerId: string,
    isOnline: (playerId: string) => boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Leaving during an end-game vote would change who gets to vote.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      const { room, players } = await this.readForRemoval(tx, roomId);
      const target = players.find((player) => player.id === playerId);
      if (!room || !target) {
        return { ok: false as const, code: 'PLAYER_NOT_FOUND' as const };
      }
      if (players.length === 1) {
        // Players, content and votes go with it (onDelete: Cascade).
        await tx.room.delete({ where: { id: roomId } });
        return {
          ok: true as const,
          roomDeleted: true,
          wasCurrent: false,
          missionVote: null,
          hostChange: null,
        };
      }
      let hostChange = null;
      if (target.isHost) {
        const next =
          nextHost(players, isOnline) ??
          players.find((player) => player.id !== target.id);
        if (next) {
          // The leaving host is deleted below, so the room ends this transaction with one host.
          await tx.player.update({
            where: { id: next.id },
            data: { isHost: true },
          });
          hostChange = {
            previousHostPlayerId: target.id,
            newHostPlayerId: next.id,
            newHostDisplayName: next.displayName,
          };
        }
      }
      return {
        ok: true as const,
        roomDeleted: false,
        ...(await this.dropPlayer(tx, roomId, room, players, target)),
        hostChange,
      };
    });
  }

  // Players in host-migration order, which in PLAYING is also turn order.
  private async readForRemoval(tx: Prisma.TransactionClient, roomId: string) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        status: true,
        currentTurnOrder: true,
        activeMissionStage: true,
        activeMissionVoteRoundId: true,
      },
    });
    const players = await tx.player.findMany({
      where: { roomId },
      select: { id: true, displayName: true, isHost: true, turnOrder: true },
      orderBy: [
        { turnOrder: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
    return { room, players };
  }

  // Deletes a player (kicked or leaving). In PLAYING the turn order is closed up again (same
  // relative order, 0..N-1) and the turn stays with the same player; if the current player goes,
  // whatever they were resolving is dropped and the next player in the old order takes over.
  private async dropPlayer(
    tx: Prisma.TransactionClient,
    roomId: string,
    room: RemovalRoom,
    players: { id: string; turnOrder: number | null }[],
    target: { id: string; turnOrder: number | null },
  ) {
    await this.touchRoom(tx, roomId);
    if (room.status !== 'PLAYING' || room.currentTurnOrder === null) {
      await tx.player.delete({ where: { id: target.id } });
      return { wasCurrent: false, missionVote: null };
    }

    const current = players.find(
      (player) => player.turnOrder === room.currentTurnOrder,
    );
    const wasCurrent = current?.id === target.id;
    const remaining = players.filter((player) => player.id !== target.id);
    const targetOrder = target.turnOrder ?? 0;
    const keep = wasCurrent
      ? (remaining.find((player) => (player.turnOrder ?? 0) > targetOrder) ??
        remaining[0])
      : current;
    if (wasCurrent && room.activeMissionVoteRoundId) {
      // The removed performer's mission vote is cancelled, not counted.
      await tx.missionVote.deleteMany({
        where: { voteRoundId: room.activeMissionVoteRoundId },
      });
    }
    // Cascades the player's own MissionVote / GameEndVote rows.
    await tx.player.delete({ where: { id: target.id } });
    for (const [turnOrder, player] of remaining.entries()) {
      if (player.turnOrder !== turnOrder) {
        await tx.player.update({
          where: { id: player.id },
          data: { turnOrder },
        });
      }
    }
    const currentTurnOrder = Math.max(
      0,
      remaining.findIndex((player) => player.id === keep?.id),
    );
    if (wasCurrent) {
      await this.startTurn(tx, roomId, currentTurnOrder);
      return { wasCurrent, missionVote: null };
    }
    await tx.room.update({
      where: { id: roomId },
      data: { currentTurnOrder },
    });
    // One voter fewer: an open mission vote may be complete now.
    const missionVote =
      room.activeMissionStage === 'AWAITING_VOTE' &&
      room.activeMissionVoteRoundId
        ? await this.settleMissionVote(
            tx,
            roomId,
            room.activeMissionVoteRoundId,
            currentTurnOrder,
          )
        : null;
    return {
      wasCurrent,
      missionVote: missionVote?.completed ? missionVote : null,
    };
  }

  async startGame(roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so a concurrent start or join cannot interleave.
      await tx.$queryRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUniqueOrThrow({
        where: { id: roomId },
        select: { status: true },
      });
      if (room.status !== 'WAITING') {
        return { ok: false as const, code: 'INVALID_ROOM_STATE' as const };
      }

      const players = await tx.player.findMany({
        where: { roomId },
        select: { id: true, displayName: true },
        orderBy: { createdAt: 'asc' },
      });
      if (players.length < 2) {
        return { ok: false as const, code: 'NOT_ENOUGH_PLAYERS' as const };
      }

      const order = shuffle(players);
      for (const [turnOrder, player] of order.entries()) {
        await tx.player.update({
          where: { id: player.id },
          data: { turnOrder },
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'PLAYING',
          currentTurnOrder: 0,
          turnPhase: 'AWAITING_ROLL',
          lastActivityAt: new Date(),
        },
      });
      return { ok: true as const, firstPlayer: order[0] };
    });
  }

  // `dice` is only passed by tests; the gateway always lets the server roll.
  async rollDice(roomId: string, playerId: string, dice = randomInt(1, 7)) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so concurrent rolls are processed one at a time.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { status: true, currentTurnOrder: true, turnPhase: true },
      });
      if (room?.status !== 'PLAYING') {
        return { ok: false as const, code: 'GAME_NOT_PLAYING' as const };
      }

      const player = await tx.player.findFirst({
        where: { id: playerId, roomId },
        select: {
          id: true,
          displayName: true,
          turnOrder: true,
          position: true,
          accumulatedDrinks: true,
        },
      });
      if (
        player?.turnOrder == null ||
        player.turnOrder !== room.currentTurnOrder
      ) {
        return { ok: false as const, code: 'NOT_YOUR_TURN' as const };
      }
      if (room.turnPhase !== 'AWAITING_ROLL') {
        return { ok: false as const, code: 'INVALID_TURN_PHASE' as const };
      }

      const toPosition = movePosition(player.position, dice);
      const tile = getTile(toPosition);
      const auto = resolveAutoTile(tile.type, player.accumulatedDrinks);
      await tx.player.update({
        where: { id: player.id },
        data: {
          position: toPosition,
          accumulatedDrinks: auto?.accumulatedDrinks,
        },
      });

      let question: { id: string; content: string } | null = null;
      if (tile.type === TileType.QA) {
        const questions = await tx.question.findMany({
          where: { roomId },
          select: { id: true, content: true },
          orderBy: { createdAt: 'asc' },
        });
        if (questions.length > 0) {
          question = questions[randomInt(questions.length)];
        }
      }
      let mission: {
        content: string;
        type: MissionType;
        durationSeconds: number | null;
      } | null = null;
      if (tile.type === TileType.MISSION) {
        const missions = await tx.mission.findMany({
          where: { roomId },
          select: { content: true, type: true, durationSeconds: true },
          orderBy: { createdAt: 'asc' },
        });
        if (missions.length > 0) {
          mission = missions[randomInt(missions.length)];
        }
      }
      // A PENALTY tile only waits for the roulette here; the penalty is picked on spin.
      const penaltyReady =
        tile.type === TileType.PENALTY &&
        (await tx.penalty.count({ where: { roomId } })) > 0;
      // QA / MISSION / PENALTY tiles with nothing registered are skipped so the game never stalls.
      const qaEmpty = tile.type === TileType.QA && !question;
      const missionEmpty = tile.type === TileType.MISSION && !mission;
      const penaltyEmpty = tile.type === TileType.PENALTY && !penaltyReady;

      if (auto || qaEmpty || missionEmpty || penaltyEmpty) {
        await this.advanceTurn(tx, roomId, player.turnOrder);
      } else {
        await tx.room.update({
          where: { id: roomId },
          data: {
            turnPhase: 'RESOLVING_TILE',
            activeQuestionId: question?.id,
            activeQuestionContent: question?.content,
            activeMissionContent: mission?.content,
            activeMissionType: mission?.type,
            activeMissionDurationSeconds: mission?.durationSeconds,
            activeMissionStartedAt: mission ? null : undefined,
            activeMissionStage: mission ? 'READY' : undefined,
            activePenaltySource: penaltyReady ? 'TILE' : undefined,
            lastActivityAt: new Date(),
          },
        });
      }
      return {
        ok: true as const,
        playerId: player.id,
        displayName: player.displayName,
        dice,
        fromPosition: player.position,
        toPosition,
        tile,
        effect: auto?.effect ?? null,
        question,
        qaEmpty,
        mission,
        missionEmpty,
        penaltyReady,
        penaltyEmpty,
      };
    });
  }

  async startMission(roomId: string, playerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const turn = await this.lockMissionTurn(tx, roomId, playerId);
      if (turn.error) {
        return { ok: false as const, code: turn.error };
      }
      const { room, player } = turn;
      if (
        room.turnPhase !== 'RESOLVING_TILE' ||
        room.activeMissionType !== 'TIMED' ||
        room.activeMissionStage !== 'READY' ||
        room.activeMissionStartedAt !== null ||
        room.activeMissionContent === null ||
        room.activeMissionDurationSeconds === null
      ) {
        return { ok: false as const, code: 'INVALID_MISSION_STATE' as const };
      }
      const startedAt = new Date();
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeMissionStartedAt: startedAt,
          activeMissionStage: 'RUNNING',
          lastActivityAt: startedAt,
        },
      });
      return {
        ok: true as const,
        playerId: player.id,
        displayName: player.displayName,
        mission: {
          content: room.activeMissionContent,
          type: room.activeMissionType,
          durationSeconds: room.activeMissionDurationSeconds,
          startedAt,
        },
      };
    });
  }

  async completeMission(roomId: string, playerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const turn = await this.lockMissionTurn(tx, roomId, playerId);
      if (turn.error) {
        return { ok: false as const, code: turn.error };
      }
      const { room, player } = turn;
      if (
        room.turnPhase !== 'RESOLVING_TILE' ||
        room.activeMissionType !== 'NORMAL' ||
        room.activeMissionStage !== 'READY' ||
        room.activeMissionContent === null
      ) {
        return { ok: false as const, code: 'INVALID_MISSION_STATE' as const };
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeMissionStage: 'AWAITING_VOTE',
          activeMissionVoteRoundId: randomUUID(),
          lastActivityAt: new Date(),
        },
      });
      return {
        ok: true as const,
        playerId: player.id,
        displayName: player.displayName,
        mission: {
          content: room.activeMissionContent,
          type: room.activeMissionType,
        },
      };
    });
  }

  // Called by the gateway's timer; the DB decides whether the mission really ended.
  async expireMission(roomId: string, startedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      // The mission clock is stopped while an end-game vote pauses the game.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { status: 'STALE' as const };
      }
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: {
          currentTurnOrder: true,
          activeMissionContent: true,
          activeMissionType: true,
          activeMissionDurationSeconds: true,
          activeMissionStartedAt: true,
          activeMissionStage: true,
        },
      });
      if (
        room?.activeMissionStage !== 'RUNNING' ||
        room.activeMissionStartedAt?.getTime() !== startedAt.getTime() ||
        room.activeMissionDurationSeconds === null ||
        room.activeMissionContent === null ||
        room.activeMissionType === null
      ) {
        return { status: 'STALE' as const };
      }
      const endsAt = missionEndsAt(
        startedAt,
        room.activeMissionDurationSeconds,
      );
      if (endsAt.getTime() > Date.now()) {
        return { status: 'NOT_YET' as const };
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeMissionStage: 'AWAITING_VOTE',
          activeMissionVoteRoundId: randomUUID(),
        },
      });
      const player = await tx.player.findFirst({
        where: { roomId, turnOrder: room.currentTurnOrder },
        select: { id: true, displayName: true },
      });
      return {
        status: 'EXPIRED' as const,
        playerId: player?.id ?? null,
        displayName: player?.displayName ?? null,
        mission: {
          content: room.activeMissionContent,
          type: room.activeMissionType,
        },
      };
    });
  }

  async getRunningMission(roomId: string) {
    const room = await this.prisma.room.findFirst({
      // Nothing to schedule while an end-game vote pauses the game.
      where: {
        id: roomId,
        activeMissionStage: 'RUNNING',
        activeEndVoteRoundId: null,
      },
      select: {
        activeMissionStartedAt: true,
        activeMissionDurationSeconds: true,
      },
    });
    if (
      !room?.activeMissionStartedAt ||
      room.activeMissionDurationSeconds === null
    ) {
      return null;
    }
    return {
      startedAt: room.activeMissionStartedAt,
      durationSeconds: room.activeMissionDurationSeconds,
    };
  }

  // Rooms whose timed mission clock is running (not paused by an end-game vote), for the
  // gateway to rebuild its timers after a server start.
  async listRunningMissionRooms() {
    return this.prisma.room.findMany({
      where: {
        status: 'PLAYING',
        activeMissionStage: 'RUNNING',
        activeEndVoteRoundId: null,
      },
      select: { id: true, code: true },
    });
  }

  async voteMission(
    roomId: string,
    playerId: string,
    choice: MissionVoteChoice,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so votes run one at a time and only the last one settles the round.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          currentTurnOrder: true,
          turnPhase: true,
          activeMissionContent: true,
          activeMissionType: true,
          activeMissionStage: true,
          activeMissionVoteRoundId: true,
        },
      });
      const voteRoundId = room?.activeMissionVoteRoundId;
      if (
        room?.status !== 'PLAYING' ||
        room.turnPhase !== 'RESOLVING_TILE' ||
        room.activeMissionStage !== 'AWAITING_VOTE' ||
        !voteRoundId ||
        room.activeMissionContent === null ||
        room.activeMissionType === null ||
        room.currentTurnOrder === null
      ) {
        return { ok: false as const, code: 'VOTING_NOT_ACTIVE' as const };
      }
      const players = await tx.player.findMany({
        where: { roomId },
        select: { id: true, displayName: true, turnOrder: true },
      });
      const performer = players.find(
        (player) => player.turnOrder === room.currentTurnOrder,
      );
      if (performer?.id === playerId) {
        return { ok: false as const, code: 'PERFORMER_CANNOT_VOTE' as const };
      }
      if (!players.some((player) => player.id === playerId)) {
        return { ok: false as const, code: 'PLAYER_NOT_FOUND' as const };
      }
      const existing = await tx.missionVote.findUnique({
        where: { voteRoundId_voterId: { voteRoundId, voterId: playerId } },
        select: { id: true },
      });
      if (existing) {
        return { ok: false as const, code: 'ALREADY_VOTED' as const };
      }
      await tx.missionVote.create({
        data: { roomId, voteRoundId, voterId: playerId, choice },
      });
      await this.touchRoom(tx, roomId);
      return this.settleMissionVote(
        tx,
        roomId,
        voteRoundId,
        room.currentTurnOrder,
      );
    });
  }

  // Settles the mission vote once everyone in the room except the performer has voted.
  // Called after a vote, and after a kick (the kicked voter's vote is gone with them).
  private async settleMissionVote(
    tx: Prisma.TransactionClient,
    roomId: string,
    voteRoundId: string,
    currentTurnOrder: number,
  ) {
    const players = await tx.player.findMany({
      where: { roomId },
      select: { id: true, displayName: true, turnOrder: true },
    });
    const performer = players.find(
      (player) => player.turnOrder === currentTurnOrder,
    );
    const votes = await tx.missionVote.findMany({
      where: { voteRoundId },
      select: { choice: true },
    });
    const total = players.length - 1;
    if (votes.length < total) {
      return {
        ok: true as const,
        completed: false as const,
        voted: votes.length,
        total,
      };
    }
    const o = votes.filter((vote) => vote.choice === 'O').length;
    const x = votes.length - o;
    const result = o > x ? 'SUCCESS' : x > o ? 'FAILED' : 'INVALID';
    await tx.missionVote.deleteMany({ where: { voteRoundId } });
    // A failed mission goes to the penalty roulette, unless the room has no penalties.
    const penaltyReady =
      result === 'FAILED' &&
      (await tx.penalty.count({ where: { roomId } })) > 0;
    if (penaltyReady) {
      // Same turn; the mission snapshot stays for the penalty roulette.
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeMissionStage: 'PENALTY_PENDING',
          activeMissionVoteRoundId: null,
          activePenaltySource: 'MISSION_FAILURE',
        },
      });
    } else {
      await this.advanceTurn(tx, roomId, currentTurnOrder);
    }
    return {
      ok: true as const,
      completed: true as const,
      playerId: performer?.id ?? null,
      displayName: performer?.displayName ?? null,
      o,
      x,
      result,
      penaltyReady,
      penaltyEmpty: result === 'FAILED' && !penaltyReady,
    };
  }

  async spinPenalty(roomId: string, playerId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so a double spin settles only once.
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          currentTurnOrder: true,
          turnPhase: true,
          activeMissionStage: true,
          activePenaltySource: true,
        },
      });
      const source = room?.activePenaltySource;
      if (
        room?.status !== 'PLAYING' ||
        room.turnPhase !== 'RESOLVING_TILE' ||
        !source ||
        (source === 'MISSION_FAILURE' &&
          room.activeMissionStage !== 'PENALTY_PENDING')
      ) {
        return { ok: false as const, code: 'PENALTY_NOT_ACTIVE' as const };
      }
      const player = await tx.player.findFirst({
        where: { id: playerId, roomId },
        select: { id: true, displayName: true, turnOrder: true },
      });
      if (
        player?.turnOrder == null ||
        player.turnOrder !== room.currentTurnOrder
      ) {
        return { ok: false as const, code: 'NOT_YOUR_TURN' as const };
      }

      // The latest list is the candidate set; the pick is kept as a local value,
      // so editing or deleting the source Penalty later cannot change this result.
      const penalties = await tx.penalty.findMany({
        where: { roomId },
        select: { id: true, content: true },
        orderBy: { createdAt: 'asc' },
      });
      const penalty =
        penalties.length > 0 ? penalties[randomInt(penalties.length)] : null;
      // Also clears the failed mission's snapshot and activePenaltySource.
      await this.advanceTurn(tx, roomId, player.turnOrder);
      return {
        ok: true as const,
        playerId: player.id,
        displayName: player.displayName,
        source,
        penalty,
      };
    });
  }

  // Called by the gateway right after a roll lands on TARGET_DRINK.
  async openTargetSelection(
    roomId: string,
    playerId: string,
    isOnline: (playerId: string) => boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const turn = await this.lockTargetTurn(tx, roomId, playerId);
      if (turn.error) {
        return { ok: false as const, code: turn.error };
      }
      const eligibleTargets = turn.others
        .filter((player) => isOnline(player.id))
        .map(({ id, displayName }) => ({ id, displayName }));
      if (eligibleTargets.length === 0) {
        // Nobody else is online to target; skip the tile so the game never stalls.
        await this.advanceTurn(tx, roomId, turn.turnOrder);
      }
      return { ok: true as const, eligibleTargets };
    });
  }

  // Only the turn moves on; the drink itself is a game instruction and is not recorded.
  async selectTarget(
    roomId: string,
    playerId: string,
    targetPlayerId: string,
    isOnline: (playerId: string) => boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const turn = await this.lockTargetTurn(tx, roomId, playerId);
      if (turn.error) {
        return { ok: false as const, code: turn.error };
      }
      const { current, others, turnOrder } = turn;
      const source = { id: current.id, displayName: current.displayName };
      const target = others.find((player) => player.id === targetPlayerId);
      // Presence lives in memory, so it is read here while the room lock is held.
      if (!target || !isOnline(target.id)) {
        const code =
          targetPlayerId === current.id
            ? ('CANNOT_TARGET_SELF' as const)
            : !target
              ? ('PLAYER_NOT_FOUND' as const)
              : ('TARGET_OFFLINE' as const);
        if (others.some((player) => isOnline(player.id))) {
          return { ok: false as const, code };
        }
        // Everyone else went offline while choosing; skip instead of blocking the game.
        await this.advanceTurn(tx, roomId, turnOrder);
        return { ok: true as const, source, target: null };
      }
      await this.advanceTurn(tx, roomId, turnOrder);
      return {
        ok: true as const,
        source,
        target: { id: target.id, displayName: target.displayName },
      };
    });
  }

  // Opens an end-game vote. It only pauses the game: turn, tile and event state stay as they are.
  async requestEndVote(roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { status: true, activeEndVoteRoundId: true },
      });
      if (room?.status !== 'PLAYING') {
        return { ok: false as const, code: 'GAME_NOT_PLAYING' as const };
      }
      if (room.activeEndVoteRoundId) {
        return { ok: false as const, code: 'END_VOTE_ALREADY_ACTIVE' as const };
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeEndVoteRoundId: randomUUID(),
          activeEndVoteStartedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });
      return {
        ok: true as const,
        total: await tx.player.count({ where: { roomId } }),
      };
    });
  }

  async voteEndGame(roomId: string, playerId: string, choice: EndVoteChoice) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the room row so votes run one at a time and only the last one settles the round.
      await tx.$queryRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          activeEndVoteRoundId: true,
          activeEndVoteStartedAt: true,
          activeMissionStage: true,
          activeMissionStartedAt: true,
          activeMissionDurationSeconds: true,
          activeMissionVoteRoundId: true,
        },
      });
      const voteRoundId = room?.activeEndVoteRoundId;
      if (room?.status !== 'PLAYING' || !voteRoundId) {
        return { ok: false as const, code: 'END_VOTE_NOT_ACTIVE' as const };
      }
      // Everyone in the room votes, the host and offline players included.
      const players = await tx.player.findMany({
        where: { roomId },
        select: { id: true },
      });
      if (!players.some((player) => player.id === playerId)) {
        return { ok: false as const, code: 'PLAYER_NOT_FOUND' as const };
      }
      const existing = await tx.gameEndVote.findUnique({
        where: { voteRoundId_voterId: { voteRoundId, voterId: playerId } },
        select: { id: true },
      });
      if (existing) {
        return { ok: false as const, code: 'ALREADY_VOTED' as const };
      }
      await tx.gameEndVote.create({
        data: { roomId, voteRoundId, voterId: playerId, choice },
      });
      // Also starts the ENDED room's TTL when this is the deciding vote.
      await this.touchRoom(tx, roomId);

      const votes = await tx.gameEndVote.findMany({
        where: { voteRoundId },
        select: { choice: true },
      });
      const total = players.length;
      if (votes.length < total) {
        return {
          ok: true as const,
          completed: false as const,
          voted: votes.length,
          total,
        };
      }
      const yes = votes.filter((vote) => vote.choice === 'YES').length;
      const no = votes.length - yes;
      // Strict majority of everyone in the room; a tie keeps the game going.
      const ended = yes * 2 > total;
      await tx.gameEndVote.deleteMany({ where: { voteRoundId } });
      if (ended) {
        if (room.activeMissionVoteRoundId) {
          await tx.missionVote.deleteMany({
            where: { voteRoundId: room.activeMissionVoteRoundId },
          });
        }
        // Players keep position / turnOrder / accumulatedDrinks as the final result;
        // only the in-progress game state is cleared so no stale event remains.
        await tx.room.update({
          where: { id: roomId },
          data: {
            status: 'ENDED',
            currentTurnOrder: null,
            turnPhase: null,
            activeQuestionId: null,
            activeQuestionContent: null,
            activeMissionContent: null,
            activeMissionType: null,
            activeMissionDurationSeconds: null,
            activeMissionStartedAt: null,
            activeMissionStage: null,
            activeMissionVoteRoundId: null,
            activePenaltySource: null,
            activeEndVoteRoundId: null,
            activeEndVoteStartedAt: null,
          },
        });
        return {
          ok: true as const,
          completed: true as const,
          ended,
          yes,
          no,
          total,
          resumedMission: null,
        };
      }
      // Resume: a running timed mission starts later by the paused time, so it keeps
      // exactly the time it had left when the vote began (durationSeconds is unchanged).
      const resumedMission =
        room.activeMissionStage === 'RUNNING' &&
        room.activeMissionStartedAt &&
        room.activeEndVoteStartedAt &&
        room.activeMissionDurationSeconds !== null
          ? {
              startedAt: new Date(
                room.activeMissionStartedAt.getTime() +
                  (Date.now() - room.activeEndVoteStartedAt.getTime()),
              ),
              durationSeconds: room.activeMissionDurationSeconds,
            }
          : null;
      await tx.room.update({
        where: { id: roomId },
        data: {
          activeEndVoteRoundId: null,
          activeEndVoteStartedAt: null,
          activeMissionStartedAt: resumedMission?.startedAt,
        },
      });
      return {
        ok: true as const,
        completed: true as const,
        ended,
        yes,
        no,
        total,
        resumedMission,
      };
    });
  }

  async completeQa(roomId: string, playerId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (await this.lockAndCheckPaused(tx, roomId)) {
        return { ok: false as const, code: 'GAME_PAUSED' as const };
      }
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          currentTurnOrder: true,
          turnPhase: true,
          activeQuestionContent: true,
        },
      });
      if (room?.status !== 'PLAYING') {
        return { ok: false as const, code: 'GAME_NOT_PLAYING' as const };
      }
      const player = await tx.player.findFirst({
        where: { id: playerId, roomId },
        select: { id: true, displayName: true, turnOrder: true },
      });
      if (
        player?.turnOrder == null ||
        player.turnOrder !== room.currentTurnOrder
      ) {
        return { ok: false as const, code: 'NOT_YOUR_TURN' as const };
      }
      if (
        room.turnPhase !== 'RESOLVING_TILE' ||
        room.activeQuestionContent === null
      ) {
        return { ok: false as const, code: 'INVALID_TURN_PHASE' as const };
      }
      await this.advanceTurn(tx, roomId, player.turnOrder);
      return {
        ok: true as const,
        playerId: player.id,
        displayName: player.displayName,
      };
    });
  }

  private async advanceTurn(
    tx: Prisma.TransactionClient,
    roomId: string,
    turnOrder: number,
  ) {
    const playerCount = await tx.player.count({ where: { roomId } });
    await this.startTurn(tx, roomId, (turnOrder + 1) % playerCount);
  }

  // Gives the turn to `turnOrder` with nothing pending (no question, mission or penalty).
  private async startTurn(
    tx: Prisma.TransactionClient,
    roomId: string,
    turnOrder: number,
  ) {
    await tx.room.update({
      where: { id: roomId },
      data: {
        currentTurnOrder: turnOrder,
        turnPhase: 'AWAITING_ROLL',
        activeQuestionId: null,
        activeQuestionContent: null,
        activeMissionContent: null,
        activeMissionType: null,
        activeMissionDurationSeconds: null,
        activeMissionStartedAt: null,
        activeMissionStage: null,
        activeMissionVoteRoundId: null,
        activePenaltySource: null,
        lastActivityAt: new Date(),
      },
    });
  }

  // Marks the room as in use for RoomCleanupService where no room update happens anyway;
  // game actions that already update the room set lastActivityAt in that update instead.
  // updateMany, so a room deleted in the meantime is not an error.
  private async touchRoom(db: Prisma.TransactionClient, roomId: string) {
    await db.room.updateMany({
      where: { id: roomId },
      data: { lastActivityAt: new Date() },
    });
  }

  // Locks the room row for a game action and tells whether an end-game vote has paused
  // the game; every state-changing game action checks this first.
  private async lockAndCheckPaused(
    tx: Prisma.TransactionClient,
    roomId: string,
  ) {
    const [room] = await tx.$queryRaw<
      { activeEndVoteRoundId: string | null }[]
    >`
      SELECT "activeEndVoteRoundId" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;
    return Boolean(room?.activeEndVoteRoundId);
  }

  // Shared checks for mission actions: the game is running and it is the requester's turn.
  private async lockMissionTurn(
    tx: Prisma.TransactionClient,
    roomId: string,
    playerId: string,
  ) {
    if (await this.lockAndCheckPaused(tx, roomId)) {
      return { error: 'GAME_PAUSED' as const };
    }
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        status: true,
        currentTurnOrder: true,
        turnPhase: true,
        activeMissionContent: true,
        activeMissionType: true,
        activeMissionDurationSeconds: true,
        activeMissionStartedAt: true,
        activeMissionStage: true,
      },
    });
    if (room?.status !== 'PLAYING') {
      return { error: 'GAME_NOT_PLAYING' as const };
    }
    const player = await tx.player.findFirst({
      where: { id: playerId, roomId },
      select: { id: true, displayName: true, turnOrder: true },
    });
    if (
      player?.turnOrder == null ||
      player.turnOrder !== room.currentTurnOrder
    ) {
      return { error: 'NOT_YOUR_TURN' as const };
    }
    return { room, player };
  }

  // Shared checks for TARGET_DRINK: the game is running and the requester is the current
  // player, still standing on a TARGET_DRINK tile while the tile is being resolved.
  private async lockTargetTurn(
    tx: Prisma.TransactionClient,
    roomId: string,
    playerId: string,
  ) {
    if (await this.lockAndCheckPaused(tx, roomId)) {
      return { error: 'GAME_PAUSED' as const };
    }
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: { status: true, currentTurnOrder: true, turnPhase: true },
    });
    if (
      room?.status !== 'PLAYING' ||
      room.turnPhase !== 'RESOLVING_TILE' ||
      room.currentTurnOrder === null
    ) {
      return { error: 'TARGET_SELECTION_NOT_ACTIVE' as const };
    }
    const players = await tx.player.findMany({
      where: { roomId },
      select: { id: true, displayName: true, turnOrder: true, position: true },
      orderBy: { turnOrder: 'asc' },
    });
    const current = players.find(
      (player) => player.turnOrder === room.currentTurnOrder,
    );
    if (!current || getTile(current.position).type !== TileType.TARGET_DRINK) {
      return { error: 'TARGET_SELECTION_NOT_ACTIVE' as const };
    }
    if (current.id !== playerId) {
      return { error: 'NOT_YOUR_TURN' as const };
    }
    return {
      current,
      others: players.filter((player) => player.id !== current.id),
      turnOrder: room.currentTurnOrder,
    };
  }

  // ROOM_CODE_LENGTH characters of ROOM_CODE_CHARS (no I, O, 1, 0), each picked with crypto.
  // Uniqueness is left to the DB (see create).
  private generateRoomCode() {
    return Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)],
    ).join('');
  }

  private getAvailableDisplayName(nickname: string, takenNames: string[]) {
    const taken = new Set(takenNames);
    if (!taken.has(nickname)) {
      return nickname;
    }
    let suffix = 1;
    while (taken.has(`${nickname} ${suffix}`)) {
      suffix++;
    }
    return `${nickname} ${suffix}`;
  }
}
