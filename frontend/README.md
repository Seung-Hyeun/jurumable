# frontend

주루마블의 Next.js (App Router) frontend입니다. 프로젝트 소개, 설계, 전체 실행 방법은 [루트 README](../README.md)를 참고하세요.

## Scripts

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` | production build |
| `npm run start` | build 결과 실행 |
| `npm run lint` | ESLint |

## 환경 변수

`.env.example`을 `.env.local`로 복사해서 사용합니다.

- `NEXT_PUBLIC_API_BASE_URL`: backend 공개 URL입니다(끝에 `/` 없이). build할 때 bundle에 들어가므로 secret을 넣으면 안 되고, 값을 바꾸면 다시 build해야 합니다.
