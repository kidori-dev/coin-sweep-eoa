# coin-sweep-eoa (admin API)

NestJS 11 + PostgreSQL 18 **어드민 전용** API. 서비스 유저 로그인은 없고 `admins` 테이블의 계정만 세션으로 로그인한다.
트론(Nile 테스트넷)에서 EOA 입금주소를 발급하고 메인지갑으로 집금한다.

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

## 트론 집금 (EOA)

메인지갑과 모든 입금주소를 **니모닉 하나에서 HD 파생**한다(`m/44'/195'/0'/0/{index}`). DB 에는 주소와 인덱스만
저장하고 개인키는 저장하지 않는다. 집금할 때만 메모리에서 파생한다. index 0 은 메인지갑, 1 부터 입금주소.

### 자동 집금 — 모든 유저의 USDT

`TRON_MIN_SWEEP_TOKEN` 이상을 가진 **모든 유저 지갑의 USDT** 를 메인지갑으로 모은다.
대상 토큰은 `TRON_TOKEN_CONTRACT` 하나뿐이고, TRX 나 다른 TRC20 은 **건드리지 않는다.**

```bash
docker compose exec api npm run cli -- tron:sweep --dry-run   # 대상만 계산
docker compose exec api npm run cli -- tron:sweep             # 실행
```

집금 기준액은 `TRON_MIN_SWEEP_TOKEN` 이다(기본 5 USDT). 그 미만은 그대로 두고, 필요하면 수동 집금으로 가져온다.

집금은 체인에서 자산을 옮기기만 한다. 잔고 회계는 하지 않으며, 결과는 `sweep_logs` 와
`user_wallet.last_swept_at` 에만 남는다.

### 금액 표기

체인이 정수로만 다루므로 DB 에도 **최소 단위 정수**로 저장한다(USDT decimals=6 → `8000000` = 8 USDT).
`numeric(38,0)` 이라 소수점 자리는 없지만 값이 잘리는 것은 아니다.
토큰을 바꿔 decimals 가 달라져도 스키마를 건드릴 필요가 없다.

API 응답은 어디서든 원값과 표시용 값을 함께 준다.

```json
// 입금주소
{ "usdtAmount": "12345678", "usdtAmountFormatted": "12.345678", "usdtSymbol": "USDT" }

// 집금 결과 / 집금 이력
{ "asset": "TOKEN", "amount": "8000000", "amountFormatted": "8.000000", "symbol": "USDT" }
```

`decimals` 는 컨트랙트에서 읽어 캐시하므로, 토큰을 바꾸면 표시 값도 자동으로 따라간다.
TRX 는 decimals 6 으로 고정 처리한다.

### user_wallet

입금주소를 담는 테이블. `usdt_amount` 는 **DB 가 들고 있는 USDT 잔고**로, 입금 와쳐가 올려준다.
집금은 이 값을 건드리지 않는다.

| 컬럼 | 의미 |
| --- | --- |
| `address` / `derivation_index` | 입금주소와 HD 파생 인덱스 |
| `user_ref` | 서비스 쪽 사용자 식별자 |
| `usdt_amount` | DB 가 관리하는 USDT 잔고 (와쳐가 갱신) |
| `last_swept_at` | 마지막 집금 시각 |

### 수동 집금 — 컨트랙트 + 주소

잘못 입금된 토큰이나 남은 TRX 를 회수할 때 쓴다. 컨트랙트 주소와 지갑 주소를 지정하면
**최소 집금액을 무시하고 잔액 전부**를 가져온다.

```bash
npm run cli -- tron:sweep-manual -c <TRC20 컨트랙트> -a TGvDe...
npm run cli -- tron:sweep-manual -c TRX -a TGvDe...          # 네이티브 TRX
```

```bash
curl -b cookie.txt -X POST http://localhost:3000/api/sweeps/manual   -H 'Content-Type: application/json'   -d '{"contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","address":"TGvDe..."}'
```

### 입금 와쳐

USDT 컨트랙트로 들어온 **입금만** 찾아서 `user_wallet.usdt_amount` 를 올린다. 집금과는 무관하게 돈다.

```bash
npm run cli -- tron:watch --dry-run     # DB 를 바꾸지 않고 감지 결과만
npm run cli -- tron:watch               # 반영
npm run cli -- tron:watch -s 1790000000000   # 이 시각(ms) 이후만
```

`POST /api/watcher/scan` 으로도 같은 일을 하고, `GET /api/watcher/deposits` 로 감지 내역을 본다.

동작 방식:

- 지갑별로 `transactions` 의 마지막 `block_timestamp` 부터 TronGrid 의 TRC20 입금 내역을 읽는다.
- 감지한 입금은 `transactions` 에 기록하고, **같은 DB 트랜잭션 안에서** `usdt_amount` 를 올린다.
  `(txid, user_wallet_id)` 유니크라 두 번 돌려도 중복 반영되지 않는다.
