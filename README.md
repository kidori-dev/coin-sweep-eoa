# coin-sweep-eoa (admin API)

NestJS 11 + PostgreSQL 18 **어드민 전용** API. 서비스 유저 로그인은 없고 `admins` 테이블의 계정만 세션으로 로그인한다.

## 실행

```bash
cp .env.example .env            # 최초 1회
docker compose up -d            # 이거 하나면 끝 (DB → 마이그레이션 → API watch)
docker compose exec api npm run cli -- db:seed   # 최초 1회, 어드민 계정 생성
```

소스를 저장하면 **컨테이너 재시작 없이 자동 리빌드·재기동된다**(약 10초). 따로 켤 것 없다.

```bash
docker compose up -d --build    # package.json / Dockerfile 을 바꿨을 때
docker compose logs -f api      # 로그
docker compose down             # 종료 (DB 데이터 유지)
docker compose down -v          # 종료 + DB 초기화
```

| | |
| --- | --- |
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| Health | http://localhost:3000/api/health |
| 로그인 | `admin@example.com` / `admin1234` |
| Postgres | `localhost:5432` · postgres/postgres · db `coin_sweep` |

도커 없이 호스트에서 돌리려면: `docker compose up -d db` 후 `npm i && npm run migration:run && npm run start:dev`.

## 엔드포인트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ "email", "password" }` → 세션 쿠키 |
| POST | `/api/auth/logout` | 세션 파기 |
| GET | `/api/auth/me` | 현재 로그인한 어드민 |
| GET | `/api/health` | 헬스체크 (공개) |

```bash
curl -i -c cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin1234"}'
curl -b cookie.txt http://localhost:3000/api/auth/me
```

## CLI 커맨드

`nest-commander` 기반. HTTP 서버 없이 DI 컨테이너만 부팅한다(`src/cli.ts`).

```bash
docker compose exec api npm run cli -- --help
docker compose exec api npm run cli -- admin:create -e dev@example.com -p secret1234 -r super_admin
docker compose exec api npm run cli -- admin:password <adminId> -p newsecret123
docker compose exec api npm run cli -- db:seed
```

추가: `src/commands/` 에 `CommandRunner` 클래스를 만들고 `cli.module.ts` 의 `providers` 에 등록.

## 마이그레이션

`synchronize` 는 쓰지 않는다. 스키마 변경은 항상 마이그레이션으로.

```bash
npm run migration:generate -- src/database/migrations/AddSomething
npm run migration:run
npm run migration:revert
docker compose -f docker-compose.prod.yml run --rm api npm run migration:run:prod   # 운영(ts-node 없음)
```

## 코드 규칙

**DTO 이름** — 요청/응답을 파일명과 클래스명 양쪽에 드러낸다.

| 용도 | 파일 | 클래스 |
| --- | --- | --- |
| 요청 | `login.request.dto.ts` | `LoginRequestDto` |
| 응답 | `admin-profile.response.dto.ts` | `AdminProfileResponseDto` |

응답 DTO는 엔티티를 그대로 내보내지 않도록 `static from(entity)` 로 변환한다.

**가드** — 기본값이 "전 라우트 로그인 필수"(`AuthenticatedGuard` 가 전역).
공개는 `@Public()`, 권한은 `@Roles(AdminRole.SUPER_ADMIN)`, 현재 어드민은 `@CurrentAdmin()`.

**Swagger** — `@ApiTags` / `@ApiOperation` / `@ApiOkResponse({ type: XxxResponseDto })` 를 붙이고
DTO 필드에 `@ApiProperty`. `SWAGGER_ENABLED` 미지정 시 production 에서는 자동으로 꺼진다.

## 보안 설정

