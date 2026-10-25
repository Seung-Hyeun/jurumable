# 주루마블 (jurumable)

친구들이 각자의 기기에서 같은 방에 접속해 실시간으로 함께 진행하는 2~6인용 멀티플레이 술자리 보드게임입니다.

## Screenshots

| 메인 화면 | 실시간 대기방과 콘텐츠 관리 |
| --- | --- |
| ![메인 화면](docs/images/home.png) | ![대기방](docs/images/lobby.png) |
| **30칸 게임 보드** | **시간제 미션 (서버 기준 타이머)** |
| ![게임 보드](docs/images/game-board.png) | ![시간제 미션](docs/images/timed-mission.png) |
| **게임 종료 투표 (투표 중 일시정지)** | **다크 모드** |
| ![게임 종료 투표](docs/images/end-vote.png) | ![다크 모드](docs/images/dark-mode.png) |

## 주요 기능

- **방 만들기 / 참여하기**: 6자리 방 코드와 닉네임으로 참여합니다. 방장이 최대 인원(2~6명)을 정하고, 같은 닉네임은 `민수`, `민수 1`처럼 자동으로 구분됩니다.
- **콘텐츠 관리**: 대기실에서 참가자 누구나 Q&A 질문, 미션, 벌칙을 등록, 수정, 삭제할 수 있고 모든 화면에 바로 반영됩니다.
- **서버 주도 진행**: 차례 순서, 주사위, 칸 효과, 무작위 선택, 투표 결과를 모두 서버가 정합니다.
- **30칸 보드와 칸 이벤트**: Q&A(직접 질문 받기 / 랜덤 질문 뽑기 / 등록된 질문 고르기), 지목 한 잔, 미션(일반 / 시간제), 미션 O/X 판정 투표, 벌칙 룰렛(즉시형 / 시간형), 개인 적립잔.
- **주사위 연출**: 굴린 주사위 숫자를 보여 준 뒤 말이 한 칸씩 이동하고, 도착한 다음에 칸 이벤트가 나옵니다. 모든 참가자 화면에 같게 보이며, 설정에서 애니메이션을 끄면 바로 이동합니다.
- **게임 기록 / 미션·벌칙 기록**: 게임 기록에는 주사위와 이동만, 미션/벌칙 카드에는 누가 어떤 미션(성공 / 실패 / 무효)과 벌칙을 받았는지 최근 20개를 따로 보여 줍니다. 시간형 미션·벌칙은 현재 진행 중 영역에서 서버 시각 기준으로 남은 시간을 세고, 시간형 벌칙은 게임을 멈추지 않습니다.
- **서버 시간 기준 타이머**: 시간제 미션은 서버가 저장한 시작 시각을 기준으로 모든 기기에 같은 남은 시간을 보여 줍니다.
- **접속 상태와 재접속**: 참가자의 온라인 / 오프라인을 실시간으로 표시하고, 새로고침하거나 연결이 끊겨도 같은 플레이어로 돌아옵니다.
- **방장 기능**: 게임 시작, 대기실에서 오프라인 참가자 강퇴, 게임 종료 투표 요청. 방장이 5분 넘게 돌아오지 않으면 접속 중인 참가자에게 방장이 자동으로 넘어갑니다.
- **게임 종료 투표**: 투표하는 동안 게임이 일시정지되고, 과반이 찬성하면 최종 위치와 적립잔을 보여 주며 끝납니다.
- **개인 설정**: 라이트 / 다크 / 시스템 테마, 애니메이션 끄기. 설정은 브라우저에 저장됩니다.

## 게임 흐름

1. 방장이 방을 만들고 방 코드를 공유합니다.
2. 참가자들이 각자의 기기에서 방 코드와 닉네임으로 참여합니다.
3. 대기실에서 Q&A, 미션, 벌칙을 등록합니다.
4. 2명 이상이 모두 접속해 있으면 방장이 게임을 시작합니다.
5. 서버가 차례 순서를 무작위로 정합니다.
6. 자기 차례에 주사위를 굴리면 서버가 1~6 중 값을 정하고 말을 옮깁니다.
7. 도착한 칸의 효과를 처리합니다. 자동 칸은 바로 처리되고, Q&A, 미션, 벌칙, 지목 칸은 해당 플레이어가 진행합니다.
8. 처리가 끝나면 다음 차례로 넘어갑니다.
9. 방장이 종료 투표를 요청하고, 과반이 찬성하면 게임이 끝납니다.

## 보드 구성

30칸이 한 바퀴로 이어진 보드입니다. 마지막 칸 다음은 다시 출발 칸입니다.

