import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { ContractsService } from './contracts.service';
import { ContractResponseDto } from './dto/contract.dto';

@ApiTags('contracts')
@ApiCookieAuth(SESSION_AUTH)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @ApiOperation({
    summary: '등록된 자산 목록',
    description:
      '입금·집금 이력이 FK 로 가리키는 자산 행들. 네이티브 TRX 도 address 가 null 인 한 행으로 들어 있다. ' +
      'lastScannedBlock 이 null 이 아닌 행이 입금 블록 스캔 대상이고, 네이티브가 아닌 활성 행이 ' +
      '자동 집금 대상이다.',
  })
  @ApiOkResponse({ type: [ContractResponseDto] })
  async findAll(): Promise<ContractResponseDto[]> {
    const rows = await this.contracts.findAll();
    return rows.map((row) => ContractResponseDto.from(row));
  }
}
