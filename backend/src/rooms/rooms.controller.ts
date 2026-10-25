import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { RateLimit } from '../rate-limit.guard.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { ReconnectRoomDto } from './dto/reconnect-room.dto.js';
import { SaveMissionDto } from './dto/save-mission.dto.js';
import { SavePenaltyDto } from './dto/save-penalty.dto.js';
import { SaveQuestionDto } from './dto/save-question.dto.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsService } from './rooms.service.js';
import { RoomCodePipe } from './user-input.js';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  @Post()
  @RateLimit('createRoom')
  create(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.create(createRoomDto);
  }

  @Post(':code/join')
  @RateLimit('joinRoom')
  join(
    @Param('code', RoomCodePipe) code: string,
    @Body() joinRoomDto: JoinRoomDto,
  ) {
    return this.roomsService.join(code, joinRoomDto);
  }

  @Post(':code/reconnect')
  @RateLimit('reconnect')
  @HttpCode(HttpStatus.OK)
  reconnect(
    @Param('code', RoomCodePipe) code: string,
    @Body() reconnectRoomDto: ReconnectRoomDto,
  ) {
    return this.roomsService.reconnect(code, reconnectRoomDto);
  }

  @Get(':code/questions')
  async listQuestions(
    @Param('code', RoomCodePipe) code: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    return { questions: await this.roomsService.listQuestions(room.id) };
  }

  @Post(':code/questions')
  @RateLimit('contentChange')
  async createQuestion(
    @Param('code', RoomCodePipe) code: string,
    @Body() saveQuestionDto: SaveQuestionDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const question = await this.roomsService.createQuestion(
      room.id,
      saveQuestionDto,
    );
    await this.broadcastQuestions(room);
    return { question };
  }

  @Patch(':code/questions/:questionId')
  @RateLimit('contentChange')
  async updateQuestion(
    @Param('code', RoomCodePipe) code: string,
    @Param('questionId') questionId: string,
    @Body() saveQuestionDto: SaveQuestionDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const question = await this.roomsService.updateQuestion(
      room.id,
      questionId,
      saveQuestionDto,
    );
    await this.broadcastQuestions(room);
    return { question };
  }

  @Delete(':code/questions/:questionId')
  @RateLimit('contentChange')
  async deleteQuestion(
    @Param('code', RoomCodePipe) code: string,
    @Param('questionId') questionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    await this.roomsService.deleteQuestion(room.id, questionId);
    await this.broadcastQuestions(room);
    return { id: questionId };
  }

  @Get(':code/missions')
  async listMissions(
    @Param('code', RoomCodePipe) code: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    return { missions: await this.roomsService.listMissions(room.id) };
  }

  @Post(':code/missions')
  @RateLimit('contentChange')
  async createMission(
    @Param('code', RoomCodePipe) code: string,
    @Body() saveMissionDto: SaveMissionDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const mission = await this.roomsService.createMission(
      room.id,
      saveMissionDto,
    );
    await this.broadcastMissions(room);
    return { mission };
  }

  @Patch(':code/missions/:missionId')
  @RateLimit('contentChange')
  async updateMission(
    @Param('code', RoomCodePipe) code: string,
    @Param('missionId') missionId: string,
    @Body() saveMissionDto: SaveMissionDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const mission = await this.roomsService.updateMission(
      room.id,
      missionId,
      saveMissionDto,
    );
    await this.broadcastMissions(room);
    return { mission };
  }

  @Delete(':code/missions/:missionId')
  @RateLimit('contentChange')
  async deleteMission(
    @Param('code', RoomCodePipe) code: string,
    @Param('missionId') missionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    await this.roomsService.deleteMission(room.id, missionId);
    await this.broadcastMissions(room);
    return { id: missionId };
  }

  @Get(':code/penalties')
  async listPenalties(
    @Param('code', RoomCodePipe) code: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    return { penalties: await this.roomsService.listPenalties(room.id) };
  }

  @Post(':code/penalties')
  @RateLimit('contentChange')
  async createPenalty(
    @Param('code', RoomCodePipe) code: string,
    @Body() savePenaltyDto: SavePenaltyDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const penalty = await this.roomsService.createPenalty(
      room.id,
      savePenaltyDto,
    );
    await this.broadcastPenalties(room);
    return { penalty };
  }

  @Patch(':code/penalties/:penaltyId')
  @RateLimit('contentChange')
  async updatePenalty(
    @Param('code', RoomCodePipe) code: string,
    @Param('penaltyId') penaltyId: string,
    @Body() savePenaltyDto: SavePenaltyDto,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    const penalty = await this.roomsService.updatePenalty(
      room.id,
      penaltyId,
      savePenaltyDto,
    );
    await this.broadcastPenalties(room);
    return { penalty };
  }

  @Delete(':code/penalties/:penaltyId')
  @RateLimit('contentChange')
  async deletePenalty(
    @Param('code', RoomCodePipe) code: string,
    @Param('penaltyId') penaltyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const { room } = await this.authorizeMember(code, authorization);
    await this.roomsService.deletePenalty(room.id, penaltyId);
    await this.broadcastPenalties(room);
    return { id: penaltyId };
  }

  // Any player of the room may edit questions; the reconnect token proves membership.
  private async authorizeMember(code: string, authorization?: string) {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid reconnect token');
    }
    return this.roomsService.reconnect(code, { reconnectToken: token });
  }

  private async broadcastQuestions(room: { id: string; code: string }) {
    const questions = await this.roomsService.listQuestions(room.id);
    this.roomsGateway.broadcastQuestions(room.code, questions);
  }

  private async broadcastMissions(room: { id: string; code: string }) {
    const missions = await this.roomsService.listMissions(room.id);
    this.roomsGateway.broadcastMissions(room.code, missions);
  }

  private async broadcastPenalties(room: { id: string; code: string }) {
    const penalties = await this.roomsService.listPenalties(room.id);
    this.roomsGateway.broadcastPenalties(room.code, penalties);
  }
}