- 커서는 일부러 겹치게 잡는다. 같은 블록에 입금이 여러 건 들어와도 놓치지 않기 위해서다.

아직 스케줄러는 붙이지 않았다. 주기 실행이 필요하면 `@nestjs/schedule` 의 `@Cron` 으로 `scan()` 을 부르면 된다.

### transactions

**입금과 집금을 한 테이블에** 담는다. "어떤 토큰을 누가 누구에게 얼마" 를 그대로 남긴다.

| 컬럼 | 의미 |
| --- | --- |
| `type` | `deposit`(와쳐가 잡은 입금) / `sweep`(집금) |
| `status` | `success` / `failed` / `skipped` |
| `address` | 대상 유저 지갑 주소 |
| `contract` / `token_symbol` / `token_decimals` | 토큰 메타. `contract` 가 null 이면 네이티브 TRX |
| `txid` | 트랜잭션 해시. 실패·스킵된 집금은 null |
| `from_address` → `to_address` | 입금이면 `보낸사람 → 우리지갑`, 집금이면 `우리지갑 → 메인지갑` |
| `amount` | 최소 단위 금액 |
| `fee_strategy` / `fee_txid` | 집금에서 쓴 수수료 방식과 그 트랜잭션 |
| `error` | 실패 사유 |
| `block_timestamp` | 체인에 포함된 시각 (입금만 채워짐) |

`(txid, user_wallet_id)` 유니크가 입금 중복 반영을 막는 장치다.
조회는 `GET /api/transactions?type=deposit|sweep` 하나로 한다.

### 그 밖의 커맨드

```bash
npm run cli -- tron:info                  # 네트워크/메인지갑 상태
npm run cli -- tron:issue -c 3 -u user-1  # 입금주소 발급
npm run cli -- tron:balance               # 입금주소 잔액 + 누적입금
npm run cli -- tron:stake -a 200          # delegate 전략용 TRX 스테이킹
```

### API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/user-wallets` | 입금주소 발급 (`{ "userRef": "user-1024" }`) |
| GET | `/api/user-wallets` | 목록 |
| GET | `/api/user-wallets/:id/balance` | 체인 잔액 조회 |
| POST | `/api/sweeps` | 모든 유저의 USDT 집금 (`{ "dryRun": true }` 지원) |
| POST | `/api/sweeps/manual` | 수동 집금 (`{ "contract", "address", "dryRun" }`) |
| POST | `/api/watcher/scan` | 입금 감지 1회 실행 |
| GET | `/api/transactions` | 입금·집금 내역 (`limit`, `userWalletId`, `type`) |

### 수수료 전략 (`TRON_FEE_STRATEGY`)

TRC20 전송에는 energy 가 필요한데, 입금주소에는 보통 TRX 가 없다. 두 가지 방식을 지원한다.

| 전략 | 동작 | 비용 |
| --- | --- | --- |
| `delegate` (기본) | 메인지갑이 스테이킹한 리소스를 집금 직전에 위임하고 끝나면 회수 | TRX 가 잠기기만 하고 소모되지 않음 |
| `transfer` | 메인지갑이 입금주소로 TRX 를 보내 수수료를 대게 함 | 집금 1건마다 TRX 소모 |

`delegate` 를 쓰려면 먼저 `tron:stake` 로 메인지갑에 energy 를 확보해야 한다.
위임이 노드에서 거부되면 `TRON_FEE_FALLBACK=true` 일 때 자동으로 `transfer` 로 대체한다.

집금이 끝나면 **위임한 만큼 항상 회수한다.** 스테이크가 특정 주소에 묶이지 않고 계속 순환한다.

### bandwidth 스테이킹은 하지 말 것

집금 때 메인지갑이 쓰는 bandwidth 를 스테이킹으로 덮고 싶어질 수 있는데, 수지가 맞지 않는다.

| | 1 TRX 스테이킹당 | 소각가 | 회수기간 |
| --- | --- | --- | --- |
| energy | 73.7 /일 | 100 SUN | **136일** |
| bandwidth | 0.63 /일 | 1,000 SUN | **1,584일** |

bandwidth 는 공급이 적고(432억을 684억 TRX 가 나눠 가짐) 소각가는 10배 비싸서, energy 대비 117배 비효율이다.
bandwidth 비용을 줄이려면 스테이킹이 아니라 **메인지갑이 보내는 트랜잭션 수를 줄여야 한다**(위 `TRON_KEEP_DELEGATION`).

**energy 와 별개로 bandwidth 도 필요하다.** TRC20 전송은 약 345 bandwidth 를 쓰는데, 활성 계정의
하루 무료 할당(600)으로 보통 충분하다. 모자라면 집금 직전에 `TRON_BANDWIDTH_TOPUP_SUN` 만큼 TRX 를
채워준다(기본 0.5 TRX). 이게 없으면 전송이 `Account resource insufficient` 로 실패한다.

