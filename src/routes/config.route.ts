import { Hono } from 'hono';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { dbQueries } from '../db/queries';
import { cacheService } from '../services/cache.service';
import { mqttService } from '../services/mqtt.service';
import { logger } from '../utils/logger';
import { ApiResponse, SystemConfigEntity } from '../types';
import { ENV } from '../config/env';
import { pool } from '../config/database';

const execAsync = promisify(exec);

export const configRoutes = new Hono();

/**
 * GET /api/config
 * Retrieve active thresholds, timing, and offsets (with RAM cache)
 */
configRoutes.get('/', async (c) => {
  let config = cacheService.getActiveConfig();

  if (!config) {
    config = await dbQueries.getSystemConfig();
    if (config) {
      cacheService.setActiveConfig(config);
    }
  }

  return c.json<ApiResponse>({
    success: true,
    message: 'System configuration retrieved',
    data: config,
  });
});

/**
 * PUT /api/config
 * Update thresholds, timing, or calibration offsets.
 * Automatically saves to PostgreSQL, updates RAM cache, and publishes retained MQTT messages to NodeMCU.
 */
configRoutes.put('/', async (c) => {
  try {
    const body = await c.req.json<Partial<SystemConfigEntity>>();

    // 1. Update PostgreSQL Database
    const updatedConfig = await dbQueries.updateSystemConfig(body);

    // 2. Update RAM Cache
    cacheService.setActiveConfig(updatedConfig);

    // 3. Publish to MQTT Config Topics (retain = true)
    // Topic 1: Timing Config
    const timingPayload = {
      durasi_istirahat_sistem: updatedConfig.durasi_istirahat_sistem,
      durasi_pompa_on: updatedConfig.durasi_pompa_on,
      tambahan_waktu: updatedConfig.tambahan_waktu,
      max_perulangan: updatedConfig.max_perulangan,
    };
    mqttService.publish('simonle/demak/config/timing', timingPayload, true).catch((e) =>
      logger.error('Failed to publish timing config to MQTT', e)
    );

    // Topic 2: Threshold Config (Format expected by NodeMCU)
    const thresholdPayload = {
      temperature: {
        enabled_condition: updatedConfig.enable_temp,
        safe: [[updatedConfig.safe_temp_min, updatedConfig.safe_temp_max]],
      },
      tds: {
        enabled_condition: updatedConfig.enable_tds,
        safe: [[updatedConfig.safe_tds_min, updatedConfig.safe_tds_max]],
      },
      ph: {
        enabled_condition: updatedConfig.enable_ph,
        safe: [[updatedConfig.safe_ph_min, updatedConfig.safe_ph_max]],
      },
      water_level: {
        enabled_condition: updatedConfig.enable_wl,
        safe: [[updatedConfig.safe_wl_min, updatedConfig.safe_wl_max]],
        warning: [[updatedConfig.warn_wl_min, updatedConfig.warn_wl_max]],
        danger: [[updatedConfig.danger_wl_min, updatedConfig.danger_wl_max]],
      },
    };
    mqttService.publish('simonle/demak/config/treshold', thresholdPayload, true).catch((e) =>
      logger.error('Failed to publish threshold config to MQTT', e)
    );

    return c.json<ApiResponse>({
      success: true,
      message: 'System configuration updated successfully and synced to MQTT',
      data: updatedConfig,
    });
  } catch (error: any) {
    logger.error('Failed to update system configuration', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to update system configuration',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * GET /api/config/backup
 * Download full PostgreSQL Database Backup SQL dump (.sql)
 */
configRoutes.get('/backup', async (c) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `simonle_db_backup_${timestamp}.sql`;

    const cmd = `PGPASSWORD='${ENV.DB_PASSWORD}' pg_dump -h ${ENV.DB_HOST} -p ${ENV.DB_PORT} -U ${ENV.DB_USER} -d ${ENV.DB_NAME}`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 50 * 1024 * 1024,
    });

    c.header('Content-Type', 'application/sql; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(stdout);
  } catch (error: any) {
    logger.error('Failed to generate DB backup', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to generate database backup',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * POST /api/config/import
 * Multipart file upload to restore PostgreSQL database from .sql file
 */
configRoutes.post('/import', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || typeof file === 'string') {
      return c.json<ApiResponse>(
        {
          success: false,
          message: 'No valid SQL backup file uploaded',
        },
        400
      );
    }

    const tempDir = '/tmp';
    const tempFilePath = path.join(tempDir, `restore_${Date.now()}.sql`);

    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(tempFilePath, buffer);

    // Execute psql restore command
    const cmd = `PGPASSWORD='${ENV.DB_PASSWORD}' psql -h ${ENV.DB_HOST} -p ${ENV.DB_PORT} -U ${ENV.DB_USER} -d ${ENV.DB_NAME} -f ${tempFilePath}`;
    await execAsync(cmd);

    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (_) {}

    // Refresh active config cache
    const freshConfig = await dbQueries.getSystemConfig();
    cacheService.setActiveConfig(freshConfig);

    return c.json<ApiResponse>({
      success: true,
      message: 'Database restored successfully from SQL dump',
    });
  } catch (error: any) {
    logger.error('Failed to import database backup', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to restore database from backup file',
        error: error.message || String(error),
      },
      500
    );
  }
});
