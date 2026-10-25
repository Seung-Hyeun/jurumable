import { IsNickname } from '../user-input.js';

export class JoinRoomDto {
  @IsNickname()
  nickname: string;
}
