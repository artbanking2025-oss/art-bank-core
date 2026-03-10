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
}
