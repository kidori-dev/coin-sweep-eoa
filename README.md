# coin-sweep-eoa (admin API)

NestJS 11 + PostgreSQL 18 **어드민 전용** API. 서비스 유저 로그인은 없고 `admins` 테이블의 계정만 세션으로 로그인한다.
트론(Nile 테스트넷)에서 EOA 입금주소를 발급하고 메인지갑으로 집금한다.

## 실행

```bash
cp .env.example .env            # 최초 1회
docker compose up -d            # 이거 하나면 끝 (DB → 마이그레이션 → API watch)

# 최초 1회: 어드민 계정 + 네이티브 TRX 행
docker compose exec api npm run cli -- db:seed
# 감시·집금할 TRC20 등록 (이걸 해야 입금 스캔이 돈다)
docker compose exec api npm run cli -- tron:contract-add -c TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf -m 5000000
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

**타입** — 서비스 안팎에서 주고받는 인터페이스는 서비스 파일에 두지 말고 모듈의 `*.types.ts` 로 뺀다
(`watcher.types.ts`, `sweep.types.ts`). 서비스 파일에는 클래스와 그 파일에서만 쓰는
상수만 남긴다. HTTP 경계에서 쓰는 모양은 `*.types.ts` 가 아니라 `dto/` 의 DTO 클래스다.

**가드** — 기본값이 "전 라우트 로그인 필수"(`AuthenticatedGuard` 가 전역).
공개는 `@Public()`, 권한은 `@Roles(AdminRole.SUPER_ADMIN)`, 현재 어드민은 `@CurrentAdmin()`.

**Swagger** — `@ApiTags` / `@ApiOperation` / `@ApiOkResponse({ type: XxxResponseDto })` 를 붙이고
DTO 필드에 `@ApiProperty`. `SWAGGER_ENABLED` 미지정 시 production 에서는 자동으로 꺼진다.

## 트론 집금 (EOA)

메인지갑과 모든 입금주소를 **니모닉 하나에서 HD 파생**한다(`m/44'/195'/0'/0/{index}`). DB 에는 주소와 인덱스만
저장하고 개인키는 저장하지 않는다. 집금할 때만 메모리에서 파생한다. index 0 은 메인지갑, 1 부터 입금주소.

### 자동 집금 — 모든 유저의 USDT

**등록된 활성 TRC20 전부**에 대해, DB 미집금 잔액이 `contract.min_sweep_amount` 이상인 지갑을
메인지갑으로 모은다. 컨트랙트를 하나 더 등록하면 입금 감시와 자동 집금이 함께 따라온다.
네이티브 TRX 는 자동 집금에서 빠지고 수동 집금으로만 가져온다.

```bash
docker compose exec api npm run cli -- tron:sweep --dry-run   # 대상만 계산
docker compose exec api npm run cli -- tron:sweep             # 실행
```

집금 기준액은 자산별 값이라 `contract.min_sweep_amount` 가 들고 있다 (`tron:contract-add -m` 으로 지정).
그 미만은 그대로 두고, 필요하면 수동 집금으로 가져온다.

**집금 대상은 DB 로 고른다.** `deposit_amount - sweep_amount >= min_sweep_amount` 인 행만 뽑으므로
후보를 찾는 데 체인 호출이 **0번**이다. 지갑 전부에 `balanceOf` 를 쏘면 지갑 수에 비례해 느려져서,
와쳐를 블록 기준으로 고쳐도 집금이 같은 벽에 막힌다.

실제로 옮길 금액은 체인이 정답이다. 후보로 뽑힌 지갑만 `balanceOf` 를 읽고, DB 기대치와 어긋나면
체인을 따르며 그 사실이 `reason` 에 남는다 (체인 잔액이 0 이면 경고 후 건너뛴다).

결과는 `transactions`(`type=sweep`) 에 남고, 성공분이 `user_wallet_balance.sweep_amount` 에 더해진다.

### 금액 표기

체인이 정수로만 다루므로 DB 에도 **최소 단위 정수**로 저장한다(USDT decimals=6 → `8000000` = 8 USDT).
`numeric(38,0)` 이라 소수점 자리는 없지만 값이 잘리는 것은 아니다.
토큰을 바꿔 decimals 가 달라져도 스키마를 건드릴 필요가 없다.

API 응답은 어디서든 원값과 표시용 값을 함께 준다.

