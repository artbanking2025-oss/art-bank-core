/**
 * API v1 Routes (Legacy)
 * 
 * Deprecated version maintained for backward compatibility
 * Sunset date: 2026-12-31
 * 
 * Differences from v2:
 * - snake_case response format (v2 uses camelCase)
 * - Simplified error responses
 * - No structured logging headers
 * - Limited rate limiting (60 req/min for all)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';
import { transformResponse, API_VERSIONS } from '../middleware/versioning';

const v1Routes = new Hono<{ Bindings: Env }>();

// V1 Nodes endpoints (snake_case responses)
v1Routes.get('/nodes', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const nodes = await db.getAllNodes();
    const transformed = transformResponse(nodes, API_VERSIONS.V1);
    
    return c.json(transformed);
  } catch (error: any) {
    // V1 simple error format
    return c.json({ error: 'Failed to fetch nodes' }, 500);
  }
});

v1Routes.get('/nodes/:id', async (c) => {
  const id = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const node = await db.getNode(id);
    if (!node) {
      return c.json({ error: 'Node not found' }, 404);
    }
    
    const transformed = transformResponse(node, API_VERSIONS.V1);
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch node' }, 500);
  }
});

// V1 Artworks endpoints
v1Routes.get('/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artworks = await db.getAllArtworks();
    const transformed = transformResponse(artworks, API_VERSIONS.V1);
    
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch artworks' }, 500);
  }
});

v1Routes.get('/artworks/:id', async (c) => {
  const id = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artwork = await db.getArtwork(id);
    if (!artwork) {
      return c.json({ error: 'Artwork not found' }, 404);
    }
    
    const transformed = transformResponse(artwork, API_VERSIONS.V1);
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch artwork' }, 500);
  }
});

// V1 Graph data (simplified)
v1Routes.get('/graph-data', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const graphData = await db.getGraphData();
    const transformed = transformResponse(graphData, API_VERSIONS.V1);
    
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch graph data' }, 500);
  }
});

// V1 Dashboard stats (simplified)
v1Routes.get('/dashboard/stats', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const stats = await db.getDashboardStats();
    const transformed = transformResponse(stats, API_VERSIONS.V1);
    
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// V1 version info
v1Routes.get('/version', (c) => {
  return c.json({
    version: 'v1',
    status: 'deprecated',
    sunset_date: '2026-12-31',
    message: 'This API version is deprecated. Please migrate to v2.',
    migration_guide: '/docs/migration/v1-to-v2',
    successor: 'v2'
  });
});

export default v1Routes;
