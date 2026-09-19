import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  TRUST_PROXY: Joi.number().min(0).default(0),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_LOGGING: Joi.boolean().default(false),

  SESSION_SECRET: Joi.string().min(16).required(),
  SESSION_NAME: Joi.string().default('sid'),
  SESSION_MAX_AGE: Joi.number().default(86400000),
  SESSION_SECURE: Joi.boolean().default(false),
  SESSION_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  SESSION_PRUNE_INTERVAL: Joi.number().default(3600000),

  SWAGGER_ENABLED: Joi.boolean(),
  SWAGGER_PATH: Joi.string().default('api/docs'),

  CORS_ORIGINS: Joi.string().allow('').default(''),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(120),

  TRON_FULL_HOST: Joi.string().uri().default('https://nile.trongrid.io'),
  TRON_API_KEY: Joi.string().allow('').default(''),
  TRON_MNEMONIC: Joi.string().required(),
  TRON_HD_PATH: Joi.string().default("m/44'/195'/0'/0"),
  TRON_MAIN_INDEX: Joi.number().min(0).default(0),
  TRON_TOKEN_CONTRACT: Joi.string().required(),
  TRON_FEE_STRATEGY: Joi.string().valid('delegate', 'transfer').default('delegate'),
  TRON_DELEGATE_ENERGY: Joi.number().default(40000),
  TRON_FEE_FALLBACK: Joi.boolean().default(true),
  TRON_GAS_TOPUP_SUN: Joi.number().default(15000000),
  TRON_BANDWIDTH_TOPUP_SUN: Joi.number().default(500000),
  TRON_ACTIVATION_SUN: Joi.number().default(100000),
  TRON_MIN_SWEEP_TOKEN: Joi.number().default(5000000),
  TRON_FEE_LIMIT_SUN: Joi.number().default(100000000),
});