### Nile 실측 데이터

집금 1건에 필요한 리소스는 네트워크 총 스테이킹량에 따라 변한다. 아래는 2026-09 Nile 기준 실측값.

| 항목 | 값 |
| --- | --- |
| 스테이킹 1 TRX 당 energy | 약 73.7 (`TotalEnergyLimit / TotalEnergyWeight`) |
| USDT 전송 → 이미 USDT 를 가진 주소 | 14,650 energy |
| USDT 전송 → USDT 가 없는 주소 | 29,650 energy |
| 신규 입금주소 활성화 | 전송액 + 1 TRX 생성 수수료(보내는 쪽 부담) |
| energy 가격(부족 시 TRX 소각) | 100 SUN / energy |

`TRON_DELEGATE_ENERGY` 에 필요 energy 를 넣으면 위임액은 자동 계산된다(20,000 energy ≈ 271 TRX).
메인넷 USDT 는 이보다 무거우니 여유를 둘 것.

> Nile 테스트 USDT 는 `consume_user_resource_percent` 설정 때문에 **컨트랙트 배포자가 energy 를 대신 낸다**
> (영수증의 `origin_energy_usage`). 그래서 테스트넷에서는 입금주소가 energy 없이도 전송이 되는 것처럼 보인다.
> 메인넷 USDT 는 보내는 쪽이 부담하므로, 위임이나 TRX 충전이 실제로 필요하다.

### 알아둘 트론 동작

- **토큰만 받은 주소는 계정이 활성화되지 않는다.** 그래서 집금 전에 활성화용 TRX 를 먼저 보낸다(`ensureActivated`).
- **위임은 메인지갑의 "미사용" 스테이크에서만 가능하다.** 메인지갑이 자기 energy 를 쓰면 그만큼 위임할 수 없고,
  energy 는 24시간에 걸쳐 회복된다. 운영에서 메인지갑은 컨트랙트를 호출할 일이 없으므로 보통 문제되지 않는다.
- `getCanDelegatedMaxSize` 는 실제보다 작게 나온다(124 TRX 라고 보고했지만 200 TRX 위임이 성공했다).
  그래서 미리 계산해서 분기하지 않고, **일단 위임을 시도하고 노드가 거부하면** `transfer` 로 대체한다.
- `getTransactionInfo` 는 solidity 노드를 조회해서 약 60초 지연된다. 확인은 `getTransaction` 의 `contractRet` 으로 한다.
- 노드가 거부해도 응답에 `txid` 가 함께 오므로, `code` 필드를 같이 봐야 성공/실패를 가릴 수 있다.
- **TronGrid 는 높이가 다른 여러 풀노드로 분산된다.** 전송 직후 조회는 반영 전 노드로 갈 수 있어
  잔액이나 스테이킹 상태가 잠깐 옛날 값으로 보인다. 몇 초 뒤 수렴하므로 **전송 직후 읽은 값으로 판단하지 말 것.**
  (`getTrxBalanceStable` 이 0 으로 읽히는 경우를 재시도한다.)

### 테스트넷 준비

1. `tron:info` 로 메인지갑 주소 확인
2. https://nileex.io 에서 해당 주소로 테스트 TRX 를 받는다 (USDT 는 Nile faucet 또는 스왑)
3. `tron:issue` 로 입금주소를 만들고 거기로 소액 송금
4. `tron:sweep --dry-run` → `tron:sweep`

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
│  ├─ admins/              # Admin 엔티티 + 서비스
│  ├─ tron/                # TronWeb 래퍼 + HD 지갑 파생
│  ├─ user-wallets/        # 입금주소 발급/조회 (user_wallet 테이블)
│  ├─ sweep/               # 집금 로직
│  ├─ transactions/        # 입금·집금 기록 (transactions 테이블)
│  └─ watcher/             # 입금 감지 → usdt_amount 반영
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

**니모닉** — `TRON_MNEMONIC` 이 유출되면 모든 입금주소의 자금을 잃는다. `.env` 는 커밋되지 않지만,
운영에서는 KMS/Vault 등으로 옮기고 컨테이너에는 주입만 하는 게 맞다.
파생 경로는 BIP44 표준(coin type 195)이라 같은 니모닉을 TronLink 등에 넣으면 동일한 주소가 나온다.

**Postgres 18** — 공식 이미지의 기본 `PGDATA` 가 `/var/lib/postgresql/18/docker` 로 바뀌어서,
볼륨을 `pgdata:/var/lib/postgresql` (상위 경로)에 마운트한다. 예전 `/data` 볼륨은 인식되지 않는다.

**운영 배포** — `docker compose -f docker-compose.prod.yml up -d --build`.
`SESSION_SECRET` 교체, `SESSION_SECURE=true`(HTTPS), DB 비밀번호 변경은 필수.