| 칸 | 개수 | 효과 |
| --- | --- | --- |
| 출발 | 1 | 효과 없음 |
| 쉬어가기 | 4 | 효과 없음 |
| 한 잔 / 두 잔 | 3 / 1 | 도착한 사람이 한 잔 / 두 잔 |
| +1 적립 | 3 | 내 적립잔 +1 |
| 적립잔 마시기 | 1 | 적립된 만큼 마시고 적립잔을 0으로 |
| Q&A | 5 | 참가자나 시청자가 말로 직접 질문(직접 질문 받기)하거나, 등록된 질문 중 랜덤으로 뽑거나 골라서 답하기 |
| 지목 한 잔 | 3 | 접속 중인 다른 플레이어 한 명을 지목하고, 지목된 사람이 한 잔 |
| 미션 | 7 | 등록된 미션 중 하나를 수행하고, 다른 참가자들이 O/X로 판정. 실패하면 벌칙 룰렛 |
| 벌칙 | 2 | 벌칙 룰렛. 시간형 벌칙은 정해진 시간 동안 게임과 함께 진행 |

등록된 미션이나 벌칙이 없거나 지목할 수 있는 사람이 없으면 그 칸은 건너뛰고 다음 차례로 넘어갑니다. Q&A 칸은 등록된 질문이 없어도 직접 질문으로 진행할 수 있습니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, Socket.IO Client |
| Backend | NestJS, Socket.IO, Prisma (PostgreSQL driver adapter), class-validator |
| Database | PostgreSQL |
| 배포 구성 | Vercel (frontend), Railway (backend + PostgreSQL) |

## 아키텍처

```mermaid
flowchart LR
  FE["Next.js frontend<br/>(참가자별 브라우저)"] -->|REST| BE["NestJS backend"]
  FE <-->|Socket.IO| BE
  BE -->|Prisma| DB[("PostgreSQL")]
```

- **REST**는 방 생성, 참여, 재접속 확인과 콘텐츠(Q&A, 미션, 벌칙) CRUD를 맡습니다.
- **Socket.IO**는 방 상태 동기화와 게임 진행(주사위, 칸 이벤트, 투표)을 맡습니다.
- 게임 상태는 PostgreSQL에 저장하고, 접속 상태(presence)와 미션 타이머 예약만 backend 메모리에 둡니다.

## 설계

### 서버 주도 게임 상태

게임 결과에 영향을 주는 값은 모두 backend가 정합니다. 차례 순서, 주사위 값, 이동, 칸 효과, 미션·벌칙의 무작위 선택과 Q&A 랜덤 결정, 시간형 벌칙의 시작·종료 시각, 지목 대상 검증, 투표 집계, 다음 차례가 여기에 속합니다. 무작위 값은 Node.js `crypto.randomInt`로 만듭니다. frontend는 "굴리기", "투표", "지목" 같은 요청만 보내고, 화면은 서버가 보낸 상태로만 그립니다. 차례가 아니거나 진행 단계가 맞지 않는 요청은 서버가 거절합니다.

### 실시간 동기화

- 방마다 Socket.IO room을 따로 써서 다른 방의 이벤트가 섞이지 않습니다.
- 서버는 DB에서 방 전체 상태(플레이어, 위치, 차례, 진행 중 이벤트, 투표 진행 수)를 만들어 `room:state`로 보내고, 화면은 이 상태를 기준으로 그립니다.
- 주사위 결과, 칸 효과, 투표 결과처럼 연출이 필요한 순간은 별도 이벤트로 보냅니다.
- 소켓이 다시 연결될 때마다 최신 상태를 다시 받으므로, 연결이 끊긴 동안 놓친 이벤트가 있어도 화면이 복구됩니다.

### 접속 상태 (Presence)

backend는 `Map<playerId, Set<socketId>>`로 플레이어별 소켓을 관리합니다. 한 플레이어가 탭을 여러 개 열어도 되고, 마지막 소켓이 끊길 때만 오프라인이 됩니다. 접속 상태는 DB에 저장하지 않으며, 오프라인이 된 플레이어의 차례를 자동으로 건너뛰지 않습니다.

### 재접속 (reconnect token)

계정이 없으므로 닉네임이 아니라 `Player.id`와 reconnect token으로 플레이어를 구분합니다.

- 방을 만들거나 참여할 때 서버가 플레이어마다 32바이트 무작위 token(`crypto.randomBytes`)을 발급하고, 응답으로 한 번만 전달합니다.
- DB에는 token의 SHA-256 hash만 unique 값으로 저장하고, 요청이 오면 받은 token을 hash해서 플레이어를 찾습니다.
- 브라우저는 token을 localStorage에 보관합니다. REST에는 `Authorization: Bearer` 헤더로, Socket.IO에는 handshake `auth`로만 보내고 URL이나 query에는 넣지 않습니다.
- 재접속하면 같은 Player.id, 위치, 차례 순서, 적립잔, 진행 중인 이벤트를 그대로 이어갑니다. 서버 로그에는 token을 남기지 않습니다.

