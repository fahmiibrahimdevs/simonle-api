/**
 * SIMONLE Backend Main Application Entry Point
 * Powered by Bun & Hono Framework
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { ENV } from './config/env';
import { logger } from './utils/logger';
import { testDatabaseConnection } from './config/database';
import { mqttService } from './services/mqtt.service';
import { cacheService } from './services/cache.service';
import { dbQueries } from './db/queries';
import { sendTelegramNotification } from './services/telegram.service';

// Routes
import { sensorRoutes } from './routes/sensor.route';
import { actuatorRoutes } from './routes/actuator.route';
import { automationRoutes } from './routes/automation.route';
import { alertRoutes } from './routes/alert.route';
import { configRoutes } from './routes/config.route';

const app = new Hono();

// ==========================================
// 1. MIDDLEWARES (CORS & Request Logging)
// ==========================================
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(`HTTP ${c.req.method} ${c.req.path} -> ${c.res.status} (${ms}ms)`);
});

// ==========================================
// 2. HEALTHCHECK & METRICS
// ==========================================
app.get('/health', (c) => {
  const mqttStatus = cacheService.isMqttConnected();
  const telemetry = cacheService.getLatestTelemetry();

  return c.json({
    status: 'ok',
    service: 'SIMONLE Backend Engine',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mqtt: {
      connected: mqttStatus,
      last_telemetry: telemetry.last_updated,
      is_sensor_online: telemetry.is_online,
    },
  });
});

// ==========================================
// 3. MOUNT API ROUTES
// ==========================================
app.route('/api/sensors', sensorRoutes);
app.route('/api/actuators', actuatorRoutes);
app.route('/api/automation', automationRoutes);
app.route('/api/alerts', alertRoutes);
app.route('/api/config', configRoutes);

// System Backup Alias Direct
app.get('/api/system/backup', (c) => c.redirect('/api/config/backup'));

// 404 Handler
app.notFound((c) => {
  return c.json({ success: false, message: `Route ${c.req.path} not found` }, 404);
});

// Global Error Handler
app.onError((err, c) => {
  logger.error('Unhandled Application Error', err);
  return c.json(
    {
      success: false,
      message: 'Internal Server Error',
      error: ENV.NODE_ENV === 'development' ? err.message : undefined,
    },
    500
  );
});

// ==========================================
// 4. BOOTSTRAP SERVICES
// ==========================================
async function bootstrapServices() {
  logger.info('==================================================');
  logger.info('     STARTING SIMONLE BACKEND REST API SERVICE    ');
  logger.info('==================================================');

  // 1. Connect to PostgreSQL
  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    logger.error('Database connection failed on startup. Exiting...');
    process.exit(1);
  }

  // 2. Pre-warm Configuration Cache
  try {
    const config = await dbQueries.getSystemConfig();
    cacheService.setActiveConfig(config);
    logger.info('Active system configuration loaded into RAM Cache.');
  } catch (error) {
    logger.error('Failed to pre-warm configuration cache', error);
  }

  // 3. Connect to MQTT Broker & Workers
  mqttService.init();

  // 4. Send Startup / Restart Notification to Telegram
  const wibTime = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const startMsg = [
    '🚀 <b>SIMONLE Backend Service Online</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '🖥️ <b>Server:</b> VPS (139.190.96.208)',
    `🕒 <b>Waktu:</b> ${wibTime}`,
    '🗄️ <b>Database:</b> PostgreSQL 16 (simonle_db) OK',
    '📡 <b>MQTT:</b> Connected (103.197.188.199:1883)',
    '🌐 <b>URL:</b> https://simonle.fahmiibrahim.my.id',
    '✅ <b>Status:</b> Service Berhasil Di-start / Restart',
  ].join('\n');

  sendTelegramNotification(startMsg).catch((e) => {
    logger.warn('Failed to send Telegram startup notification', e);
  });

  // 5. If running in Node.js (without Bun native server)
  if (typeof (globalThis as any).Bun === 'undefined') {
    serve(
      {
        fetch: app.fetch,
        port: ENV.PORT,
      },
      (info) => {
        logger.info(`SIMONLE Hono Server running on Node.js at http://0.0.0.0:${info.port}`);
      }
    );
  } else {
    logger.info(`SIMONLE Hono Server running on Bun at http://0.0.0.0:${ENV.PORT}`);
  }
}

// Execute bootstrap
bootstrapServices().catch((err) => {
  logger.error('Fatal error during startup bootstrap', err);
  process.exit(1);
});

// Export for Bun native HTTP server
export default {
  port: ENV.PORT,
  fetch: app.fetch,
};