| 항목 | 설정 | 기본값 |
| --- | --- | --- |
| CORS | `CORS_ORIGINS` (콤마 구분, 비우면 비활성) | `http://localhost:5173` |
| 쿠키 SameSite | `SESSION_SAME_SITE` — 프론트가 다른 도메인이면 `none` (+`SESSION_SECURE=true` 필수) | `lax` |
| 전역 요청 제한 | `THROTTLE_LIMIT` / `THROTTLE_TTL`(ms) | 120회 / 60초 |
| 로그인 제한 | `@Throttle` 로 라우트에 직접 지정 (`auth.controller.ts`) | 1초 2회 |
| 프록시 신뢰 | `TRUST_PROXY` — nginx/ALB 뒤면 홉 수, 직접 노출이면 0 | `0` |

- 헬스체크는 `@SkipThrottle()` 로 제한에서 빠져 있다 (k8s/LB probe 용).
- 비밀번호를 바꾸면 `password_changed_at` 이 갱신되고, 그보다 먼저 발급된 **세션은 전부 무효화**된다.
- `package.json` 의 `overrides` 로 `multer` 를 2.4.0 으로 올려 두었다. `@nestjs/platform-express@11` 이 물고 오는
  2.2.0 에 DoS 취약점(high 8건)이 있어서다. NestJS 12 로 올리면 제거 가능하지만, `nest-commander` 가
  아직 Nest 11 을 요구해서 지금은 올릴 수 없다.

## 구조

```
src/
├─ main.ts                 # HTTP 진입점 (세션/헬멧/전역 파이프/Swagger)
├─ cli.ts                  # CLI 진입점
├─ session.setup.ts        # express-session(메모리) + passport
├─ swagger.setup.ts        # OpenAPI 설정
├─ app.module.ts           # HTTP 루트 모듈 (전역 가드)
├─ config/                 # env 로드 + Joi 검증
├─ database/               # DataSource, TypeORM 설정, migrations/
├─ common/                 # guards, decorators(@Public @Roles @CurrentAdmin)
├─ modules/
│  ├─ auth/                # 로컬 전략, 세션 시리얼라이저, 컨트롤러, dto/
│  └─ admins/              # Admin 엔티티 + 서비스
├─ commands/               # CLI 커맨드 + CliModule
└─ health/                 # terminus 헬스체크

test/                        # 테스트는 전부 여기. src 트리를 그대로 미러링한다
├─ modules/auth/auth.service.spec.ts
└─ jest-e2e.json
```

테스트 안에서는 상대경로 대신 `src/...` 별칭으로 import 한다 (`import { AuthService } from 'src/modules/auth/auth.service'`).
유닛 테스트는 `*.spec.ts`, E2E 는 `*.e2e-spec.ts` (`npm test` / `npm run test:e2e`).

## 알아둘 것

**세션은 프로세스 메모리에 있다**(`memorystore`). 그래서:
- API 를 재시작하면(= 소스 저장으로 리로드될 때도) 로그인 세션이 전부 끊긴다.
- **API 인스턴스는 1개만** 띄워야 한다. 스케일아웃하려면 `src/session.setup.ts` 의 `store` 를 Redis 로 교체.

세션에는 어드민 id 만 담고 매 요청 DB 에서 다시 읽으므로, 권한 변경·비활성화는 기존 세션에도 즉시 반영된다.

**핫리로드** — Windows/macOS 의 bind mount 는 inotify 이벤트가 컨테이너에 전달되지 않아
`tsconfig.json` 의 `watchOptions` 로 폴링 감시를 켜 뒀다. 이걸 지우면 핫리로드가 멈춘다.
(`nest start --watch` 는 chokidar 가 아니라 tsc 를 쓰므로 `CHOKIDAR_USEPOLLING` 은 효과 없음.)

**Postgres 18** — 공식 이미지의 기본 `PGDATA` 가 `/var/lib/postgresql/18/docker` 로 바뀌어서,
볼륨을 `pgdata:/var/lib/postgresql` (상위 경로)에 마운트한다. 예전 `/data` 볼륨은 인식되지 않는다.

**운영 배포** — `docker compose -f docker-compose.prod.yml up -d --build`.
`SESSION_SECRET` 교체, `SESSION_SECURE=true`(HTTPS), DB 비밀번호 변경은 필수.
