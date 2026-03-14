/**
 * Gallery-specific API routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const gallery = new Hono<{ Bindings: Env }>();

// Gallery profile with represented artists
gallery.get('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const galleryId = c.req.param('id');
  
  const node = await db.getNode(galleryId);
  if (!node || node.node_type !== 'gallery') {
    return c.json({ error: 'Gallery not found' }, 404);
  }
  
  // Get gallery exhibitions
  const exhibitions = await db.getExhibitionsByGallery(galleryId);
  
  return c.json({
    profile: node,
    exhibitions,
    stats: {
      total_exhibitions: exhibitions.length,
      trust_level: node.trust_level
    }
  });
});

// Get gallery's current and upcoming exhibitions
gallery.get('/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const galleryId = c.req.query('gallery_id');
  
  if (!galleryId) {
    return c.json({ error: 'gallery_id required' }, 400);
  }
  
  const exhibitions = await db.getExhibitionsByGallery(galleryId);
  return c.json({ exhibitions });
});

// Create new exhibition
gallery.post('/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const exhibition = await db.addExhibition(data);
    return c.json({ exhibition }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default gallery;