```json
// 입금주소 (자산별 balances 배열)
{ "symbol": "USDT", "depositAmount": "12345678", "sweepAmount": "0",
  "pendingAmount": "12345678", "pendingAmountFormatted": "12.345678" }

// 집금 결과 / 집금 이력
{ "asset": "TOKEN", "amount": "8000000", "amountFormatted": "8.000000", "symbol": "USDT" }
```

`symbol` / `decimals` 는 `contract` 행에서 읽으므로 체인 조회 없이도 표시가 된다.

### contract — 자산 한 건이 한 행

토큰 주소를 env 문자열로 들고 다니면 오타 하나에 **조용히** 별개의 커서·이력이 생긴다. 주소를 행으로
고정하고 `transactions` / `user_wallet_balance` 가 모두 FK 로 이 행을 가리킨다.
네이티브 TRX 도 `address = NULL` 인 한 행으로 등록해서, 예전처럼 "null 이면 TRX" 와 "문자열 `'TRX'` 면 TRX"
가 섞이지 않게 했다.

**컨트랙트 행을 하나 추가하면 그 자산의 입금 감시와 자동 집금이 같이 켜진다.**

| 컬럼 | 의미 |
| --- | --- |
| `chain` / `address` | `tron`, TRC20 컨트랙트 주소. `address` 가 null 이면 네이티브 TRX |
| `symbol` / `decimals` | 체인에서 읽어 굳혀 둔 메타데이터 |
| `is_native` | 네이티브 자산 여부 |
| `is_active` | false 면 새 작업에 쓰지 않는다 (이력은 FK 로 남으므로 삭제 대신 이 플래그) |
| `min_sweep_amount` | 자동 집금 최소 금액 (최소 단위) |

`(chain, address)` 유니크(`NULLS NOT DISTINCT`)라 네이티브 행도 체인당 하나만 존재한다.
**어떤 자산을 다룰지는 전부 이 테이블이 정한다.** env 에는 컨트랙트 주소가 없다 — 등록 경로가
`tron:contract-add` 하나뿐이라 "env 를 바꿨는데 왜 안 바뀌지" 가 생기지 않는다. `symbol`/`decimals` 는
체인에서 읽어 굳힌다. **감시 대상과 집금 대상이 같은 조건**이다 — `is_active AND NOT is_native`.
어디까지 훑었는지는 여기 없다. 그건 스캐너의 상태라 `chain_scan_state` 가 한 행으로 들고 있다.
이력 테이블을 FK 가 붙들고 있어 `ON DELETE RESTRICT` — 쓰인 적 있는 컨트랙트는 지워지지 않는다.

```bash
npm run cli -- db:seed                              # 어드민 + 네이티브 TRX 행
npm run cli -- tron:contract                        # 등록된 자산 목록 + 스캔 커서
npm run cli -- tron:contract-add -c TR7NHq... -m 5000000   # 등록 즉시 감시·집금 대상
```

### user_wallet / user_wallet_balance

`user_wallet` 은 주소와 HD 인덱스만 담는다. EOA 주소는 토큰과 무관하게 여러 자산을 동시에 담으므로,
지갑 행에 금액 컬럼을 두면 그 행이 사실상 (지갑 × 토큰) 이 되어 주소·파생인덱스 유니크가 깨진다.
잔고는 `user_wallet_balance` 에 자산별로 나눠 둔다.

조회도 "기준 자산 하나"가 아니라 **가진 것을 전부** 돌려준다. `GET /user-wallets` 는 DB 잔고를
자산별로 주고(활성 컨트랙트는 입금이 없어도 0 으로 채워 응답 모양을 고정한다),
`GET /user-wallets/:id/balance` 는 TRX 와 등록된 TRC20 전부의 **체인 실잔액**을 읽어 준다.
후자는 비활성 컨트랙트도 포함한다 — 감시에서 뺀 토큰이 남아 있으면 그게 제일 보고 싶은 값이니까.

| 컬럼 | 의미 |
| --- | --- |
| `user_wallet.address` / `derivation_index` | 입금주소와 HD 파생 인덱스 |
| `user_wallet.user_ref` | 서비스 쪽 사용자 식별자 |
| `user_wallet_balance.contract_id` | 어느 자산의 잔고인지 |
| `user_wallet_balance.deposit_amount` | 입금 누계. 와쳐가 더한다. 줄지 않는다 |
| `user_wallet_balance.sweep_amount` | 집금 누계. 집금에 성공할 때마다 더한다. 줄지 않는다 |
| `user_wallet_balance.last_swept_at` | 그 자산을 마지막으로 집금한 시각 |

