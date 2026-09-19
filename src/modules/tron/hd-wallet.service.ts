import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TronWeb } from 'tronweb';

export interface DerivedWallet {
  index: number;
  address: string;
  privateKey: string;
}

@Injectable()
export class HdWalletService implements OnModuleInit {
  private readonly mnemonic: string;
  private readonly basePath: string;
  private readonly mainIndex: number;

  constructor(private readonly config: ConfigService) {
    this.mnemonic = this.config.get<string>('tron.mnemonic')!;
    this.basePath = this.config.get<string>('tron.hdPath')!;
    this.mainIndex = this.config.get<number>('tron.mainIndex')!;
  }

  onModuleInit(): void {
    this.derive(this.mainIndex);
  }

  derive(index: number): DerivedWallet {
    const account = TronWeb.fromMnemonic(this.mnemonic, `${this.basePath}/${index}`);
    return {
      index,
      address: account.address,
      privateKey: account.privateKey.replace(/^0x/, ''),
    };
  }

  getMain(): DerivedWallet {
    return this.derive(this.mainIndex);
  }

  isMainIndex(index: number): boolean {
    return index === this.mainIndex;
  }
}
