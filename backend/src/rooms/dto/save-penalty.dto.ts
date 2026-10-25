import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { IsContentText } from '../user-input.js';

export class SavePenaltyDto {
  @IsContentText()
  content: string;

  // Optional: a body with only content is a NORMAL penalty.
  @IsOptional()
  @IsIn(['NORMAL', 'TIMED'])
  type?: 'NORMAL' | 'TIMED';

  // Seconds; only required (and stored) for TIMED penalties. Same 32-bit Int limit as missions.
  @ValidateIf((dto: SavePenaltyDto) => dto.type === 'TIMED')
  @IsInt()
  @Min(1)
  @Max(2147483647)
  durationSeconds?: number;
}