둘 다 단조 증가하는 누계이고 **그 차이가 미집금 잔액**이다. 집금 대상을 이 값으로 고른다.

`(user_wallet_id, contract_id)` 유니크. 잔고 행은 첫 입금 때 upsert 로 생기므로 지갑 발급 시점에
자산별 행을 미리 만들어 둘 필요가 없다.

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

### 입금 와쳐 — 블록 스캔

등록된 활성 TRC20 으로 우리 입금주소에 들어온 **입금만** 찾아서
`user_wallet_balance.deposit_amount` 를 올린다. 집금과는 무관하게 돈다.

```bash
npm run cli -- tron:watch --dry-run     # DB 를 바꾸지 않고 감지 결과만
npm run cli -- tron:watch               # 한 배치만 훑고 종료
npm run cli -- tron:watch --loop        # 상주하며 계속 따라간다 (워커)
npm run cli -- tron:watch -b 2000       # 한 배치에서 훑을 블록 수
```

`POST /api/watcher/scan` 으로도 같은 일을 하고, `GET /api/transactions?type=deposit` 로 감지 내역을 본다.

동작 방식:

- `chain_scan_state.last_scanned_block` 다음 블록부터 **확정(solidified) 블록**까지, 한 번에
  `SCAN_BLOCK_BATCH` 개씩 끊어서 훑는다.
- 블록마다 `walletsolidity/gettransactioninfobyblocknum` **1콜**. 그 응답에 그 블록의 모든 로그가
  들어 있으므로 `Transfer` 토픽 → 우리 컨트랙트 → 우리 입금주소 순으로 걸러낸다.
- **지갑이 몇 개든, 등록된 토큰이 몇 개든 호출 수가 같다.** 주소 대조는 메모리 해시셋에서 한다.
- 감지한 입금은 `transactions` 에 기록하고, **같은 DB 트랜잭션 안에서** 잔고를 올리고 커서를
  전진시킨다. 함께 커밋되므로 커서만 앞서 나가 입금이 새는 창이 없다.
- 되돌려진 트랜잭션(`receipt.result != SUCCESS`)의 로그는 건너뛴다.

왜 블록 기준인가 — 지갑마다 TronGrid 계정 조회를 쏘면 호출 수가 지갑 수에 비례한다. 지갑 1000개면
한 사이클에 순차 1000콜(약 200초)이라 60초 주기가 아예 성립하지 않는다. 블록 기준은 상수다.

#### 확정 블록만 본다

`walletsolidity/*` 로 읽으므로 되돌아갈 수 있는 블록은 애초에 보이지 않는다. **reorg 처리가 필요 없고**,
"지금 - 확정 지연 버퍼" 같은 시간 휴리스틱도 없어졌다. 커서가 타임스탬프에서 블록 번호로 바뀌면서
동률(같은 timestamp 에 전송이 몰려 커서가 안 밀리는 문제)도 같이 사라졌다.

#### TRX 가 빠진 이유

네이티브 TRX 전송은 **컨트랙트 이벤트가 아니다.** TransactionInfo 에는 로그만 있고 금액·상대 주소가
없어서, TRX 를 잡으려면 블록 바디(`getblockbynum`)를 따로 받아야 한다. 블록당 콜이 2배가 되는데,
그렇게 해도 컨트랙트가 보낸 TRX(`internal_transactions`)는 여전히 놓친다.

게다가 집금할 때 메인지갑이 입금주소로 가스용 TRX 를 보내므로, TRX 입금을 감시하면 **우리 가스
충전금이 유저 입금으로 기록된다.**

TRX 는 원장이 아니라 잔액이면 충분하다 — 집금은 어차피 체인 실잔액을 직접 읽고(`sweepTrxAll`),
잘못 들어온 TRX 는 `tron:balance` 의 TRX 열에 그대로 보인다. `contract` 에 TRX 행은 있지만
`is_native = true` 라 감시 대상에서 빠진다.

#### 스캔 위치는 체인 단위다 — chain_scan_state

"어디까지 훑었는지" 는 **체인당 한 행**이다. 자산마다 커서를 두면 두 가지가 생긴다.

첫째, 정상 상태에서 모든 행이 **같은 값**을 들고 있다. 한 개의 사실을 N개로 복사해 둔 것뿐이다.

