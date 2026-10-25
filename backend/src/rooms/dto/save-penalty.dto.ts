import { IsContentText } from '../user-input.js';

export class SavePenaltyDto {
  @IsContentText()
  content: string;
}
