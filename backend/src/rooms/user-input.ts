import {
  applyDecorators,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  buildMessage,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

// Canonical forms of what players type. The DTO decorators below normalize first and then
// validate, so create and update endpoints all store the same text; the frontend checks the
// same limits only for a quicker message.

export const NICKNAME_MAX_LENGTH = 20;
export const CONTENT_MAX_LENGTH = 200;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_CHARS}]{${ROOM_CODE_LENGTH}}$`,
);

// Control characters (C0 incl. tab / line breaks, DEL, C1). Emoji joiners and other format
// characters are not in this class, so emoji sequences stay intact.
const CONTROL = /\p{Cc}/u;
const NO_CONTROL = /^\P{Cc}*$/u;
const NO_CONTROL_BUT_NEWLINE = /^(?:\n|\P{Cc})*$/u;

// One line: NFC, every run of whitespace becomes one space, trimmed. Text with a control
// character (line break, tab, NUL...) is left as it is so the validator rejects it instead
// of silently joining lines.
export function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }
  const text = value.normalize('NFC');
  return CONTROL.test(text) ? text : text.replace(/\s+/g, ' ').trim();
}

// Card text (questions, missions, penalties): NFC, CRLF / CR -> LF, tab -> space; within each
// line whitespace runs become one space and the line is trimmed; empty lines are dropped.
// Single line breaks stay because the lobby and the game show them (whitespace-pre-wrap).
// Other control characters are left for the validator to reject.
export function normalizeContent(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

// Length in code points, so an emoji counts as one character, not two UTF-16 units.
function MaxCodePoints(max: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'maxCodePoints',
      constraints: [max],
      validator: {
        validate: (value) =>
          typeof value === 'string' && Array.from(value).length <= max,
        defaultMessage: buildMessage(
          (each) =>
            `${each}$property must be at most $constraint1 characters long`,
          options,
        ),
      },
    },
    options,
  );
}

export const IsNickname = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizeNickname(value)),
    IsString(),
    Matches(NO_CONTROL, {
      message: 'nickname must not contain line breaks or control characters',
    }),
    IsNotEmpty(),
    MaxCodePoints(NICKNAME_MAX_LENGTH),
  );

export const IsContentText = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizeContent(value)),
    IsString(),
    Matches(NO_CONTROL_BUT_NEWLINE, {
      message: 'content must not contain control characters',
    }),
    IsNotEmpty(),
    MaxCodePoints(CONTENT_MAX_LENGTH),
  );

// Trimmed and upper-cased room code, or null when it cannot be one we generate.
export function normalizeRoomCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

// `@Param('code', RoomCodePipe)`: a malformed code is a 400 before any DB query; a well-formed
// code that does not exist stays a 404 from the service.
export class RoomCodePipe implements PipeTransform<unknown, string> {
  transform(value: unknown) {
    const code = normalizeRoomCode(value);
    if (!code) {
      throw new BadRequestException('Invalid room code');
    }
    return code;
  }
}
