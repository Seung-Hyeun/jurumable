import { IsContentText } from '../user-input.js';

export class SaveQuestionDto {
  @IsContentText()
  content: string;
}
