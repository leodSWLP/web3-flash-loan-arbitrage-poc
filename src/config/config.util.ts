import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();
export class ConfigUtil {
  private static envSchema = z.object({
    BSC_RPC_URL: z
      .string()
      .url('BSC_RPC_URL must be a valid URL')
      .nonempty('BSC_RPC_URL is required'),
    BLOCK_NUMBER: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || (Number.isInteger(val) && val >= 0),
        {
          message: 'BLOCK_NUMBER must be a non-negative integer or empty',
        },
      ),
    BSC_SCAN_API_KEY: z.string().optional(),
    WALLET_PRIVATE_KEY: z
      .string()
      .nonempty('WALLET_PRIVATE_KEY is required')
      .regex(
        /^0x[0-9a-fA-F]{64}$/,
        'WALLET_PRIVATE_KEY must be a valid 32-byte hex string starting with 0x',
      ),
    REDIS_HOST: z
      .string()
      .nonempty('REDIS_HOST is required')
      .default('127.0.0.1'),
    REDIS_PORT: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => Number.isInteger(val) && val > 0 && val <= 65535, {
        message: 'REDIS_PORT must be a valid port number between 1 and 65535',
      })
      .default('6379'),
    REDIS_USERNAME: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    MONGO_URI: z
      .string()
      .url('MONGO_URI must be a valid MongoDB connection URL')
      .nonempty('MONGO_URI is required'),
    SUBGRAPH_API_KEY: z.string().optional(),
    AAVE_FLASH_LOAN_ADDRESS: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (val) => val !== undefined && /^0x[0-9a-fA-F]{40}$/.test(val),
        'AAVE_FLASH_LOAN_ADDRESS must be a valid Ethereum address',
      ),
    QUOTE_ADDRESS: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (val) => val === undefined || /^0x[0-9a-fA-F]{40}$/.test(val),
        'QUOTE_ADDRESS must be a valid Ethereum address or undefined',
      ),
    V3_QUOTER_ADDRESS: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (val) => val === undefined || /^0x[0-9a-fA-F]{40}$/.test(val),
        'V3_QUOTER_ADDRESS must be a valid Ethereum address or undefined',
      ),
    V3_ARBITRAGE_QUOTER_ADDRESS: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (val) => val === undefined || /^0x[0-9a-fA-F]{40}$/.test(val),
        'V3_ARBITRAGE_QUOTER_ADDRESS must be a valid Ethereum address or undefined',
      ),
    DEBUG: z.enum(['', 'true', 'false']).transform((v) => v === 'true'),
  });

  private static config: z.infer<typeof ConfigUtil.envSchema> | null = null;

  static getConfig(
    env?: Record<string, string | undefined>,
  ): z.infer<typeof ConfigUtil.envSchema> {
    if (ConfigUtil.config) {
      return ConfigUtil.config;
    }

    const envToParse = env ?? process.env;

    try {
      ConfigUtil.config = ConfigUtil.envSchema.parse(envToParse);
      return ConfigUtil.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Environment variable validation errors:');
        error.errors.forEach((err) => {
          console.error(`- ${err.path.join('.')}: ${err.message}`);
        });
      }
      throw new Error('Failed to validate environment variables');
    }
  }
}
