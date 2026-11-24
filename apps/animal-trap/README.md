# 애니멀 트랩: 오아시스 쟁탈전

4~8팀 실시간 수업 게임. 교사가 새 판을 만들 때 팀 수를 선택합니다. 설계는 [DESIGN.md](DESIGN.md), 원본 기획서는 [docs/plan-v2.md](docs/plan-v2.md).

Cloudflare Worker `animal-trap` + Durable Object(판 하나 = 인스턴스 하나) + D1(문제은행·판 목록).
계정 **bsy0708@korea.kr**. 운영 주소: `https://animal-trap.bsy0708.workers.dev`.

4~8팀 판의 팀당 덫은 각각 26·21·18·15·13개(전체 약 104개)입니다. 상대 팀의 출발 구역에
처음 들어가면 진입팀 +10점, 그 구역에 주인이 있으면 주인 −5점이 적용됩니다.
참가팀이 없는 출발 구역도 처음 진입한 팀은 +10점을 받습니다.

## 개발

```sh
npm ci
npm test                 # 타입 검사 3벌 + 단위 테스트 (Node 24 이상)
npm run build            # 화면 → dist/client
npx wrangler d1 migrations apply animal-trap --local
npx wrangler dev --var ADMIN_PASSWORD:<로컬용>
```

## 로컬 통합 점검 (교사 1·TV 1·팀 8 한 판)

```sh
npx wrangler d1 migrations apply animal-trap --local
npx wrangler d1 execute animal-trap --local --file scripts/e2e-seed.sql   # 'E2E' 문제 세트
npm run build && npx wrangler dev --var ADMIN_PASSWORD:<로컬용>
BASE=http://localhost:8787 ADMIN_PASSWORD=<로컬용> node scripts/e2e.ts
```

## 배포

```sh
npx wrangler login                      # bsy0708@korea.kr
npm run deploy                          # 테스트 → 빌드 → 배포
```
D1 `animal-trap`(APAC)은 2026-11-16 선생님 계정에 별도로 생성했습니다. `ADMIN_PASSWORD` secret을 등록하고 기존 문제은행 7세트·228문항을 이전했습니다. 형 계정 데이터와 자동 동기화되지는 않습니다.
새 migration 이 생기면 `npx wrangler d1 migrations apply animal-trap --remote`.

## 기록

- 2026-11-13 0단계: 실제 계정에서 DO SQLite·alarm·WebSocket hibernation·D1 점검 통과
  (`/api/_smoke` 점검 통로). 2단계 시작 때 점검 코드·`SMOKE_ENABLED` 를 모두 지웠다.
