import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { ContractsService } from '../contracts/contracts.service';
import { TronService } from '../tron/tron.service';
import { UserWalletsService } from './user-wallets.service';
import { CreateUserWalletRequestDto } from './dto/create-user-wallet.request.dto';
import {
  ChainTokenBalanceResponseDto,
  UserWalletChainBalanceResponseDto,
  UserWalletResponseDto,
} from './dto/user-wallet.response.dto';
import { formatUnits } from './units';

@ApiTags('user-wallets')
@ApiCookieAuth(SESSION_AUTH)
@Controller('user-wallets')
export class UserWalletsController {
  constructor(
    private readonly deposits: UserWalletsService,
    private readonly contracts: ContractsService,
    private readonly tron: TronService,
  ) {}

  @Post()
  @ApiOperation({ summary: '입금주소 발급', description: '다음 HD 인덱스로 EOA 를 하나 발급한다.' })
  @ApiCreatedResponse({ type: UserWalletResponseDto })
  async create(@Body() dto: CreateUserWalletRequestDto): Promise<UserWalletResponseDto> {
    const [created, activeTokens] = await Promise.all([
      this.deposits.issue(dto.userRef),
      this.contracts.findActiveTokens(),
    ]);
    return UserWalletResponseDto.from(created, [], activeTokens);
  }

  @Get()
  @ApiOperation({
    summary: '입금주소 목록',
    description: 'DB 가 들고 있는 자산별 잔고를 함께 돌려준다. 체인 조회는 하지 않는다.',
  })
  @ApiOkResponse({ type: [UserWalletResponseDto] })
  async findAll(): Promise<UserWalletResponseDto[]> {
    const [rows, activeTokens] = await Promise.all([
      this.deposits.findAll(),
      this.contracts.findActiveTokens(),
    ]);
    const balances = await this.deposits.findBalanceMap(rows.map((row) => row.id));
    return rows.map((row) =>
      UserWalletResponseDto.from(row, balances.get(row.id) ?? [], activeTokens),
    );
  }

  @Get(':id/balance')
  @ApiOperation({
    summary: '입금주소 체인 실잔액',
    description:
      'TRX 와 등록된 TRC20 전부의 잔액을 체인에서 직접 읽는다. 비활성 컨트랙트도 포함하므로 ' +
      '감시에서 뺀 토큰이 남아 있어도 보인다. DB 잔고는 목록 API 의 balances 를 보면 된다.',
  })
  @ApiOkResponse({ type: UserWalletChainBalanceResponseDto })
  async balance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserWalletChainBalanceResponseDto> {
    const [deposit, tokens] = await Promise.all([
      this.deposits.findByIdOrFail(id),
      this.contracts.findTokens(),
    ]);

    const [trxSun, balances] = await Promise.all([
      this.tron.getTrxBalance(deposit.address),
      Promise.all(
        tokens.map((token) => this.tron.getTokenBalance(deposit.address, token.address!)),
      ),
    ]);

    const views: ChainTokenBalanceResponseDto[] = tokens.map((token, index) => ({
      contractId: token.id,
      contract: token.address!,
      symbol: token.symbol,
      decimals: token.decimals,
      raw: balances[index].toString(),
      formatted: formatUnits(balances[index], token.decimals),
      isActive: token.isActive,
    }));

    return {
      address: deposit.address,
      trxSun: trxSun.toString(),
      trx: formatUnits(trxSun, 6),
      tokens: views,
    };
  }
}
