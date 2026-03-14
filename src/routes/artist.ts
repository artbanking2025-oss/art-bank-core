/**
 * Artist-specific API routes
 * Интерфейс для художников
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const artist = new Hono<{ Bindings: Env }>();

// ========== ARTIST PROFILE ==========

// Get artist profile
artist.get('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.param('id');
  
  const node = await db.getNode(artistId);
  if (!node || node.node_type !== 'artist') {
    return c.json({ error: 'Artist not found' }, 404);
  }
  
  // Get artist's artworks
  const artworks = await db.getArtworksByArtist(artistId);
  
  // Get recent activity
  const activity = await db.getActivityByNode(artistId, 20);
  
  return c.json({
    profile: node,
    artworks,
    stats: {
      total_artworks: artworks.length,
      trust_level: node.trust_level
    },
    recent_activity: activity
  });
});

// Update artist profile
artist.patch('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.param('id');
  const data = await c.req.json();
  
  // TODO: Add authentication check
  
  try {
    await db.updateNode(artistId, data);
    await db.logActivity(artistId, 'profile_updated', { changes: Object.keys(data) });
    
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ========== ARTWORK MANAGEMENT ==========

// Get all artworks by artist
artist.get('/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  
  if (!artistId) {
    return c.json({ error: 'artist_id is required' }, 400);
  }
  
  const artworks = await db.getArtworksByArtist(artistId);
  return c.json({ artworks });
});

// Create new artwork
artist.post('/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    // Create artwork
    const artwork = await db.createArtwork(data);
    
    // Create edge: Artist -> Artwork
    await db.createEdge({
      from_node_id: data.artist_node_id,
      to_node_id: artwork.id,
      edge_type: 'created',
      weight: 1.0
    });
    
    // Add artist to artwork_artists junction table
    await db.addArtworkArtist(artwork.id, data.artist_node_id, 'primary', 100);
    
    // Log activity
    await db.logActivity(data.artist_node_id, 'artwork_created', {
      artwork_id: artwork.id,
      title: artwork.title
    });
    
    return c.json({ artwork }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Update artwork
artist.patch('/artworks/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  const data = await c.req.json();
  
  try {
    await db.updateArtwork(artworkId, data);
    
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ========== EXHIBITIONS & EVENTS ==========

// Get artist's exhibitions
artist.get('/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  
  if (!artistId) {
    return c.json({ error: 'artist_id is required' }, 400);
  }
  
  // Get all artworks by artist
  const artworks = await db.getArtworksByArtist(artistId);
  
  // Get exhibitions for each artwork
  const exhibitions = [];
  for (const artwork of artworks) {
    const artworkExhibitions = await db.getExhibitionsByArtwork(artwork.id);
    exhibitions.push(...artworkExhibitions);
  }
  
  return c.json({ exhibitions });
});

// ========== MEDIA & MENTIONS ==========

// Get media mentions of artist
artist.get('/media', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  
  if (!artistId) {
    return c.json({ error: 'artist_id is required' }, 400);
  }
  
  const media = await db.getMediaByEntity('artist', artistId);
  return c.json({ media });
});

// ========== ANALYTICS ==========

// Get artist analytics
artist.get('/analytics', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  
  if (!artistId) {
    return c.json({ error: 'artist_id is required' }, 400);
  }
  
  const artworks = await db.getArtworksByArtist(artistId);
  const node = await db.getNode(artistId);
  
  // Calculate total value of artworks
  let totalValue = 0;
  let soldCount = 0;
  
  for (const artwork of artworks) {
    if (artwork.last_sale_price) {
      totalValue += artwork.last_sale_price;
      soldCount++;
    }
  }
  
  return c.json({
    total_artworks: artworks.length,
    total_sold: soldCount,
    total_value: totalValue,
    average_price: soldCount > 0 ? totalValue / soldCount : 0,
    trust_level: node?.trust_level || 0.5,
    reputation_trend: 'stable' // TODO: Calculate trend
  });
});

export default artist;
