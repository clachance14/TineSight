/**
 * Union-Find (Disjoint Set Union) Data Structure
 * Feature: 011-trophy-fingerprint
 *
 * Implements an efficient algorithm for grouping elements into disjoint sets.
 * Used for clustering trophy detections by antler fingerprint similarity.
 *
 * Time complexity:
 * - find(x): O(α(n)) - amortized constant time with path compression
 * - union(x, y): O(α(n)) - amortized constant time
 * - connected(x, y): O(α(n))
 * - getGroups(): O(n)
 *
 * where α(n) is the inverse Ackermann function (effectively constant)
 */

export class UnionFind<T> {
  private parent: Map<T, T>
  private rank: Map<T, number>

  constructor(elements: T[]) {
    this.parent = new Map()
    this.rank = new Map()

    // Initialize each element as its own parent with rank 0
    for (const element of elements) {
      this.parent.set(element, element)
      this.rank.set(element, 0)
    }
  }

  /**
   * Find the root representative of the set containing x
   * Uses path compression for optimization
   */
  find(x: T): T {
    const parent = this.parent.get(x)
    if (parent === undefined) {
      throw new Error(`Element ${x} not found in Union-Find structure`)
    }

    // Path compression: make every node point directly to root
    if (parent !== x) {
      this.parent.set(x, this.find(parent))
    }

    return this.parent.get(x)!
  }

  /**
   * Union the sets containing x and y
   * Uses union by rank for optimization
   */
  union(x: T, y: T): void {
    const rootX = this.find(x)
    const rootY = this.find(y)

    // Already in same set
    if (rootX === rootY) {
      return
    }

    const rankX = this.rank.get(rootX) ?? 0
    const rankY = this.rank.get(rootY) ?? 0

    // Union by rank: attach smaller tree under larger tree
    if (rankX < rankY) {
      this.parent.set(rootX, rootY)
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX)
    } else {
      // Same rank: choose one as root and increase its rank
      this.parent.set(rootY, rootX)
      this.rank.set(rootX, rankX + 1)
    }
  }

  /**
   * Check if x and y are in the same set
   */
  connected(x: T, y: T): boolean {
    try {
      return this.find(x) === this.find(y)
    } catch {
      return false
    }
  }

  /**
   * Get all disjoint groups
   * Returns an array of sets, where each set contains elements in the same group
   */
  getGroups(): T[][] {
    const groups = new Map<T, T[]>()

    // Group elements by their root representative
    for (const element of this.parent.keys()) {
      const root = this.find(element)
      const group = groups.get(root)
      if (group) {
        group.push(element)
      } else {
        groups.set(root, [element])
      }
    }

    return Array.from(groups.values())
  }

  /**
   * Get the number of disjoint sets
   */
  getGroupCount(): number {
    const roots = new Set<T>()
    for (const element of this.parent.keys()) {
      roots.add(this.find(element))
    }
    return roots.size
  }

  /**
   * Get the size of the set containing x
   */
  getGroupSize(x: T): number {
    const root = this.find(x)
    let size = 0
    for (const element of this.parent.keys()) {
      if (this.find(element) === root) {
        size++
      }
    }
    return size
  }
}