### 동시 요청 처리

상태를 바꾸는 요청은 하나의 DB transaction 안에서 Room 행을 `SELECT … FOR UPDATE`로 잠근 뒤 처리합니다. 처리하기 전에 차례, 진행 단계, 일시정지 여부를 다시 확인하므로, 같은 요청이 동시에 들어와도 하나만 반영되고 나머지는 거절됩니다. 투표는 (투표 회차, 투표자) unique 제약으로 1인 1표를 보장합니다.

### 시간제 미션 타이머

- 서버가 미션 시작 시각(`startedAt`)을 DB에 저장하고, 종료 시각(`endsAt = startedAt + 제한 시간`)을 기준으로 삼습니다.
- client는 서버 시각과의 차이를 보정해 `endsAt`까지 남은 시간만 표시합니다. 그래서 새로고침이나 background 탭에서도 남은 시간이 같습니다.
- 실제 만료는 서버 timer가 DB를 다시 확인한 뒤 처리합니다. 서버가 다시 시작되면 재접속할 때 남은 시간으로 timer를 다시 예약합니다.
- 종료 투표로 게임이 일시정지되면 timer를 멈춥니다. 투표가 부결되면 멈춘 시간만큼 시작 시각을 뒤로 밀어 남은 시간 그대로 재개합니다.

### 진행 중 콘텐츠 snapshot

콘텐츠 API는 방 상태와 관계없이 편집을 허용합니다. 그래서 칸에 도착한 순간 선택된 질문과 미션의 내용, 유형, 제한 시간을 Room의 active snapshot 필드에 복사하고, 진행·재접속·투표는 snapshot만 사용합니다. 원본이 수정되거나 삭제돼도 진행 중인 이벤트는 바뀌지 않습니다.

### 투표 규칙

투표권자는 접속 여부와 관계없이 고정됩니다. 진행 중에는 "n / 전체 투표 완료"만 공개하고, 전원이 투표한 뒤 결과를 알립니다.

- **미션 O/X**: 수행자를 뺀 전원이 투표합니다. O가 많으면 성공, X가 많으면 실패(벌칙 룰렛), 같으면 무효(벌칙 없음)입니다. 미션 투표 중에 투표자가 강퇴되면 남은 인원으로 다시 집계합니다.
- **게임 종료 투표**: 방장을 포함한 전원이 투표하고(방장 자동 찬성 없음), YES가 전체의 과반(strict majority)일 때만 끝납니다. 동점이면 게임을 계속합니다.

### 방장 자동 이전

- 방장의 마지막 소켓이 끊기면 Room마다 5분짜리 timer를 하나 겁니다. 그 안에 방장이 다시 접속하면 timer를 취소하고 방장을 그대로 유지합니다.
- timer가 끝나면 서버가 transaction 안에서 다시 확인합니다(방이 있는지, 종료되지 않았는지, 방장이 아직 오프라인인지). 그다음 접속 중인 참가자 중 한 명에게 방장을 넘깁니다.
- 새 방장 순서: 게임 중에는 가장 낮은 turnOrder, 대기실에서는 먼저 참여한 순서.
- 바뀌는 것은 `isHost`뿐입니다. 차례, 진행 중 이벤트, 투표, 미션 timer는 그대로입니다.
- 원래 방장이 나중에 돌아와도 방장을 되찾지 않습니다.
- 접속 중인 참가자가 없으면 넘기지 않고, 종료된 방은 대상이 아닙니다.
- 변경은 `room:state`와 `room:host-changed`로 모든 화면에 바로 반영됩니다.

### 입력 정규화와 검증

사용자가 입력한 문자열은 backend DTO에서 정규화한 뒤 검증합니다. 정규화된 값만 저장하고, frontend 검사는 빠른 안내용입니다.

- **닉네임**
  - NFC 정규화, 연속 공백을 한 칸으로 줄이고 앞뒤를 자릅니다.
  - 줄바꿈, 탭, 제어문자가 있으면 400입니다.
  - 1~20자입니다.
- **Q&A / 미션 / 벌칙 내용**
  - NFC 정규화, CRLF는 LF로, 탭은 공백으로 바꿉니다.
  - 각 줄의 연속 공백을 한 칸으로 줄이고 빈 줄은 지웁니다. 한 줄 바꿈은 화면에 그대로 보입니다.
  - 그 밖의 제어문자가 있으면 400입니다.
  - 1~200자입니다. 수정(PATCH)에도 같은 규칙이 적용됩니다.
