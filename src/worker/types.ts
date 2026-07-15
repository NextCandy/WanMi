export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_EMAIL: string;
  BOOTSTRAP_ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface AuthUser {
  id: number;
  email: string;
  sessionId: string;
  csrfTokenHash: string;
  passwordVersion: number;
}

export interface AppVariables {
  authUser: AuthUser;
}

export type AppBindings = { Bindings: Env; Variables: AppVariables };
