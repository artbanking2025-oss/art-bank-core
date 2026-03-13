// Database helper functions for Art Bank

import type { 
  Node, Edge, Artwork, Transaction, Validation, 
  CreateNodeRequest, CreateEdgeRequest, CreateArtworkRequest, 
  CreateTransactionRequest, CreateValidationRequest,
  DashboardStats, GraphData
} from '../types';

export class ArtBankDB {
  constructor(private db: D1Database) {}

  // ========== NODES ==========
  
  async createNode(data: CreateNodeRequest): Promise<Node> {
    const id = crypto.randomUUID();
    const metadata = JSON.stringify(data.metadata || {});
    
    await this.db.prepare(`
      INSERT INTO nodes (id, node_type, name, jurisdiction, metadata, trust_level, status)
      VALUES (?, ?, ?, ?, ?, 0.5, 'active')
    `).bind(id, data.node_type, data.name, data.jurisdiction || null, metadata).run();
    
    const node = await this.db.prepare('SELECT * FROM nodes WHERE id = ?').bind(id).first<Node>();
    return node!;
  }

  async getNode(id: string): Promise<Node | null> {
    return await this.db.prepare('SELECT * FROM nodes WHERE id = ?').bind(id).first<Node>();
  }

  async getNodesByType(nodeType: string): Promise<Node[]> {
    const { results } = await this.db.prepare('SELECT * FROM nodes WHERE node_type = ? ORDER BY trust_level DESC')
      .bind(nodeType).all<Node>();
    return results;
  }

  async getAllNodes(): Promise<Node[]> {
    const { results } = await this.db.prepare('SELECT * FROM nodes ORDER BY created_at DESC').all<Node>();
    return results;
  }

