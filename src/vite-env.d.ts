/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_ADMIN_EMAILS: string;
  readonly VITE_GOOGLE_MANAGER_EMAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
