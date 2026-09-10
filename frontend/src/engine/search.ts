import Fuse from 'fuse.js';
import type { GraphNode, FilterConfig } from '../types/graph';

export interface SearchIndexer {
  search: (query: string) => Set<string>;
  updateNodes: (nodes: GraphNode[]) => void;
}

export function createSearchIndexer(nodes: GraphNode[]): SearchIndexer {
  let fuseInstance: Fuse<GraphNode> | null = null;

  function initFuse(nodeList: GraphNode[]) {
    fuseInstance = new Fuse(nodeList, {
      keys: [
        { name: 'label', weight: 0.5 },
        { name: 'tags', weight: 0.3 },
        { name: 'metadata.excerpt', weight: 0.2 },
        { name: 'metadata.language', weight: 0.2 },
        { name: 'metadata.codeSnippet', weight: 0.1 },
        { name: 'metadata.schemaFields.value', weight: 0.2 }
      ],
      threshold: 0.35,
      ignoreLocation: true
    });
  }

  initFuse(nodes);

  return {
    updateNodes: (updatedNodes: GraphNode[]) => {
      initFuse(updatedNodes);
    },

    search: (query: string): Set<string> => {
      if (!query.trim() || !fuseInstance) {
        return new Set();
      }
      const results = fuseInstance.search(query.trim());
      return new Set(results.map(r => r.item.id));
    }
  };
}

export function filterGraphNodes(
  nodes: GraphNode[],
  filterConfig: FilterConfig,
  searchResults: Set<string>
): Set<string> {
  const visibleNodeIds = new Set<string>();

  const hasSearch = filterConfig.searchQuery.trim().length > 0;
  const hasTags = filterConfig.selectedTags.length > 0;
  const hasTypes = filterConfig.selectedTypes.length > 0;

  nodes.forEach(node => {
    // 1. Search Query Filter
    if (hasSearch && !searchResults.has(node.id)) {
      return;
    }

    // 2. Tag Filter
    if (hasTags) {
      const hasMatchingTag = node.tags.some(tag => filterConfig.selectedTags.includes(tag));
      if (!hasMatchingTag) return;
    }

    // 3. Node Type Filter
    if (hasTypes) {
      if (!filterConfig.selectedTypes.includes(node.type)) return;
    }

    visibleNodeIds.add(node.id);
  });

  return visibleNodeIds;
}
