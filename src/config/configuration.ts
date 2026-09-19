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
});
