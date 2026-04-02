/**
 * Dashboard API Routes
 * 
 * Public dashboard endpoints for statistics and graph visualization:
 * - Graph data (nodes + edges for visualization)
 * - Dashboard statistics (aggregated counts and metrics)
 * - Dashboard graph (optimized for frontend rendering)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';
import { optionalAuthMiddleware } from '../middleware/auth-middleware';
import { cacheGraph, cacheStats } from '../middleware/cache';
import { getLogger } from '../middleware/logger';

const dashboardRoutes = new Hono<{ Bindings: Env }>();

// ===== GRAPH DATA API =====

dashboardRoutes.get('/graph-data', optionalAuthMiddleware, cacheGraph, async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const graphData = await db.getGraphData();
    logger.info('Graph data fetched', { 
      nodes: graphData.nodes?.length || 0, 
      edges: graphData.edges?.length || 0 
    });
    return c.json(graphData);
  } catch (error: any) {
    logger.error('Failed to fetch graph data', error);
    return c.json({ error: 'Failed to fetch graph data' }, 500);
  }
});

// ===== DASHBOARD STATISTICS =====

dashboardRoutes.get('/dashboard/stats', cacheStats, async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const stats = await db.getDashboardStats();
    logger.info('Dashboard stats fetched', stats);
    return c.json(stats);
  } catch (error: any) {
    logger.error('Failed to fetch dashboard stats', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// ===== DASHBOARD GRAPH (Optimized) =====

dashboardRoutes.get('/dashboard/graph', cacheStats, async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const graphData = await db.getGraphData();
    logger.info('Dashboard graph fetched', { 
      nodes: graphData.nodes?.length || 0, 
      edges: graphData.edges?.length || 0 
    });
    return c.json(graphData);
  } catch (error: any) {
    logger.error('Failed to fetch dashboard graph', error);
    return c.json({ error: 'Failed to fetch graph' }, 500);
  }
});

export default dashboardRoutes;
