import { z } from 'zod';

/**
 * Define and validate environment variables schema
 */
const envSchema = z.object({
  API_URL: z.string().url({
    message: 'API_URL must be a valid URL (include http:// or https://)',
  }),
  AQUIFER_API_URL: z.string().url({
    message: 'AQUIFER_API_URL must be a valid URL (include http:// or https://)',
  }),
  ENVIRONMENT: z.enum(['local', 'development', 'staging', 'production'], {
    errorMap: () => ({
      message: 'ENVIRONMENT must be one of: local, development, staging, production',
    }),
  }),
  APPINSIGHTS_CONNECTION_STRING: z.string().optional(),
  AQUIFER_API_KEY: z.string().min(1, {
    message: 'AQUIFER_API_KEY is required',
  }),
  BETTER_AUTH_URL: z.string().url({
    message: 'BETTER_AUTH_URL must be a valid URL',
  }),
});

type Env = z.infer<typeof envSchema>;

/**
 * Access Vite's environment variables in a type-safe way
 */
const processEnv = {
  API_URL: import.meta.env.VITE_API_URL as string,
  AQUIFER_API_URL: import.meta.env.VITE_AQUIFER_API_URL as string,
  ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT as string,
  APPINSIGHTS_CONNECTION_STRING: import.meta.env.VITE_APP_INSIGHTS_CONNECTION_STRING as string,
  AQUIFER_API_KEY: import.meta.env.VITE_AQUIFER_API_KEY as string,
  BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL as string,
};

/**
 * Validate environment variables
 */
function validateEnv(): Env {
  try {
    return envSchema.parse(processEnv);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map(err => {
          return `- ${err.path.join('.')}: ${err.message}`;
        })
        .join('\n');
      console.error('❌ Invalid environment variables:');

      console.error(errorMessages);

      console.error('\nPlease check your .env file and update the required variables.');
    }
    throw new Error('Invalid environment configuration');
  }
}

const validatedEnv = validateEnv();

/**
 * Application configuration derived from environment variables
 */
export const config = {
  api: {
    url: validatedEnv.API_URL,
    aquifer_url: validatedEnv.AQUIFER_API_URL,
    aquifer_key: validatedEnv.AQUIFER_API_KEY,
    auth_url: validatedEnv.BETTER_AUTH_URL,
  },
  environment: {
    current: validatedEnv.ENVIRONMENT,
    isDevelopment:
      validatedEnv.ENVIRONMENT === 'development' || validatedEnv.ENVIRONMENT === 'local',
    isProduction: validatedEnv.ENVIRONMENT === 'production',
    isStaging: validatedEnv.ENVIRONMENT === 'staging',
  },

  monitoring: {
    appInsightsConnectionString: validatedEnv.APPINSIGHTS_CONNECTION_STRING,
  },
};

// Returns headers required for Aquifer API requests
export const getApiHeaders = (): HeadersInit => {
  return {
    'api-key': config.api.aquifer_key,
  };
};
