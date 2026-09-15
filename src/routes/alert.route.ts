import { Hono } from 'hono';
import { dbQueries } from '../db/queries';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

export const alertRoutes = new Hono();

/**
 * GET /api/alerts
 * Retrieve system alerts and notifications
 */
alertRoutes.get('/', async (c) => {
  try {
    const unreadOnly = c.req.query('unread_only') === 'true';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const result = await dbQueries.getSystemAlerts(unreadOnly, limit, offset);

    return c.json<ApiResponse>({
      success: true,
      message: 'System alerts retrieved',
      data: result.data,
      meta: result.meta,
    });
  } catch (error: any) {
    logger.error('Failed to get alerts', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to retrieve alerts',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * PATCH /api/alerts/:id/read
 * Mark single alert as read
 */
alertRoutes.patch('/:id/read', async (c) => {
  try {
    const id = c.req.param('id');
    const success = await dbQueries.markAlertAsRead(id);

    return c.json<ApiResponse>({
      success,
      message: success ? `Alert ${id} marked as read` : `Alert ${id} not found`,
    });
  } catch (error: any) {
    logger.error('Failed to mark alert as read', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to mark alert as read',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * PATCH /api/alerts/read-all
 * Mark all alerts as read
 */
alertRoutes.patch('/read-all', async (c) => {
  try {
    const success = await dbQueries.markAllAlertsAsRead();

    return c.json<ApiResponse>({
      success,
      message: 'All alerts marked as read',
    });
  } catch (error: any) {
    logger.error('Failed to mark all alerts as read', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to mark all alerts as read',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * POST /api/alerts
 * Manual creation of alert (e.g. testing)
 */
alertRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const alert = await dbQueries.insertSystemAlert(body);

    return c.json<ApiResponse>({
      success: true,
      message: 'Alert logged successfully',
      data: alert,
    });
  } catch (error: any) {
    logger.error('Failed to create alert', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to create alert',
        error: error.message || String(error),
      },
      500
    );
  }
});
