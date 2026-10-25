import type { MissionType, PenaltyType } from '../generated/prisma/client.js';

// What every new room starts with, written as that room's own Question / Mission / Penalty rows
// when the room is created (and only then). Players edit or delete them like anything they add;
// a room's copy never changes these lists. Nothing here asks anyone to drink: the drink tiles
// stay the only drinking rule.
// Everything can be done with a voice and chat alone, so a virtual streamer (an avatar with no
// hand / body / face tracking) can play it as well as friends at a table: no body movement, no
// camera, no objects, and nothing personal to reveal (real name, face, photos, home, location,
// contacts, messages).

export const DEFAULT_QUESTIONS: readonly string[] = [
  '무인도에 여기 있는 사람 한 명만 데려간다면?',
  '지금까지 했던 가장 창피한 실수는?',
  '최근 가장 기억에 남는 재미있는 일은?',
  '지금 가장 여행 가고 싶은 곳은?',
  '해보고 싶은 방송/놀이 콘텐츠는?',
  '게임 속 직업 하나를 가질 수 있다면?',
  '하루 동안 다른 목소리를 가질 수 있다면?',
  '여기서 하루 동안 몸이 바뀌어 보고 싶은 사람은?',
  '내가 은근히 자신 있는 것은?',
  '요즘 가장 자주 듣는 노래는?',
  '다른 참가자와 함께 해보고 싶은 것은?',
  '여기서 가장 예능에 나가면 잘할 것 같은 사람은?',
  '갑자기 1억이 생기면 가장 먼저 할 일은?',
  '어린 시절 꿈은 무엇이었나?',
  '지금 당장 배우고 싶은 능력 하나는?',
  '여기 있는 사람 중 가장 오래 살아남을 것 같은 사람은?',
  '자신을 게임 캐릭터로 만든다면 어떤 역할?',
  '하루 동안 유명인이 될 수 있다면 누구?',
  '새로운 별명을 만든다면?',
  '올해 안에 꼭 해보고 싶은 것은?',
];

const normal = (content: string) => ({
  content,
  type: 'NORMAL' as const,
  durationSeconds: null,
});
const timed = (content: string, durationSeconds: number) => ({
  content,
  type: 'TIMED' as const,
  durationSeconds,
});

// TIMED missions take the seconds their text says.
export const DEFAULT_MISSIONS: readonly {
  content: string;
  type: MissionType;
  durationSeconds: number | null;
}[] = [
  normal('다른 참가자를 RPG 캐릭터처럼 소개하기'),
  normal('현재 상황을 뉴스 속보처럼 설명하기'),
  normal('다음 한 문장을 최종 보스처럼 말하기'),
  normal('자신을 게임 NPC처럼 자기소개하기'),
  normal('아무 물건 하나를 말로만 홈쇼핑처럼 판매하기'),
  normal('다른 참가자 한 명에게 새로운 별명 만들어주기'),
  normal('랜덤 단어 3개를 이용해 짧은 이야기 만들기'),
  normal('가상의 게임 필살기 이름 만들기'),
  normal('오늘 있었던 일을 영화 예고편처럼 설명하기'),
  normal('다른 참가자의 장점 3개 말하기'),
  normal('새로운 방송 콘텐츠 아이디어 하나 즉석에서 만들기'),
  normal('자신의 캐릭터 설정 하나 즉석에서 추가하기'),
  timed('20초 동안 뉴스 앵커처럼 말하기', 20),
  timed('15초 동안 웃지 않고 진지하게 말하기', 15),
  timed('20초 동안 게임 NPC처럼 말하기', 20),
  timed('15초 동안 최종 보스처럼 말하기', 15),
  timed('20초 동안 홈쇼핑 진행자 말투 유지하기', 20),
  timed('20초 동안 같은 단어를 반복하지 않고 계속 말하기', 20),
  timed('15초 동안 자신의 캐릭터 설정을 즉석에서 설명하기', 15),
  timed('20초 동안 모든 말을 영화 예고편 내레이션처럼 하기', 20),
];

// TIMED penalties run for their seconds alongside the game (see GameHistory); NORMAL ones are
// done on the spot.
export const DEFAULT_PENALTIES: readonly {
  content: string;
  type: PenaltyType;
  durationSeconds: number | null;
}[] = [
  timed('5분 동안 말 끝마다 "냥" 붙이기', 300),
  timed('3분 동안 모든 참가자에게 존댓말만 사용하기', 180),
  timed('3분 동안 자신을 3인칭으로 부르기', 180),
  timed('5분 동안 다른 참가자들이 정한 별명으로만 불리기', 300),
  timed('3분 동안 문장 끝마다 "인정?" 붙이기', 180),
  timed('3분 동안 뉴스 앵커 말투 유지하기', 180),
  timed('2분 동안 모든 대답을 "그건 말이죠..."로 시작하기', 120),
  timed('3분 동안 RPG NPC 말투 사용하기', 180),
  timed('5분 동안 참가자들이 정한 금지어 하나 사용하지 않기', 300),
  timed('3분 동안 모든 리액션을 과장되게 말로 표현하기', 180),
  normal('다른 참가자에게 즉석 칭찬 3개 하기'),
  normal('아무 동물 소리를 말로 표현하기'),
  normal('현재 상황을 뉴스 속보처럼 설명하기'),
  normal('다음 한 문장을 애니메이션 주인공처럼 말하기'),
  normal('10초 분량의 가짜 광고 멘트 만들기'),
];
