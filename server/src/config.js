import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(ROOT, '.env') });

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://sapmon:sapmon@localhost:5433/sap_monitoring',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  excelPath: path.resolve(ROOT, process.env.EXCEL_PATH || 'ERP Monitoring Log.xlsx'),

  // Scheduled SAP collector. Every value is defaulted so the app still starts
  // with no .env present; an unset base URL simply means that system is skipped.
  sap: {
    enabled: process.env.SAP_ENABLED === 'true',
    cron: process.env.SAP_COLLECT_CRON || '*/15 * * * *',
    timeoutMs: Number(process.env.SAP_REQUEST_TIMEOUT_MS || 15000),
    retries: Number(process.env.SAP_RETRIES || 1),
    authMode: process.env.SAP_AUTH_MODE || 'none', // none | basic | bearer
    username: process.env.SAP_USERNAME || '',
    password: process.env.SAP_PASSWORD || '',
    token: process.env.SAP_TOKEN || '',
    // TODO(SAP): fill in once the real API hosts are known. Keys match systems.sid.
    baseUrls: {
      MSP: process.env.SAP_BASE_URL_MSP || '',
      MSD: process.env.SAP_BASE_URL_MSD || '',
      MGP: process.env.SAP_BASE_URL_MGP || '',
      SPA: process.env.SAP_BASE_URL_SPA || '',
      BIPROD: process.env.SAP_BASE_URL_BIPROD || '',
      FIORI: process.env.SAP_BASE_URL_FIORI || '',
      WEBDISP: process.env.SAP_BASE_URL_WEBDISP || '',
    },
  },

  // Batch Job Monitor: separate Python/FastAPI process (batch-monitor-backend/),
  // reverse-proxied under /api/batch so the browser only ever talks to this API.
  batchMonitorUrl: process.env.BATCH_MONITOR_URL || 'http://127.0.0.1:8000',
};