- **길이 기준**: code point라서 이모지 1개를 1자로 셉니다.
- **방 코드**
  - 앞뒤를 자르고 대문자로 바꾼 뒤 `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`로 검사합니다. 형식이 틀리면 DB를 조회하기 전에 400, 형식은 맞지만 없는 방이면 404입니다.
  - Socket.IO 연결 인증도 같은 규칙을 씁니다.
- 등록되지 않은 필드는 `ValidationPipe`의 `whitelist`가 버립니다.
- 화면은 React의 기본 escape로 글자만 그립니다(사용자 콘텐츠에 `dangerouslySetInnerHTML`을 쓰지 않음).

### 요청 제한 (Rate Limit)

반복 호출을 막기 위해 일부 REST API에 클라이언트 IP 기준 1분 한도를 둡니다. 넘으면 `429`(`code: RATE_LIMITED`, `Retry-After` 헤더)로 응답합니다.

| 대상 | 한도 (IP당 1분) |
| --- | --- |
| `POST /rooms` (방 만들기) | 5회 |
| `POST /rooms/:code/join` | 20회 |
| `POST /rooms/:code/reconnect` | 30회 |
| Q&A / 미션 / 벌칙 추가·수정·삭제 | 합쳐서 60회 |

- 실패한 요청(잘못된 방 코드, token, 입력값)도 셉니다.
- GET 요청, `/health`, CORS preflight, Socket.IO 이벤트는 세지 않습니다. 게임 이벤트는 기존 서버 검증(차례, 단계, transaction)으로 막습니다.
- IP는 Express `trust proxy` = 1(앞단 proxy 한 단계만 신뢰)로 계산한 `req.ip`를 씁니다.
- 카운터는 서버 메모리에 있어서 재시작하면 초기화되고, 인스턴스마다 따로 셉니다.

### 방 자동 정리

오래 쓰지 않은 방은 backend가 자동으로 삭제합니다(서버 시작 1분 뒤, 이후 1시간마다).

- 기준은 Room의 `lastActivityAt`입니다. 참여, 재접속, 콘텐츠 API, 게임 진행, 투표, 강퇴 때 갱신됩니다.
- 상태별 보관 시간: 대기 중 6시간, 진행 중 24시간, 종료 후 2시간.
- 지금 접속 중인 플레이어가 있는 방은 시간이 지났어도 삭제하지 않습니다.
- 삭제할 때는 상태와 `lastActivityAt` 조건을 다시 걸어서, 직전에 다시 사용된 방은 건너뜁니다.
- 플레이어, 콘텐츠, 투표는 DB cascade로 함께 지워지고, 그 방의 재접속 token은 더 이상 쓸 수 없습니다.

## 프로젝트 구조

```text
frontend/
  app/
    _components/        공용 UI (page shell, badge, 설정 동기화)
    create-room/        방 만들기
    join-room/          방 참여하기
    settings/           개인 설정
    room/[code]/        대기실, 콘텐츠 관리, useRoom (REST 재접속 + Socket.IO)
      game/             게임 화면, 보드, Q&A·미션·벌칙·지목·종료 투표 UI
  lib/                  REST client, session, settings, 보드 정의
backend/
  src/
    main.ts             CORS, ValidationPipe, PORT
    app.controller.ts   GET /, GET /health
    prisma.service.ts   Prisma Client (pg adapter)
    rooms/              REST controller, Socket.IO gateway, 게임 service, 보드, DTO, reconnect token
  prisma/
    schema.prisma
    migrations/
  prisma7.config.ts     Prisma CLI 설정 (schema, migrations, DATABASE_URL)
```

## 환경 변수

실제 값은 Git에 올리지 않습니다. 예시 파일 `frontend/.env.example`과 `backend/.env.example`을 복사해서 사용합니다.

| 위치 | 이름 | 역할 |
| --- | --- | --- |
| frontend (`.env.local`) | `NEXT_PUBLIC_API_BASE_URL` | backend 공개 URL입니다. REST와 Socket.IO가 같이 쓰고, 끝에 `/`를 붙이지 않습니다. build할 때 브라우저 bundle에 들어가므로 secret을 넣으면 안 되고, 값을 바꾸면 다시 build해야 합니다. |
| backend (`.env`) | `DATABASE_URL` | PostgreSQL 연결 문자열입니다. Prisma CLI와 앱이 함께 쓰며, secret입니다. |
| backend (`.env`) | `FRONTEND_ORIGIN` | REST와 Socket.IO CORS가 허용하는 단 하나의 frontend origin입니다(끝에 `/` 없이). 기본값은 `http://localhost:3000`입니다. |
| backend (`.env`) | `PORT` | HTTP 포트입니다. 기본값은 `3001`이고, 호스팅 환경이 주입하는 값을 그대로 씁니다. |

