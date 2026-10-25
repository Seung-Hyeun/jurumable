// Content form rules (same limits as the backend DTOs) and mission duration formatting.
export const CONTENT_MAX_LENGTH = 200;

export function contentError(content: string) {
  const value = content.trim();
  if (!value) {
    return "내용을 입력해주세요.";
  }
  // Code points, like the backend: an emoji counts as one character.
  if (Array.from(value).length > CONTENT_MAX_LENGTH) {
    return `${CONTENT_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  return null;
}

// TIMED missions and penalties need a whole number of seconds, at least 1 (no upper limit in
// the backend). label names the field: 제한 시간 for a mission, 지속 시간 for a penalty.
export function durationError(value: string, label = "제한 시간") {
  if (!value.trim()) {
    return `${label}(초)을 입력해주세요.`;
  }
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 1) {
    return `${label}은 1 이상의 정수(초)로 입력해주세요.`;
  }
  return null;
}

// 45 -> 45초, 60 -> 1분, 90 -> 1분 30초, 3600 -> 1시간, 3660 -> 1시간 1분
export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    hours ? `${hours}시간` : "",
    minutes ? `${minutes}분` : "",
    seconds ? `${seconds}초` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "0초";
}
