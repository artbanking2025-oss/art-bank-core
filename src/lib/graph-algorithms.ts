/**
 * Graph Algorithms
 * 
 * Advanced graph analysis algorithms:
 * - PageRank
 * - Community Detection (Label Propagation)
 * - Centrality measures
 * - Clustering coefficient
 */

import { graphDb, GraphNode } from './graph-database';

export interface PageRankResult {
  nodeId: string;
  score: number;
  rank: number;
}

export interface CommunityResult {
  communities: Map<number, string[]>;
  modularity: number;
  count: number;
}

export interface CentralityResult {
  nodeId: string;
  degree: number;
  betweenness: number;
  closeness: number;
}

export class GraphAlgorithms {
  /**
   * PageRank algorithm
   * Measures node importance based on link structure
   */
  static pageRank(
    dampingFactor: number = 0.85,
    maxIterations: number = 100,
    tolerance: number = 0.0001
  ): PageRankResult[] {
    const nodes = Array.from(graphDb['nodes'].values());
    
    if (nodes.length === 0) {
      return [];
    }

    // Initialize scores
    const scores = new Map<string, number>();
    const initialScore = 1.0 / nodes.length;
    
    for (const node of nodes) {
      scores.set(node.id, initialScore);
    }

    // Iterate
    for (let iter = 0; iter < maxIterations; iter++) {
      const newScores = new Map<string, number>();
      let maxDiff = 0;

      for (const node of nodes) {
        // Get incoming links
        const incoming = graphDb.getIncomingRelationships(node.id);
        
        let sum = 0;
        for (const rel of incoming) {
          const sourceNode = rel.fromNodeId;
          const sourceScore = scores.get(sourceNode) || 0;
          const outDegree = graphDb.getNodeDegree(sourceNode).outDegree;
          
          if (outDegree > 0) {
            sum += sourceScore / outDegree;
          }
        }

        const newScore = (1 - dampingFactor) / nodes.length + dampingFactor * sum;
        newScores.set(node.id, newScore);

        // Check convergence
        const diff = Math.abs(newScore - (scores.get(node.id) || 0));
        maxDiff = Math.max(maxDiff, diff);
      }

      scores.clear();
      newScores.forEach((score, nodeId) => scores.set(nodeId, score));

      // Converged?
      if (maxDiff < tolerance) {
        break;
      }
    }

    // Sort by score and assign ranks
    const results = Array.from(scores.entries())
      .map(([nodeId, score]) => ({ nodeId, score }))
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));

    return results;
  }

  /**
   * Community Detection using Label Propagation
   */
  static detectCommunities(maxIterations: number = 100): CommunityResult {
    const nodes = Array.from(graphDb['nodes'].values());
    
    if (nodes.length === 0) {
      return {
        communities: new Map(),
        modularity: 0,
        count: 0
      };
    }

    // Initialize: each node is its own community
    const labels = new Map<string, number>();
    nodes.forEach((node, index) => labels.set(node.id, index));

    // Iterate
    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      // Shuffle nodes for randomness
      const shuffled = [...nodes].sort(() => Math.random() - 0.5);

      for (const node of shuffled) {
        // Get neighbor labels
        const neighbors = graphDb.getNeighbors(node.id);
        
        if (neighbors.length === 0) continue;

        // Count label frequencies
        const labelCount = new Map<number, number>();
        for (const neighbor of neighbors) {
          const label = labels.get(neighbor.id)!;
          labelCount.set(label, (labelCount.get(label) || 0) + 1);
        }

        // Find most common label
        let maxCount = 0;
        let maxLabel = labels.get(node.id)!;
        
        for (const [label, count] of labelCount) {
          if (count > maxCount) {
            maxCount = count;
            maxLabel = label;
          }
        }

        // Update label if changed
        if (maxLabel !== labels.get(node.id)) {
          labels.set(node.id, maxLabel);
          changed = true;
        }
      }

      // Converged?
      if (!changed) break;
    }

    // Group nodes by community
    const communities = new Map<number, string[]>();
    for (const [nodeId, label] of labels) {
      if (!communities.has(label)) {
        communities.set(label, []);
      }
      communities.get(label)!.push(nodeId);
    }

    // Calculate modularity
    const modularity = this.calculateModularity(communities);

    return {
      communities,
      modularity,
      count: communities.size
    };
  }

  /**
   * Calculate degree centrality
   */
  static degreeCentrality(): Map<string, number> {
    const nodes = Array.from(graphDb['nodes'].values());
    const centrality = new Map<string, number>();

    for (const node of nodes) {
      const degree = graphDb.getNodeDegree(node.id).totalDegree;
      centrality.set(node.id, degree);
    }

    return centrality;
  }

  /**
   * Calculate betweenness centrality (simplified)
   */
  static betweennessCentrality(): Map<string, number> {
    const nodes = Array.from(graphDb['nodes'].values());
    const centrality = new Map<string, number>();

    // Initialize
    for (const node of nodes) {
      centrality.set(node.id, 0);
    }

    // For each pair of nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const source = nodes[i].id;
        const target = nodes[j].id;

        // Find all shortest paths
        const path = graphDb.findShortestPath(source, target);
        
        if (path && path.length > 1) {
          // Count nodes in path (excluding source and target)
          for (let k = 1; k < path.nodes.length - 1; k++) {
            const nodeId = path.nodes[k].id;
            centrality.set(nodeId, (centrality.get(nodeId) || 0) + 1);
          }
        }
      }
    }

    return centrality;
  }

  /**
   * Calculate closeness centrality
   */
  static closenessCentrality(): Map<string, number> {
    const nodes = Array.from(graphDb['nodes'].values());
    const centrality = new Map<string, number>();

    for (const node of nodes) {
      let totalDistance = 0;
      let reachableNodes = 0;

      // Calculate distances to all other nodes
      for (const other of nodes) {
        if (node.id === other.id) continue;

        const path = graphDb.findShortestPath(node.id, other.id);
        if (path) {
          totalDistance += path.length;
          reachableNodes++;
        }
      }

      // Closeness = (n-1) / sum of distances
      const closeness = reachableNodes > 0 ? reachableNodes / totalDistance : 0;
      centrality.set(node.id, closeness);
    }

    return centrality;
  }

  /**
   * Calculate clustering coefficient
   */
  static clusteringCoefficient(nodeId?: string): number | Map<string, number> {
    if (nodeId) {
      // Local clustering coefficient
      return this.localClusteringCoefficient(nodeId);
    } else {
      // Global clustering coefficient
      const nodes = Array.from(graphDb['nodes'].values());
      const coefficients = new Map<string, number>();

      for (const node of nodes) {
        coefficients.set(node.id, this.localClusteringCoefficient(node.id));
      }

      return coefficients;
    }
  }

  /**
   * Find triangles (3-node cycles)
   */
  static findTriangles(): Array<[string, string, string]> {
    const nodes = Array.from(graphDb['nodes'].values());
    const triangles: Array<[string, string, string]> = [];
    const seen = new Set<string>();

    for (const node of nodes) {
      const neighbors = graphDb.getNeighbors(node.id, 'outgoing');
      
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const n1 = neighbors[i].id;
          const n2 = neighbors[j].id;

          // Check if n1 and n2 are connected
          const hasEdge = graphDb.getOutgoingRelationships(n1)
            .some(r => r.toNodeId === n2);

          if (hasEdge) {
            const triangle = [node.id, n1, n2].sort();
            const key = triangle.join('-');
            
            if (!seen.has(key)) {
              seen.add(key);
              triangles.push([triangle[0], triangle[1], triangle[2]]);
            }
          }
        }
      }
    }

    return triangles;
  }

  /**
   * Get comprehensive centrality measures
   */
  static getAllCentralityMeasures(): CentralityResult[] {
    const nodes = Array.from(graphDb['nodes'].values());
    const degree = this.degreeCentrality();
    const betweenness = this.betweennessCentrality();
    const closeness = this.closenessCentrality();

    return nodes.map(node => ({
      nodeId: node.id,
      degree: degree.get(node.id) || 0,
      betweenness: betweenness.get(node.id) || 0,
      closeness: closeness.get(node.id) || 0
    }));
  }

  /**
   * Calculate modularity (quality of community detection)
   */
  private static calculateModularity(communities: Map<number, string[]>): number {
    const m = graphDb['relationships'].size;
    if (m === 0) return 0;

    let modularity = 0;

    for (const nodeIds of communities.values()) {
      for (const nodeA of nodeIds) {
        for (const nodeB of nodeIds) {
          // Check if edge exists
          const hasEdge = graphDb.getOutgoingRelationships(nodeA)
            .some(r => r.toNodeId === nodeB);

          const aij = hasEdge ? 1 : 0;

          // Expected edges
          const degreeA = graphDb.getNodeDegree(nodeA).totalDegree;
          const degreeB = graphDb.getNodeDegree(nodeB).totalDegree;
          const expected = (degreeA * degreeB) / (2 * m);

          modularity += (aij - expected);
        }
      }
    }

    return modularity / (2 * m);
  }

  /**
   * Local clustering coefficient for a node
   */
  private static localClusteringCoefficient(nodeId: string): number {
    const neighbors = graphDb.getNeighbors(nodeId);
    const k = neighbors.length;

    if (k < 2) return 0;

    // Count connections between neighbors
    let connections = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const hasEdge = graphDb.getOutgoingRelationships(neighbors[i].id)
          .some(r => r.toNodeId === neighbors[j].id);

        if (hasEdge) connections++;
      }
    }

    // Clustering coefficient = 2 * connections / (k * (k-1))
    return (2 * connections) / (k * (k - 1));
  }
}