  async updateNodeTrustLevel(id: string, trustLevel: number): Promise<void> {
    await this.db.prepare('UPDATE nodes SET trust_level = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(trustLevel, id).run();
  }

  // ========== EDGES ==========
  
  async createEdge(data: CreateEdgeRequest): Promise<Edge> {
    const metadata = JSON.stringify(data.metadata || {});
    const weight = data.weight || 1.0;
    
    const result = await this.db.prepare(`
      INSERT INTO edges (from_node_id, to_node_id, edge_type, weight, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.from_node_id, data.to_node_id, data.edge_type, weight, metadata).run();
    
    const edge = await this.db.prepare('SELECT * FROM edges WHERE id = ?')
      .bind(result.meta.last_row_id).first<Edge>();
    return edge!;
  }

  async getEdgesByNode(nodeId: string): Promise<Edge[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM edges 
      WHERE from_node_id = ? OR to_node_id = ?
      ORDER BY created_at DESC
    `).bind(nodeId, nodeId).all<Edge>();
    return results;
  }

  async getAllEdges(): Promise<Edge[]> {
    const { results } = await this.db.prepare('SELECT * FROM edges ORDER BY created_at DESC').all<Edge>();
    return results;
  }

  // ========== ARTWORKS ==========
  
  async createArtwork(data: CreateArtworkRequest): Promise<Artwork> {
    const id = crypto.randomUUID();
    
    await this.db.prepare(`
      INSERT INTO artworks (id, title, artist_node_id, created_year, style, medium, 
                          dimensions, condition, digital_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, data.title, data.artist_node_id, data.created_year || null,
      data.style || null, data.medium || null, data.dimensions || null,
      data.condition || null, data.digital_signature || null
    ).run();
    
    const artwork = await this.db.prepare('SELECT * FROM artworks WHERE id = ?').bind(id).first<Artwork>();
    return artwork!;
  }

  async getArtwork(id: string): Promise<Artwork | null> {
    return await this.db.prepare('SELECT * FROM artworks WHERE id = ?').bind(id).first<Artwork>();
  }

  async getArtworksByArtist(artistId: string): Promise<Artwork[]> {
    const { results } = await this.db.prepare('SELECT * FROM artworks WHERE artist_node_id = ?')
      .bind(artistId).all<Artwork>();
    return results;
  }

  async getArtworksByOwner(ownerId: string): Promise<Artwork[]> {
    const { results } = await this.db.prepare('SELECT * FROM artworks WHERE current_owner_node_id = ?')
      .bind(ownerId).all<Artwork>();
    return results;
  }

  async getAllArtworks(): Promise<Artwork[]> {
    const { results } = await this.db.prepare('SELECT * FROM artworks ORDER BY created_at DESC').all<Artwork>();
    return results;
  }

  async updateArtworkOwner(artworkId: string, newOwnerId: string): Promise<void> {
    await this.db.prepare('UPDATE artworks SET current_owner_node_id = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(newOwnerId, artworkId).run();
  }

  async updateArtworkFPC(artworkId: string, fpc: number): Promise<void> {
    await this.db.prepare('UPDATE artworks SET current_fpc = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(fpc, artworkId).run();
  }

  // ========== TRANSACTIONS ==========
  
  async createTransaction(data: CreateTransactionRequest): Promise<Transaction> {
    const metadata = JSON.stringify(data.metadata || {});
    
    const result = await this.db.prepare(`
      INSERT INTO transactions (artwork_id, from_node_id, to_node_id, bank_node_id, 
                              price, loan_amount, interest_rate, metadata, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      data.artwork_id, data.from_node_id, data.to_node_id, data.bank_node_id || null,
      data.price, data.loan_amount || 0, data.interest_rate || 0, metadata
    ).run();
    
    const transaction = await this.db.prepare('SELECT * FROM transactions WHERE id = ?')
      .bind(result.meta.last_row_id).first<Transaction>();
    return transaction!;
  }

  async getTransaction(id: number): Promise<Transaction | null> {
    return await this.db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<Transaction>();
  }

  async getTransactionsByArtwork(artworkId: string): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions WHERE artwork_id = ? ORDER BY transaction_date DESC')
      .bind(artworkId).all<Transaction>();
    return results;
  }

  async getTransactionsByNode(nodeId: string): Promise<Transaction[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM transactions 
      WHERE from_node_id = ? OR to_node_id = ? OR bank_node_id = ?
      ORDER BY transaction_date DESC
    `).bind(nodeId, nodeId, nodeId).all<Transaction>();
    return results;
  }

  async getAllTransactions(): Promise<Transaction[]> {
    const { results } = await this.db.prepare('SELECT * FROM transactions ORDER BY transaction_date DESC').all<Transaction>();
    return results;
  }

  async updateTransactionStatus(id: number, status: string): Promise<void> {
    await this.db.prepare('UPDATE transactions SET status = ? WHERE id = ?').bind(status, id).run();
  }

  // ========== VALIDATIONS ==========
  
  async createValidation(data: CreateValidationRequest): Promise<Validation> {
    const result_json = JSON.stringify(data.result);
    
    const result = await this.db.prepare(`
      INSERT INTO validations (artwork_id, expert_node_id, validation_type, result, 
                              estimated_value, confidence_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.artwork_id, data.expert_node_id, data.validation_type, result_json,
      data.estimated_value || null, data.confidence_level || null
    ).run();
    
    const validation = await this.db.prepare('SELECT * FROM validations WHERE id = ?')
      .bind(result.meta.last_row_id).first<Validation>();
    return validation!;
  }

  async getValidationsByArtwork(artworkId: string): Promise<Validation[]> {
    const { results } = await this.db.prepare('SELECT * FROM validations WHERE artwork_id = ? ORDER BY validated_at DESC')
      .bind(artworkId).all<Validation>();
    return results;
  }

  async getValidationsByExpert(expertId: string): Promise<Validation[]> {
    const { results } = await this.db.prepare('SELECT * FROM validations WHERE expert_node_id = ? ORDER BY validated_at DESC')
      .bind(expertId).all<Validation>();
    return results;
  }

  // ========== DASHBOARD & ANALYTICS ==========
  
  async getDashboardStats(): Promise<DashboardStats> {
    const totalNodes = await this.db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
    const totalArtworks = await this.db.prepare('SELECT COUNT(*) as count FROM artworks').first<{ count: number }>();
    const totalTransactions = await this.db.prepare('SELECT COUNT(*) as count FROM transactions').first<{ count: number }>();
    const totalVolume = await this.db.prepare('SELECT SUM(price) as volume FROM transactions WHERE status = ?').bind('completed').first<{ volume: number }>();
    const avgTrust = await this.db.prepare('SELECT AVG(trust_level) as avg FROM nodes').first<{ avg: number }>();
    
    return {
      total_nodes: totalNodes?.count || 0,
      total_artworks: totalArtworks?.count || 0,
      total_transactions: totalTransactions?.count || 0,
      total_volume: totalVolume?.volume || 0,
      avg_trust_level: avgTrust?.avg || 0.5
    };
  }

  async getGraphData(): Promise<GraphData> {
    const nodes = await this.getAllNodes();
    const edges = await this.getAllEdges();
    
    return {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.node_type,
        trust_level: n.trust_level
      })),
      edges: edges.map(e => ({
        from: e.from_node_id,
        to: e.to_node_id,
        type: e.edge_type,
        weight: e.weight
      }))
    };
  }

  // ========== ACTIVITY LOG ==========
  
  async logActivity(nodeId: string, actionType: string, details: Record<string, any>): Promise<void> {
    const details_json = JSON.stringify(details);
    await this.db.prepare(`
      INSERT INTO activity_log (node_id, action_type, details)
      VALUES (?, ?, ?)
    `).bind(nodeId, actionType, details_json).run();
  }

  async getActivityByNode(nodeId: string, limit: number = 50): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM activity_log 
      WHERE node_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).bind(nodeId, limit).all();
    return results;
  }

  // ========== JUNCTION TABLES ==========

  // Artwork Exhibitions
  async addExhibition(data: {
    artwork_id: string;
    gallery_node_id: string;
    exhibition_name: string;
    start_date?: string;
    end_date?: string;
    curator?: string;
    notes?: string;
  }): Promise<any> {
    const result = await this.db.prepare(`
      INSERT INTO artwork_exhibitions 
      (artwork_id, gallery_node_id, exhibition_name, start_date, end_date, curator, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.artwork_id,
      data.gallery_node_id,
      data.exhibition_name,
      data.start_date || null,
      data.end_date || null,
      data.curator || null,
      data.notes || null
    ).run();

    return await this.db.prepare('SELECT * FROM artwork_exhibitions WHERE id = ?')
      .bind(result.meta.last_row_id).first();
  }

  async getExhibitionsByArtwork(artworkId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT e.*, n.name as gallery_name
      FROM artwork_exhibitions e
      JOIN nodes n ON e.gallery_node_id = n.id
      WHERE e.artwork_id = ?
      ORDER BY e.start_date DESC
    `).bind(artworkId).all();
    return results;
  }

  async getExhibitionsByGallery(galleryId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT e.*, a.title as artwork_title
      FROM artwork_exhibitions e
      JOIN artworks a ON e.artwork_id = a.id
      WHERE e.gallery_node_id = ?
      ORDER BY e.start_date DESC
    `).bind(galleryId).all();
    return results;
  }

  // Artwork Artists (collaborations)
  async addArtworkArtist(artworkId: string, artistId: string, role: string = 'primary', contribution: number = 100): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO artwork_artists 
      (artwork_id, artist_node_id, role, contribution_percentage)
      VALUES (?, ?, ?, ?)
    `).bind(artworkId, artistId, role, contribution).run();
  }

  async getArtworkArtists(artworkId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT aa.*, n.name as artist_name
      FROM artwork_artists aa
      JOIN nodes n ON aa.artist_node_id = n.id
      WHERE aa.artwork_id = ?
      ORDER BY aa.contribution_percentage DESC
    `).bind(artworkId).all();
    return results;
  }

  // Tags
  async addTag(id: string, name: string, category: string): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO tags (id, name, category)
      VALUES (?, ?, ?)
    `).bind(id, name, category).run();
  }

  async addArtworkTag(artworkId: string, tagId: string, relevance: number = 1.0): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO artwork_tags (artwork_id, tag_id, relevance)
      VALUES (?, ?, ?)
    `).bind(artworkId, tagId, relevance).run();
  }

  async getArtworkTags(artworkId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT at.*, t.name, t.category
      FROM artwork_tags at
      JOIN tags t ON at.tag_id = t.id
      WHERE at.artwork_id = ?
      ORDER BY at.relevance DESC
    `).bind(artworkId).all();
    return results;
  }

  async getArtworksByTag(tagId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT a.*, at.relevance
      FROM artworks a
      JOIN artwork_tags at ON a.id = at.artwork_id
      WHERE at.tag_id = ?
      ORDER BY at.relevance DESC
    `).bind(tagId).all();
    return results;
  }

  // Media Items
  async createMediaItem(data: {
    id: string;
    type: string;
    source?: string;
    url?: string;
    title: string;
    content?: string;
    author?: string;
    published_at?: string;
    sentiment_score?: number;
    influence_score?: number;
  }): Promise<any> {
    await this.db.prepare(`
      INSERT INTO media_items 
      (id, type, source, url, title, content, author, published_at, sentiment_score, influence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.id,
      data.type,
      data.source || null,
      data.url || null,
      data.title,
      data.content || null,
      data.author || null,
      data.published_at || null,
      data.sentiment_score || null,
      data.influence_score || 0.0
    ).run();

    return await this.db.prepare('SELECT * FROM media_items WHERE id = ?')
      .bind(data.id).first();
  }

  async addMediaMention(mediaItemId: string, entityType: string, entityId: string, context?: string, relevance: number = 1.0): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO media_mentions 
      (media_item_id, entity_type, entity_id, mention_context, relevance)
      VALUES (?, ?, ?, ?, ?)
    `).bind(mediaItemId, entityType, entityId, context || null, relevance).run();
  }

  async getMediaByEntity(entityType: string, entityId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT m.*, mm.mention_context, mm.relevance
      FROM media_items m
      JOIN media_mentions mm ON m.id = mm.media_item_id
      WHERE mm.entity_type = ? AND mm.entity_id = ?
      ORDER BY m.published_at DESC
    `).bind(entityType, entityId).all();
    return results;
  }

  // Price History
  async addPriceHistory(artworkId: string, price: number, source: string, transactionId?: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO price_history (artwork_id, price, source, transaction_id)
      VALUES (?, ?, ?, ?)
    `).bind(artworkId, price, source, transactionId || null).run();
  }

  async getPriceHistory(artworkId: string, limit: number = 100): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM price_history
      WHERE artwork_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `).bind(artworkId, limit).all();
    return results;
  }

  // Saga Logs
  async createSagaLog(data: {
    id: string;
    saga_type: string;
    status: string;
    context: any;
    affected_entities: any[];
  }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO saga_logs (id, saga_type, status, context, affected_entities)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.id,
      data.saga_type,
      data.status,
      JSON.stringify(data.context),
      JSON.stringify(data.affected_entities)
    ).run();
  }

  async updateSagaLog(id: string, status: string, errorMessage?: string): Promise<void> {
    await this.db.prepare(`
      UPDATE saga_logs 
      SET status = ?, error_message = ?, completed_at = unixepoch()
      WHERE id = ?
    `).bind(status, errorMessage || null, id).run();
  }

  async getSagaLogs(limit: number = 50): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM saga_logs
      ORDER BY started_at DESC
      LIMIT ?
    `).bind(limit).all();
    return results;
  }
}