둘째가 진짜 문제다. 컨트랙트 하나를 과거 블록부터 등록하면 스캔 시작점이 가장 뒤처진 커서를
따라 과거로 끌려가서, **그동안 다른 자산의 신규 입금까지 멈춘다.** 하루치를 메우면 약 한 시간이고,
그 사이 조용히 멈춰 있어 알아채기도 어렵다.

그래서 위치는 `chain_scan_state` 한 행에만 두고, "이 자산을 보는가" 는 `contract.is_active` 가
답한다. 덕분에 감시 대상 조건이 자동 집금 대상 조건과 같아졌다.

#### 과거 구간 다시 훑기 — backfill

```bash
npm run cli -- tron:backfill -f 71106800 -t 71106900                  # 전 자산
npm run cli -- tron:backfill -f 71106800 -t 71106900 -c TXYZop...     # 특정 컨트랙트만
npm run cli -- tron:backfill -f 71106800 -t 71106900 --dry-run
```

**커서를 건드리지 않는다.** 백필이 몇 시간을 돌아도 메인 스캔은 계속 tip 을 따라가므로 신규 입금이
밀리지 않는다. 이미 기록된 입금은 유니크 인덱스에 막혀 잔고를 다시 올리지 않고, 그 구간에
**아직 기록된 적 없는** 입금만 새로 반영된다.

새 컨트랙트의 과거 입금을 채울 때도 이걸 쓴다 — `tron:contract-add` 는 등록 즉시 감시 대상으로
만들 뿐이고, 그 이전 블록은 backfill 이 맡는다.

#### 밀렸는지 보는 법

`scan_run` 같은 실행 이력 테이블은 없앴다. 블록 커서 자체가 더 정확한 생존 신호이기 때문이다 —
응답의 `remainingBlocks`(= `solidifiedBlock - toBlock`)가 **계속 커지면 따라가지 못하는 중**이다.
TRON 은 3초에 한 블록이므로 이 값에 3을 곱하면 대략 몇 초나 밀렸는지가 나온다.
`tron:info` 의 `scan position` 줄에서도 같은 값을 본다.

#### 상주 실행 — `--loop`

주기 실행은 크론이 아니라 `--loop` 상주 프로세스로 한다.

```bash
node dist/cli tron:watch --loop              # 프로덕션
node dist/cli tron:watch --loop -i 5000      # 따라잡았을 때 쉬는 간격 (기본 3초)
```

- **밀려 있으면 쉬지 않는다.** 한 배치를 끝내고 `remainingBlocks > 0` 이면 곧바로 다음 배치로
  넘어가고, 따라잡았을 때만 블록 간격(3초)만큼 쉰다. 주기를 하나로 고정해야 하는 크론과 달리
  백로그를 전속력으로 비운다 — 실측으로 3,000블록 밀린 상태에서 초당 20~25블록씩 줄어든다.
- **동시 실행은 advisory lock 이 막는다.** 워커를 두 개 띄우거나 사람이 수동으로 `tron:watch` 를
  쳐도 한쪽은 `skipped` 로 즉시 돌아온다. 세션 단위 락이라 프로세스가 죽으면 자동으로 풀린다.
  `tron:backfill` 은 메인 스캔과 **동시에 도는 게 설계 의도**라 이 락을 잡지 않는다.
- **실패해도 죽지 않는다.** 노드나 DB 가 끊기면 1초 → 2초 → … 30초까지 백오프하며 계속 재시도한다.
  프로세스를 내려 버리면 부팅만 반복해서 태우기 때문이다. 장애 감지는 종료코드가 아니라
  `lag` 이 계속 커지는 걸로 한다.
- **SIGTERM 을 받으면 진행 중인 배치를 마치고 나간다.** 입금 반영과 커서 전진이 한 트랜잭션이라
  중간에 끊겨도 유실은 없지만, 굳이 끊을 이유도 없다.
- 조용할 때는 로그를 남기지 않고 5분마다 한 줄씩 하트비트만 찍는다.

로그는 한 줄 요약이다:

```
blocks=71108397~71108446 solidified=71108698 lag=252 found=1 applied=1
```

프로세스 관리는 컨테이너 재시작 정책에 맡기면 된다. 이때 **`npm run` 을 거치지 말고 `node dist/cli`
를 직접 실행**해야 SIGTERM 이 node 에 그대로 닿는다 — 셸 래퍼가 끼면 종료 신호가 중간에서 먹힌다.

