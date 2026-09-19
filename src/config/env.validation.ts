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
});
