export interface AppConfig {
  nodeEnv: string;
  port: number;
  trustProxy: number;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    logging: boolean;
  };
  session: {
    secret: string;
    name: string;
    maxAge: number;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    pruneInterval: number;
  };
  cors: {
    origins: string[];
  };
  throttle: {
    ttl: number;
    limit: number;
  };
  swagger: {
    enabled: boolean;
    path: string;
  };
  tron: {
    fullHost: string;
    apiKey: string;
    mnemonic: string;
    hdPath: string;
    mainIndex: number;
    tokenContract: string;
    feeStrategy: 'delegate' | 'transfer';
    delegateEnergy: number;
    feeFallback: boolean;
    gasTopupSun: number;
    bandwidthTopupSun: number;
    activationSun: number;
    minSweepToken: number;
    feeLimitSun: number;
  };
  scan: {
    confirmLagMs: number;
    pageLimit: number;
    staleRunMs: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  trustProxy: parseInt(process.env.TRUST_PROXY ?? '0', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'coin_sweep',
    logging: process.env.DB_LOGGING === 'true',
  },
  session: {
    secret: process.env.SESSION_SECRET ?? 'change-me',
    name: process.env.SESSION_NAME ?? 'sid',
    maxAge: parseInt(process.env.SESSION_MAX_AGE ?? '86400000', 10),
    secure: process.env.SESSION_SECURE === 'true',
    sameSite: (process.env.SESSION_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none',
    pruneInterval: parseInt(process.env.SESSION_PRUNE_INTERVAL ?? '3600000', 10),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED
      ? process.env.SWAGGER_ENABLED === 'true'
      : process.env.NODE_ENV !== 'production',
    path: process.env.SWAGGER_PATH ?? 'api/docs',
  },
  tron: {
    fullHost: process.env.TRON_FULL_HOST ?? 'https://nile.trongrid.io',
    apiKey: process.env.TRON_API_KEY ?? '',
    mnemonic: process.env.TRON_MNEMONIC ?? '',
    hdPath: process.env.TRON_HD_PATH ?? "m/44'/195'/0'/0",
    mainIndex: parseInt(process.env.TRON_MAIN_INDEX ?? '0', 10),
    tokenContract: process.env.TRON_TOKEN_CONTRACT ?? '',
    feeStrategy: (process.env.TRON_FEE_STRATEGY ?? 'delegate') as 'delegate' | 'transfer',
    delegateEnergy: parseInt(process.env.TRON_DELEGATE_ENERGY ?? '40000', 10),
    feeFallback: (process.env.TRON_FEE_FALLBACK ?? 'true') === 'true',
    gasTopupSun: parseInt(process.env.TRON_GAS_TOPUP_SUN ?? '15000000', 10),
    bandwidthTopupSun: parseInt(process.env.TRON_BANDWIDTH_TOPUP_SUN ?? '500000', 10),
    activationSun: parseInt(process.env.TRON_ACTIVATION_SUN ?? '100000', 10),
    minSweepToken: parseInt(process.env.TRON_MIN_SWEEP_TOKEN ?? '5000000', 10),
    feeLimitSun: parseInt(process.env.TRON_FEE_LIMIT_SUN ?? '100000000', 10),
  },
  scan: {
    confirmLagMs: parseInt(process.env.SCAN_CONFIRM_LAG_MS ?? '60000', 10),
    pageLimit: parseInt(process.env.SCAN_PAGE_LIMIT ?? '200', 10),
    staleRunMs: parseInt(process.env.SCAN_STALE_RUN_MS ?? '600000', 10),
  },
});
