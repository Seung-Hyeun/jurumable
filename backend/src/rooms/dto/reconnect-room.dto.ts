import { IsNotEmpty, IsString } from 'class-validator';

export class ReconnectRoomDto {
  @IsString()
  @IsNotEmpty()
  reconnectToken: string;
}
