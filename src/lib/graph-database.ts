/**
 * Graph Database Engine
 * 
 * Neo4j-like graph database implementation in TypeScript
 * Supports nodes, relationships, properties, and Cypher-like queries
 */

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphRelationship {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  properties: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PathResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  length: number;
}

export interface QueryResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  paths: PathResult[];
  count: number;
}

export class GraphDatabase {
  private nodes: Map<string, GraphNode> = new Map();
  private relationships: Map<string, GraphRelationship> = new Map();
  private nodesByLabel: Map<string, Set<string>> = new Map();
  private relationshipsByType: Map<string, Set<string>> = new Map();
  private outgoingRelationships: Map<string, Set<string>> = new Map();
  private incomingRelationships: Map<string, Set<string>> = new Map();

  /**
   * Create a node
   */
  createNode(labels: string[], properties: Record<string, any> = {}): GraphNode {
    const node: GraphNode = {
      id: this.generateId('node'),
      labels,
      properties,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.nodes.set(node.id, node);

    // Index by labels
    for (const label of labels) {
      if (!this.nodesByLabel.has(label)) {
        this.nodesByLabel.set(label, new Set());
      }
      this.nodesByLabel.get(label)!.add(node.id);
    }

    return node;
  }

  /**
   * Create a relationship
   */
  createRelationship(
    type: string,
    fromNodeId: string,
    toNodeId: string,
    properties: Record<string, any> = {}
  ): GraphRelationship | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) {
      return null;
    }

    const relationship: GraphRelationship = {
      id: this.generateId('rel'),
      type,
      fromNodeId,
      toNodeId,
      properties,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.relationships.set(relationship.id, relationship);

    // Index by type
    if (!this.relationshipsByType.has(type)) {
      this.relationshipsByType.set(type, new Set());
    }
    this.relationshipsByType.get(type)!.add(relationship.id);

    // Index outgoing/incoming
    if (!this.outgoingRelationships.has(fromNodeId)) {
      this.outgoingRelationships.set(fromNodeId, new Set());
    }
    this.outgoingRelationships.get(fromNodeId)!.add(relationship.id);

    if (!this.incomingRelationships.has(toNodeId)) {
      this.incomingRelationships.set(toNodeId, new Set());
    }
    this.incomingRelationships.get(toNodeId)!.add(relationship.id);

    return relationship;
  }

  /**
   * Find nodes by label
   */
  findNodesByLabel(label: string): GraphNode[] {
    const nodeIds = this.nodesByLabel.get(label);
    if (!nodeIds) return [];

    return Array.from(nodeIds)
      .map(id => this.nodes.get(id))
      .filter((node): node is GraphNode => node !== undefined);
  }

  /**
   * Find node by property
   */
  findNodeByProperty(label: string, key: string, value: any): GraphNode | null {
    const nodes = this.findNodesByLabel(label);
    return nodes.find(n => n.properties[key] === value) || null;
  }

  /**
   * Find relationships by type
   */
  findRelationshipsByType(type: string): GraphRelationship[] {
    const relIds = this.relationshipsByType.get(type);
    if (!relIds) return [];

    return Array.from(relIds)
      .map(id => this.relationships.get(id))
      .filter((rel): rel is GraphRelationship => rel !== undefined);
  }

  /**
   * Get outgoing relationships from node
   */
  getOutgoingRelationships(nodeId: string, type?: string): GraphRelationship[] {
    const relIds = this.outgoingRelationships.get(nodeId);
    if (!relIds) return [];

    let relationships = Array.from(relIds)
      .map(id => this.relationships.get(id))
      .filter((rel): rel is GraphRelationship => rel !== undefined);

    if (type) {
      relationships = relationships.filter(r => r.type === type);
    }

    return relationships;
  }

  /**
   * Get incoming relationships to node
   */
  getIncomingRelationships(nodeId: string, type?: string): GraphRelationship[] {
    const relIds = this.incomingRelationships.get(nodeId);
    if (!relIds) return [];

    let relationships = Array.from(relIds)
      .map(id => this.relationships.get(id))
      .filter((rel): rel is GraphRelationship => rel !== undefined);

    if (type) {
      relationships = relationships.filter(r => r.type === type);
    }

    return relationships;
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): GraphNode[] {
    const neighborIds = new Set<string>();

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = this.getOutgoingRelationships(nodeId);
      outgoing.forEach(r => neighborIds.add(r.toNodeId));
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = this.getIncomingRelationships(nodeId);
      incoming.forEach(r => neighborIds.add(r.fromNodeId));
    }

