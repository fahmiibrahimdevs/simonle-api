import { Pool } from 'pg';
import { ENV } from './env';
import { logger } from '../utils/logger';

export const pool = new Pool({
  host: ENV.DB_HOST,
  port: ENV.DB_PORT,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  database: ENV.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', err);
});

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() as now, version() as version;');
    client.release();
    logger.info('Connected to PostgreSQL successfully!', {
      server_time: res.rows[0].now,
    });
    return true;
  } catch (error: any) {
    logger.error('Failed to connect to PostgreSQL database', error);
    return false;
  }
}
