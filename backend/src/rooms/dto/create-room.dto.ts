import { IsInt, Max, Min } from 'class-validator';
import { IsNickname } from '../user-input.js';

export class CreateRoomDto {
  @IsNickname()
  nickname: string;

  @IsInt()
  @Min(2)
  @Max(6)
  maxPlayers: number;
}
