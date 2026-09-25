import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

export class KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private outEdges = new Map<string, GraphEdge[]>();
  private inEdges = new Map<string, GraphEdge[]>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.length;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  addEdge(edge: GraphEdge): void {
    const isDuplicate = this.edges.some(
      (e) =>
        e.source === edge.source &&
        e.target === edge.target &&
        e.type === edge.type
    );
    if (isDuplicate) return;

    this.edges.push(edge);

    if (!this.outEdges.has(edge.source)) {
      this.outEdges.set(edge.source, []);
    }
    this.outEdges.get(edge.source)!.push(edge);

    if (!this.inEdges.has(edge.target)) {
      this.inEdges.set(edge.target, []);
    }
    this.inEdges.get(edge.target)!.push(edge);
  }

  getNeighbors(id: string, edgeType?: EdgeType): GraphNode[] {
    const outs = this.outEdges.get(id) || [];
    const filtered = edgeType ? outs.filter((e) => e.type === edgeType) : outs;
    return filtered
      .map((e) => this.nodes.get(e.target))
      .filter((n): n is GraphNode => Boolean(n));
  }

  findByType(type: NodeType): GraphNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  search(query: string): GraphNode[] {
    const q = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      (n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)
    );
  }

  exportGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    };
  }

  importGraph(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    for (const node of data.nodes) {
      this.addNode(node);
    }
    for (const edge of data.edges) {
      this.addEdge(edge);
    }
  }

  generateContextSnippet(limit: number = 10): string {
    const rules = this.findByType("rule").slice(0, limit);
    const patterns = this.findByType("pattern").slice(0, limit);

    if (rules.length === 0 && patterns.length === 0) return "";

    let snippet = "### Project Architecture & Memory:\n";
    if (rules.length > 0) {
      snippet += "Project Rules:\n" + rules.map((r) => `  - ${r.label}`).join("\n") + "\n";
    }
    if (patterns.length > 0) {
      snippet += "Learned Patterns:\n" + patterns.map((p) => `  - ${p.label}`).join("\n") + "\n";
    }

    return snippet;
  }
}
