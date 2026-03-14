/**
 * Expert-specific API routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const expert = new Hono<{ Bindings: Env }>();

// Expert profile with validation history
expert.get('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const expertId = c.req.param('id');
  
  const node = await db.getNode(expertId);
  if (!node || node.node_type !== 'expert') {
    return c.json({ error: 'Expert not found' }, 404);
  }
  
  const validations = await db.getValidationsByExpert(expertId);
  
  return c.json({
    profile: node,
    validations,
    stats: {
      total_validations: validations.length,
      trust_level: node.trust_level
    }
  });
});

// Get pending validation requests
expert.get('/requests', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const expertId = c.req.query('expert_id');
  
  // TODO: Implement validation request queue
  return c.json({ requests: [] });
});

// Submit validation result
expert.post('/validations', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const validation = await db.createValidation(data);
    
    // Create edge: Expert -> Artwork
    await db.createEdge({
      from_node_id: data.expert_node_id,
      to_node_id: data.artwork_id,
      edge_type: 'validated',
      weight: data.confidence_level || 0.8
    });
    
    return c.json({ validation }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default expert;
