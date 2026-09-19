import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { TronService } from '../tron/tron.service';
import { UserWalletsService } from './user-wallets.service';
import { CreateUserWalletRequestDto } from './dto/create-user-wallet.request.dto';
import {
  UserWalletBalanceResponseDto,
  UserWalletResponseDto,
} from './dto/user-wallet.response.dto';
import { formatUnits } from './units';

@ApiTags('user-wallets')
@ApiCookieAuth(SESSION_AUTH)
@Controller('user-wallets')
export class UserWalletsController {
  constructor(
    private readonly deposits: UserWalletsService,
    private readonly tron: TronService,
  ) {}

  @Post()
  @ApiOperation({ summary: '입금주소 발급', description: '다음 HD 인덱스로 EOA 를 하나 발급한다.' })
  @ApiCreatedResponse({ type: UserWalletResponseDto })
  async create(@Body() dto: CreateUserWalletRequestDto): Promise<UserWalletResponseDto> {
    const [created, token] = await Promise.all([
      this.deposits.issue(dto.userRef),
      this.tron.getTokenMeta(),
    ]);
    return UserWalletResponseDto.from(created, token);
  }

  @Get()
  @ApiOperation({ summary: '입금주소 목록' })
  @ApiOkResponse({ type: [UserWalletResponseDto] })
  async findAll(): Promise<UserWalletResponseDto[]> {
    const [rows, token] = await Promise.all([this.deposits.findAll(), this.tron.getTokenMeta()]);
    return rows.map((row) => UserWalletResponseDto.from(row, token));
  }

  @Get(':id/balance')
  @ApiOperation({ summary: '입금주소 잔액 조회', description: '체인에서 직접 읽는다.' })
  @ApiOkResponse({ type: UserWalletBalanceResponseDto })
  async balance(@Param('id', ParseUUIDPipe) id: string): Promise<UserWalletBalanceResponseDto> {
    const deposit = await this.deposits.findByIdOrFail(id);
    const [balance, meta] = await Promise.all([
      this.deposits.getBalance(deposit.address),
      this.tron.getTokenMeta(),
    ]);

    return {
      address: balance.address,
      trxSun: balance.trxSun.toString(),
      trx: formatUnits(balance.trxSun, 6),
      tokenRaw: balance.token.toString(),
      token: formatUnits(balance.token, meta.decimals),
      tokenSymbol: meta.symbol,
    };
  }
}
