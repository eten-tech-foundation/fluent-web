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
  YOUVERSION_API_URL: z.string().url({
    message: 'YOUVERSION_API_URL must be a valid URL (include http:// or https://)',
  }),
  YOUVERSION_API_KEY: z.string().min(1, {
    message: 'YOUVERSION_API_KEY is required',
  }),
  // Rich text editing in the pericope view (#314). Off by default: paragraph breaks the editor
  // lets translators author cannot be persisted yet (fluent-api#263). The preprocess reads an
  // empty value as unset, which this key needs and the other optional one does not: `z.enum`
  // rejects `''` and would fail startup over a flag left blank, while an optional string simply
  // takes it. An unset flag must never block the app from booting.
  RTE_PERICOPE: z.preprocess(
    value => (value === '' ? undefined : value),
    z.enum(['true', 'false']).optional()
  ),
  // The USFM import tab on project creation (#418). Off by default: the tab can validate
  // files, but nothing can create a project out of them until #419 lands, so a visible tab
  // would dead-end. Same preprocess as RTE_PERICOPE — a blank value has to read as unset
  // rather than stop the app booting.
  USFM_IMPORT: z.preprocess(
    value => (value === '' ? undefined : value),
    z.enum(['true', 'false']).optional()
  ),
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
  YOUVERSION_API_URL: import.meta.env.VITE_YOUVERSION_API_URL as string,
  YOUVERSION_API_KEY: import.meta.env.VITE_YOUVERSION_API_KEY as string,
  BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL as string,
  RTE_PERICOPE: import.meta.env.VITE_RTE_PERICOPE as string | undefined,
  USFM_IMPORT: import.meta.env.VITE_USFM_IMPORT as string | undefined,
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
    youversion_url: validatedEnv.YOUVERSION_API_URL,
    aquifer_key: validatedEnv.AQUIFER_API_KEY,
    youversion_key: validatedEnv.YOUVERSION_API_KEY,
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

  features: {
    /** Rich text editing in the pericope view instead of per-verse textareas (#314). */
    rtePericope: validatedEnv.RTE_PERICOPE === 'true',
    /** The USFM import tab on the project creation dialog (#418). */
    usfmImport: validatedEnv.USFM_IMPORT === 'true',
  },
};

// Returns headers required for Aquifer API requests
export const getApiHeaders = (): HeadersInit => {
  return {
    'api-key': config.api.aquifer_key,
  };
};

// Returns headers required for YouVersion API requests
export const getYouVersionApiHeaders = (): HeadersInit => {
  return {
    'x-yvp-app-key': config.api.youversion_key,
  };
};