나중에 k8s 로 가면 CronJob 쪽이 낫다. 재시도·실행 이력·`concurrencyPolicy: Forbid` 를 플랫폼이
주므로 상주 프로세스도 advisory lock 도 필요 없어진다.

### transactions

**입금과 집금을 한 테이블에** 담는다. "어떤 토큰을 누가 누구에게 얼마" 를 그대로 남긴다.

| 컬럼 | 의미 |
| --- | --- |
| `type` | `deposit`(와쳐가 잡은 입금) / `sweep`(집금) |
| `status` | `success` / `failed` / `skipped` |
| `address` | 대상 유저 지갑 주소 |
| `contract_id` | `contract` 행 FK. 네이티브 TRX 도 자기 행을 가리킨다 |
| `token_symbol` / `token_decimals` | **기록 시점 스냅샷.** `contract` 행을 고쳐도 과거 이력의 표시 금액이 따라 움직이면 안 되므로 FK 와 별개로 굳혀 둔다 |
| `txid` | 트랜잭션 해시. 실패·스킵된 집금은 null |
| `block_number` / `log_index` | 어느 블록의 몇 번째 로그였는지 (입금만) |
| `from_address` → `to_address` | 입금이면 `보낸사람 → 우리지갑`, 집금이면 `우리지갑 → 메인지갑` |
| `amount` | 최소 단위 금액 |
| `fee_strategy` / `fee_txid` | 집금에서 쓴 수수료 방식과 그 트랜잭션 |
| `error` | 실패 사유 |
| `block_timestamp` | 체인에 포함된 시각 (입금만 채워짐) |

입금 중복 반영을 막는 건 **부분 유니크 인덱스**다:

```sql
UNIQUE (txid, user_wallet_id, contract_id, log_index) WHERE type = 'deposit'
```

`log_index` 가 키에 들어가야 한다 — 한 트랜잭션이 같은 주소로 서로 다른 토큰을 보내거나(배치 전송)
같은 토큰을 두 번 보낼 수 있고, `(txid, user_wallet_id)` 만으로는 **두 번째 건이 조용히 사라진다.**
집금은 append-only 라 제약을 걸지 않는다 (실패 건은 `txid` 자체가 없다).
조회는 `GET /api/transactions?type=deposit|sweep` 하나로 한다 (`contract` 로도 거를 수 있다, 네이티브는 `TRX`).

### 그 밖의 커맨드

```bash
npm run cli -- tron:info                  # 네트워크/메인지갑 상태
npm run cli -- tron:issue -c 3 -u user-1  # 입금주소 발급
npm run cli -- tron:balance               # 입금주소 체인 실잔액 + DB 잔고
npm run cli -- tron:contract              # 등록된 자산 목록 + 스캔 커서
npm run cli -- tron:backfill -f <from> -t <to>   # 과거 구간 재조회 (커서 무관)
npm run cli -- tron:stake -a 200          # delegate 전략용 TRX 스테이킹
```

### API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/user-wallets` | 입금주소 발급 (`{ "userRef": "user-1024" }`) |
| GET | `/api/user-wallets` | 목록 |
| GET | `/api/user-wallets/:id/balance` | 체인 실잔액 — TRX + 등록된 TRC20 전부 |
| POST | `/api/sweeps` | 등록된 TRC20 전부 자동 집금 (`{ "dryRun": true }` 지원) |
| POST | `/api/sweeps/manual` | 수동 집금 (`{ "contract", "address", "dryRun" }`) |
| POST | `/api/watcher/scan` | 입금 블록 스캔 1회 실행 (`{ "dryRun", "maxBlocks" }`). 다른 스캔이 돌면 `skipped: true` |
| GET | `/api/transactions` | 입금·집금 내역 (`limit`, `userWalletId`, `type`, `contract`) |
| GET | `/api/contracts` | 등록된 자산 목록 |

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
│  ├─ user-wallets/        # 입금주소 발급/조회 (user_wallet, user_wallet_balance)
│  ├─ sweep/               # 집금 로직
│  ├─ transactions/        # 입금·집금 기록 (transactions 테이블)
│  ├─ contracts/           # 자산 레지스트리 (contract 테이블)
│  └─ watcher/             # 블록 스캔 → deposit_amount 반영 (chain_scan_state 커서)
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
