/**
 * Collector-specific API routes
 * Интерфейс для коллекционеров
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const collector = new Hono<{ Bindings: Env }>();

// Get collector profile with portfolio
collector.get('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const collectorId = c.req.param('id');
  
  const node = await db.getNode(collectorId);
  if (!node || node.node_type !== 'collector') {
    return c.json({ error: 'Collector not found' }, 404);
  }
  
  const portfolio = await db.getArtworksByOwner(collectorId);
  const transactions = await db.getTransactionsByNode(collectorId);
  
  // Calculate portfolio value
  let totalValue = 0;
  portfolio.forEach(artwork => {
    totalValue += artwork.current_fpc || artwork.last_sale_price || 0;
  });
  
  return c.json({
    profile: node,
    portfolio: {
      artworks: portfolio,
      total_value: totalValue,
      total_pieces: portfolio.length
    },
    transactions,
    stats: {
      total_purchases: transactions.filter((t: any) => t.to_node_id === collectorId).length,
      total_sales: transactions.filter((t: any) => t.from_node_id === collectorId).length,
      trust_level: node.trust_level
    }
  });
});

// Get available artworks for purchase
collector.get('/marketplace', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const style = c.req.query('style');
  const maxPrice = parseInt(c.req.query('max_price') || '0');
  
  let artworks = await db.getAllArtworks();
  
  // Filter available artworks (not owned by this collector)
  if (style) {
    artworks = artworks.filter((a: any) => a.style === style);
  }
  
  if (maxPrice > 0) {
    artworks = artworks.filter((a: any) => 
      (a.current_fpc || a.last_sale_price || 0) <= maxPrice
    );
  }
  
  return c.json({ artworks });
});

// Initiate purchase transaction
collector.post('/purchase', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    // Create transaction
    const transaction = await db.createTransaction({
      artwork_id: data.artwork_id,
      from_node_id: data.from_node_id,
      to_node_id: data.to_node_id, // collector
      bank_node_id: data.bank_node_id,
      price: data.price,
      status: 'pending'
    });
    
    return c.json({ transaction }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Get watchlist
collector.get('/watchlist/:collectorId', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const collectorId = c.req.param('collectorId');
  
  // TODO: Implement watchlist functionality
  return c.json({ watchlist: [] });
});

export default collector;