    return Array.from(neighborIds)
      .map(id => this.nodes.get(id))
      .filter((node): node is GraphNode => node !== undefined);
  }

  /**
   * Find shortest path between two nodes (BFS)
   */
  findShortestPath(fromNodeId: string, toNodeId: string): PathResult | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) {
      return null;
    }

    if (fromNodeId === toNodeId) {
      return {
        nodes: [this.nodes.get(fromNodeId)!],
        relationships: [],
        length: 0
      };
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[]; rels: string[] }> = [
      { nodeId: fromNodeId, path: [fromNodeId], rels: [] }
    ];

    while (queue.length > 0) {
      const { nodeId, path, rels } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (nodeId === toNodeId) {
        // Found path
        const nodes = path.map(id => this.nodes.get(id)!);
        const relationships = rels.map(id => this.relationships.get(id)!);
        
        return {
          nodes,
          relationships,
          length: relationships.length
        };
      }

      // Explore neighbors
      const outgoing = this.getOutgoingRelationships(nodeId);
      for (const rel of outgoing) {
        if (!visited.has(rel.toNodeId)) {
          queue.push({
            nodeId: rel.toNodeId,
            path: [...path, rel.toNodeId],
            rels: [...rels, rel.id]
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Find all paths between two nodes (up to maxDepth)
   */
  findAllPaths(fromNodeId: string, toNodeId: string, maxDepth: number = 5): PathResult[] {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) {
      return [];
    }

    const paths: PathResult[] = [];

    const dfs = (
      currentId: string,
      targetId: string,
      visited: Set<string>,
      path: string[],
      rels: string[],
      depth: number
    ) => {
      if (depth > maxDepth) return;

      if (currentId === targetId) {
        const nodes = path.map(id => this.nodes.get(id)!);
        const relationships = rels.map(id => this.relationships.get(id)!);
        
        paths.push({
          nodes,
          relationships,
          length: relationships.length
        });
        return;
      }

      visited.add(currentId);

      const outgoing = this.getOutgoingRelationships(currentId);
      for (const rel of outgoing) {
        if (!visited.has(rel.toNodeId)) {
          dfs(
            rel.toNodeId,
            targetId,
            new Set(visited),
            [...path, rel.toNodeId],
            [...rels, rel.id],
            depth + 1
          );
        }
      }
    };

    dfs(fromNodeId, toNodeId, new Set(), [fromNodeId], [], 0);
    return paths;
  }

  /**
   * Get node degree (number of connections)
   */
  getNodeDegree(nodeId: string): {
    inDegree: number;
    outDegree: number;
    totalDegree: number;
  } {
    const outDegree = this.getOutgoingRelationships(nodeId).length;
    const inDegree = this.getIncomingRelationships(nodeId).length;

    return {
      inDegree,
      outDegree,
      totalDegree: inDegree + outDegree
    };
  }

  /**
   * Update node properties
   */
  updateNode(nodeId: string, properties: Record<string, any>): GraphNode | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    node.properties = { ...node.properties, ...properties };
    node.updatedAt = new Date();

    return node;
  }

  /**
   * Update relationship properties
   */
  updateRelationship(relId: string, properties: Record<string, any>): GraphRelationship | null {
    const rel = this.relationships.get(relId);
    if (!rel) return null;

    rel.properties = { ...rel.properties, ...properties };
    rel.updatedAt = new Date();

    return rel;
  }

  /**
   * Delete node and its relationships
   */
  deleteNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Delete all related relationships
    const outgoing = this.getOutgoingRelationships(nodeId);
    const incoming = this.getIncomingRelationships(nodeId);
    
    [...outgoing, ...incoming].forEach(rel => this.deleteRelationship(rel.id));

    // Remove from label index
    for (const label of node.labels) {
      this.nodesByLabel.get(label)?.delete(nodeId);
    }

    // Remove node
    this.nodes.delete(nodeId);

    return true;
  }

  /**
   * Delete relationship
   */
  deleteRelationship(relId: string): boolean {
    const rel = this.relationships.get(relId);
    if (!rel) return false;

    // Remove from type index
    this.relationshipsByType.get(rel.type)?.delete(relId);

    // Remove from outgoing/incoming indexes
    this.outgoingRelationships.get(rel.fromNodeId)?.delete(relId);
    this.incomingRelationships.get(rel.toNodeId)?.delete(relId);

    // Remove relationship
    this.relationships.delete(relId);

    return true;
  }

  /**
   * Get statistics
   */
  getStats(): {
    nodeCount: number;
    relationshipCount: number;
    labelCount: number;
    relationshipTypeCount: number;
    avgDegree: number;
  } {
    const nodeCount = this.nodes.size;
    const relationshipCount = this.relationships.size;
    const labelCount = this.nodesByLabel.size;
    const relationshipTypeCount = this.relationshipsByType.size;

    let totalDegree = 0;
    for (const nodeId of this.nodes.keys()) {
      totalDegree += this.getNodeDegree(nodeId).totalDegree;
    }
    const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;

    return {
      nodeCount,
      relationshipCount,
      labelCount,
      relationshipTypeCount,
      avgDegree: Math.round(avgDegree * 100) / 100
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.nodes.clear();
    this.relationships.clear();
    this.nodesByLabel.clear();
    this.relationshipsByType.clear();
    this.outgoingRelationships.clear();
    this.incomingRelationships.clear();
  }

  /**
   * Export graph as JSON
   */
  export(): {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
  } {
    return {
      nodes: Array.from(this.nodes.values()),
      relationships: Array.from(this.relationships.values())
    };
  }

  /**
   * Import graph from JSON
   */
  import(data: { nodes: GraphNode[]; relationships: GraphRelationship[] }): void {
    this.clear();

    // Import nodes
    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
      
      for (const label of node.labels) {
        if (!this.nodesByLabel.has(label)) {
          this.nodesByLabel.set(label, new Set());
        }
        this.nodesByLabel.get(label)!.add(node.id);
      }
    }

    // Import relationships
    for (const rel of data.relationships) {
      this.relationships.set(rel.id, rel);

      if (!this.relationshipsByType.has(rel.type)) {
        this.relationshipsByType.set(rel.type, new Set());
      }
      this.relationshipsByType.get(rel.type)!.add(rel.id);

      if (!this.outgoingRelationships.has(rel.fromNodeId)) {
        this.outgoingRelationships.set(rel.fromNodeId, new Set());
      }
      this.outgoingRelationships.get(rel.fromNodeId)!.add(rel.id);

      if (!this.incomingRelationships.has(rel.toNodeId)) {
        this.incomingRelationships.set(rel.toNodeId, new Set());
      }
      this.incomingRelationships.get(rel.toNodeId)!.add(rel.id);
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

// Singleton instance
export const graphDb = new GraphDatabase();