```bash
# 예시 (placeholder)
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
FRONTEND_ORIGIN=https://your-frontend.example.com
PORT=3001
```

## 로컬 실행

필요한 것:

- Node.js 24 (24.15 이상) 또는 22 (22.22.3 이상). backend 빌드 도구(Nest CLI)가 이 버전을 요구합니다.
- npm
- 비어 있는 PostgreSQL 데이터베이스

```bash
# 1) backend  →  http://localhost:3001
cd backend
npm install
cp .env.example .env        # DATABASE_URL을 로컬 DB로 채웁니다
npx prisma generate         # Prisma Client 생성 (src/generated/prisma)
npm run prisma:deploy       # 저장소의 migration을 DB에 적용 (prisma migrate deploy)
npm run start:dev

# 2) frontend  →  http://localhost:3000  (새 터미널)
cd frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
npm run dev
```

- 혼자 테스트할 때는 브라우저를 두 개 쓰거나 시크릿 창을 함께 쓰세요. 플레이어 session이 브라우저의 localStorage에 저장되기 때문입니다.
- schema를 바꿀 때만 로컬 DB에서 `npx prisma migrate dev --name <이름>`으로 새 migration을 만듭니다. production DB에는 `migrate dev`, `db push`, `migrate reset`을 쓰지 않습니다.
- production build는 다음 명령을 씁니다.
  - backend: `npm run build`(= `prisma generate` + `nest build`) → `npm run start:prod`
  - frontend: `npm run build` → `npm run start`

## 배포 구성

| 대상 | 플랫폼 | 설정 |
| --- | --- | --- |
| Frontend | Vercel | Root Directory `frontend`, Next.js 기본 build, 환경 변수 `NEXT_PUBLIC_API_BASE_URL` |
| Backend | Railway | Root Directory `/backend`, Build `npm run build`, Pre-deploy `npm run prisma:deploy`, Start `npm run start:prod`, Healthcheck `/health` |
| Database | Railway PostgreSQL | private network, backend `DATABASE_URL`에서 참조 |

- production migration은 배포 직전(Pre-deploy) 단계의 `prisma migrate deploy`로만 적용합니다.
- backend의 `FRONTEND_ORIGIN`에는 frontend production origin을 넣습니다.

## 알려진 제한 사항

현재 버전에서 알려진 제한 사항입니다.

- **계정이 없습니다.** 브라우저의 localStorage에 있는 token이 신원이라, 브라우저 데이터를 지우면 그 방으로 돌아갈 수 없습니다.
- **방장 이전 timer는 서버 메모리에 있습니다.** 서버가 다시 시작되면, 다른 참가자가 다시 접속한 시점부터 5분을 새로 셉니다.
- **오프라인 참가자 처리가 대기실 중심입니다.**
  - 강퇴 UI는 대기실에만 있습니다.
  - 게임 중에는 오프라인 플레이어를 자동으로 건너뛰지 않습니다.
  - 그래서 그 사람의 차례나 투표는 다시 접속할 때까지 기다립니다. 종료 투표도 마찬가지입니다.
- **새로고침하면 내 투표 여부가 화면에 표시되지 않습니다.** 다시 투표하면 서버가 거절합니다.
- **관전자 모드가 없습니다.**
- **BGM / 효과음 설정은 저장만 됩니다.** 실제 음원은 아직 연결하지 않았습니다.
- **CORS origin이 하나뿐입니다.** 그래서 Vercel Preview처럼 origin이 다른 배포에서는 API가 막힙니다.
- **단일 서버 인스턴스를 전제로 합니다.** presence(방 자동 정리와 방장 이전의 접속 확인 포함), 미션 timer, 방장 이전 timer, 요청 제한 카운터가 서버 메모리에 있어, 여러 인스턴스로 늘리려면 Socket.IO adapter, presence 저장소, timer 처리를 바꿔야 합니다.
- **저장소에 자동화 테스트가 거의 없습니다.** 지금은 Nest 기본 테스트만 있습니다.

## 향후 개선

- 게임 중 오프라인 참가자 처리(강퇴 UI 또는 차례 건너뛰기)
- 실제 BGM / 효과음 asset 연결
- 관전자 모드
- 통합 / E2E 테스트를 저장소에 포함하고 CI 연결
