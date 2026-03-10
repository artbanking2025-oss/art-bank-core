// Type definitions for Art Bank platform

export type NodeType = 'artist' | 'collector' | 'gallery' | 'bank' | 'expert' | 'artwork';
export type EdgeType = 'created' | 'exhibited' | 'owns' | 'validated' | 'financed';
export type NodeStatus = 'active' | 'suspended' | 'verified';
export type TransactionStatus = 'pending' | 'completed' | 'cancelled';
export type ValidationType = 'authenticity' | 'condition' | 'valuation';

export interface Node {
  id: string;
  node_type: NodeType;
  name: string;
  trust_level: number;
  created_at: number;
  updated_at: number;
  jurisdiction?: string;
  status: NodeStatus;
  metadata: string; // JSON string
}

export interface Edge {
  id: number;
  from_node_id: string;
  to_node_id: string;
  edge_type: EdgeType;
  weight: number;
  created_at: number;
  metadata: string; // JSON string
}

export interface Artwork {
  id: string;
  title: string;
  artist_node_id: string;
  created_year?: number;
  style?: string;
  medium?: string;
  dimensions?: string;
  condition?: string;
  current_owner_node_id?: string;
  digital_signature?: string;
  certification_node_id?: string;
  current_fpc?: number;
  last_sale_price?: number;
  last_sale_date?: number;
  created_at: number;
  updated_at: number;
}

export interface Transaction {
  id: number;
  artwork_id: string;
  from_node_id: string;
  to_node_id: string;
  bank_node_id?: string;
  price: number;
  transaction_date: number;
  status: TransactionStatus;
  loan_amount: number;
  interest_rate: number;
  metadata: string; // JSON string
}

export interface Validation {
  id: number;
  artwork_id: string;
  expert_node_id: string;
  validation_type: ValidationType;
  result: string; // JSON string
  estimated_value?: number;
  confidence_level?: number;
  validated_at: number;
}

export interface ActivityLog {
  id: number;
  node_id: string;
  action_type: string;
  details: string; // JSON string
  timestamp: number;
}

export interface UserSession {
  id: number;
  session_token: string;
  node_id: string;
  role: string;
  created_at: number;
  expires_at?: number;
}

// Environment bindings for Cloudflare Workers
export interface Env {
  DB: D1Database;
}

// API Request/Response types
export interface CreateNodeRequest {
  node_type: NodeType;
  name: string;
  jurisdiction?: string;
  metadata?: Record<string, any>;
}

export interface CreateEdgeRequest {
  from_node_id: string;
  to_node_id: string;
  edge_type: EdgeType;
  weight?: number;
  metadata?: Record<string, any>;
}

export interface CreateArtworkRequest {
  title: string;
  artist_node_id: string;
  created_year?: number;
  style?: string;
  medium?: string;
  dimensions?: string;
  condition?: string;
  digital_signature?: string;
}

export interface CreateTransactionRequest {
  artwork_id: string;
  from_node_id: string;
  to_node_id: string;
  bank_node_id?: string;
  price: number;
  loan_amount?: number;
  interest_rate?: number;
  metadata?: Record<string, any>;
}

export interface CreateValidationRequest {
  artwork_id: string;
  expert_node_id: string;
  validation_type: ValidationType;
  result: Record<string, any>;
  estimated_value?: number;
  confidence_level?: number;
}

// Dashboard data types
export interface DashboardStats {
  total_nodes: number;
  total_artworks: number;
  total_transactions: number;
  total_volume: number;
  avg_trust_level: number;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    name: string;
    type: NodeType;
    trust_level: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: EdgeType;
    weight: number;
  }>;
}
