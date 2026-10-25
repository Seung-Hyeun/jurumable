import type { MissionType, PenaltyType } from '../generated/prisma/client.js';

// What every new room starts with, written as that room's own Question / Mission / Penalty rows
// when the room is created (and only then). Players edit or delete them like anything they add;
// a room's copy never changes these lists. Nothing here asks anyone to drink: the drink tiles
// stay the only drinking rule.

export const DEFAULT_QUESTIONS: readonly string[] = [
  '오늘 여기서 첫인상이 가장 달라진 사람은?',
  '지금까지 했던 가장 창피한 실수는?',
  '무인도에 여기 있는 사람 한 명만 데려간다면?',
  '여기서 가장 연락이 빠를 것 같은 사람은?',
  '최근 가장 많이 웃었던 일은?',
  '지금 가장 여행 가고 싶은 곳은?',
  '다시 태어나면 해보고 싶은 직업은?',
  '여기서 하루 동안 몸이 바뀌어 보고 싶은 사람은?',
  '내가 은근히 자신 있는 것은?',
  '요즘 가장 자주 듣는 노래는?',
  '내 인생에서 가장 기억에 남는 여행은?',
  '여기서 가장 예능에 나가면 잘할 것 같은 사람은?',
  '갑자기 1억이 생기면 가장 먼저 할 일은?',
  '어린 시절 꿈은 무엇이었나?',
  '지금 당장 배우고 싶은 능력 하나는?',
  '여기 있는 사람 중 가장 오래 살아남을 것 같은 사람은?',
  '최근 가장 후회했던 소비는?',
  '하루 동안 유명인이 될 수 있다면 누구?',
  '나만의 이상한 습관 하나는?',
  '올해 안에 꼭 해보고 싶은 것은?',
];

// TIMED missions take the seconds their text says.
export const DEFAULT_MISSIONS: readonly {
  content: string;
  type: MissionType;
  durationSeconds: number | null;
}[] = [
  {
    content: '오른쪽 사람을 10초 동안 칭찬하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  { content: '왼쪽 사람 성대모사하기', type: 'NORMAL', durationSeconds: null },
  {
    content: '가장 자신 있는 표정 3종 세트 보여주기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '광고 모델처럼 물 한 잔 소개하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '아무 노래 한 소절 감정 과하게 넣어서 부르기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '여기 있는 사람 한 명의 첫인상 말하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '오늘 있었던 일을 뉴스 앵커처럼 설명하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '아무 물건 하나를 홈쇼핑처럼 판매하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '동물 하나를 몸으로 표현하고 맞히게 하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '자신을 세 단어로 소개하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '최근 찍은 사진 하나의 상황 설명하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '영화 예고편 목소리로 자기소개하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  { content: '10초 동안 웃지 않기', type: 'TIMED', durationSeconds: 10 },
  { content: '15초 동안 한 발로 버티기', type: 'TIMED', durationSeconds: 15 },
  {
    content: '15초 동안 눈을 깜빡이지 않고 버티기',
    type: 'TIMED',
    durationSeconds: 15,
  },
  {
    content: '20초 동안 아무 말 없이 춤추기',
    type: 'TIMED',
    durationSeconds: 20,
  },
  {
    content: '15초 동안 손을 사용하지 않고 포즈 유지하기',
    type: 'TIMED',
    durationSeconds: 15,
  },
  {
    content: '20초 동안 같은 단어를 반복하지 않고 계속 말하기',
    type: 'TIMED',
    durationSeconds: 20,
  },
  {
    content: '15초 동안 모델 워킹 보여주기',
    type: 'TIMED',
    durationSeconds: 15,
  },
  {
    content: '20초 동안 다른 사람들이 웃겨도 웃지 않기',
    type: 'TIMED',
    durationSeconds: 20,
  },
];

// TIMED penalties run for their seconds alongside the game (see GameHistory); NORMAL ones are
// done on the spot.
export const DEFAULT_PENALTIES: readonly {
  content: string;
  type: PenaltyType;
  durationSeconds: number | null;
}[] = [
  {
    content: '5분 동안 말 끝마다 "냥" 붙이기',
    type: 'TIMED',
    durationSeconds: 300,
  },
  {
    content: '3분 동안 모든 사람에게 존댓말만 사용하기',
    type: 'TIMED',
    durationSeconds: 180,
  },
  {
    content: '3분 동안 자신을 3인칭으로 부르기',
    type: 'TIMED',
    durationSeconds: 180,
  },
  {
    content: '5분 동안 다른 사람들이 정한 별명으로만 불리기',
    type: 'TIMED',
    durationSeconds: 300,
  },
  {
    content: '2분 동안 질문을 받을 때마다 "그건 비밀입니다"로 시작하기',
    type: 'TIMED',
    durationSeconds: 120,
  },
  {
    content: '3분 동안 모든 대답을 뉴스 앵커 톤으로 하기',
    type: 'TIMED',
    durationSeconds: 180,
  },
  {
    content: '2분 동안 말할 때마다 손동작 하나씩 추가하기',
    type: 'TIMED',
    durationSeconds: 120,
  },
  {
    content: '3분 동안 웃을 때마다 박수 한 번 치기',
    type: 'TIMED',
    durationSeconds: 180,
  },
  {
    content: '5분 동안 특정 금지어 하나 정해서 사용하지 않기',
    type: 'TIMED',
    durationSeconds: 300,
  },
  {
    content: '3분 동안 문장 끝마다 "인정?" 붙이기',
    type: 'TIMED',
    durationSeconds: 180,
  },
  {
    content: '옆 사람에게 즉석 칭찬 3개 하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  { content: '아무 동물 성대모사 하기', type: 'NORMAL', durationSeconds: null },
  {
    content: '카메라를 향해 엔딩 포즈 3종 보여주기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '10초 동안 광고 모델 연기하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
  {
    content: '현재 상황을 뉴스 속보처럼 설명하기',
    type: 'NORMAL',
    durationSeconds: null,
  },
];
