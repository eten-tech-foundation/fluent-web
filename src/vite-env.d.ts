/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENVIRONMENT: 'local' | 'development' | 'staging' | 'production';
  readonly VITE_APP_INSIGHTS_CONNECTION_STRING?: string;
  readonly VITE_RTE_PERICOPE?: 'true' | 'false';
  readonly VITE_USFM_IMPORT?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly API_URL: string;
  readonly ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_VERSION__: string;
