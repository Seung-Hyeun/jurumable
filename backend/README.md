# backend

주루마블의 NestJS backend입니다. REST API, Socket.IO gateway, Prisma(PostgreSQL)로 구성됩니다. 프로젝트 소개, 설계, 전체 실행 방법은 [루트 README](../README.md)를 참고하세요.

## Scripts

| 명령 | 설명 |
| --- | --- |
| `npm run start:dev` | 개발 서버, watch 모드 (http://localhost:3001) |
| `npm run build` | `prisma generate` 후 `nest build` |
| `npm run start:prod` | build 결과 실행 (`node dist/main`) |
| `npm run prisma:deploy` | 저장소의 migration을 DB에 적용 (`prisma migrate deploy`) |
| `npm run lint` | oxlint |
| `npm test` | Vitest |

처음 실행할 때는 `npx prisma generate`로 Prisma Client(`src/generated/prisma`)를 먼저 만듭니다.

## 환경 변수

`.env.example`을 `.env`로 복사해서 사용합니다.

- `DATABASE_URL`: PostgreSQL 연결 문자열(secret)
- `FRONTEND_ORIGIN`: REST와 Socket.IO CORS가 허용하는 frontend origin. 기본값은 `http://localhost:3000`입니다.
- `PORT`: HTTP 포트. 기본값은 `3001`입니다.

Prisma CLI 설정은 `prisma7.config.ts`에 있습니다.
