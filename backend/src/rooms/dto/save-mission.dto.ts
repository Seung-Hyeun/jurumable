import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { IsContentText } from '../user-input.js';

export class SaveMissionDto {
  @IsContentText()
  content: string;

  @IsIn(['NORMAL', 'TIMED'])
  type: 'NORMAL' | 'TIMED';

  // Seconds; only required (and stored) for TIMED missions. The column is a 32-bit Int, so a
  // larger value is a 400 here instead of a failed insert (500).
  @ValidateIf((dto: SaveMissionDto) => dto.type === 'TIMED')
  @IsInt()
  @Min(1)
  @Max(2147483647)
  durationSeconds?: number;
}
