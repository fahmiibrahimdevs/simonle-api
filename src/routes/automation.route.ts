import { Hono } from 'hono';
import { dbQueries } from '../db/queries';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

export const automationRoutes = new Hono();

/**
 * GET /api/automation/cycles
 * Retrieve automation cycles and nested logs
 */
automationRoutes.get('/cycles', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const date = c.req.query('date');

    const result = await dbQueries.getAutomationCycles(limit, offset, date);

    return c.json<ApiResponse>({
      success: true,
      message: 'Automation cycles retrieved',
      data: result.data,
      meta: result.meta,
    });
  } catch (error: any) {
    logger.error('Failed to get automation cycles', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to retrieve automation cycles',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * POST /api/automation/cycles
 * Receive manual or webhook automation state sync
 */
automationRoutes.post('/cycles', async (c) => {
  try {
    const body = await c.req.json();
    await dbQueries.saveAutomationCycleState(body);

    return c.json<ApiResponse>({
      success: true,
      message: 'Automation cycle state synced successfully',
    });
  } catch (error: any) {
    logger.error('Failed to sync automation cycle state', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to sync automation cycle',
        error: error.message || String(error),
      },
      500
    );
  }
});
