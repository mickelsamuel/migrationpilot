/**
 * Cross-migration dependency graph.
 *
 * Analyzes multiple migration files to build a dependency graph. Files that
 * reference tables created by other files form dependency edges. Detects
 * cycles (via DFS) and orphaned files that neither depend on nor are
 * depended upon by any other file.
 */

import { parse as pgParse } from 'libpg-query';

export interface DependencyNode {
  /** Path or identifier for the migration file. */
  file: string;
  /** Tables created, altered, or dropped in this file. */
  tables: string[];
  /** Files that this file depends on (must run before). */
  dependsOn: string[];
  /** Files that depend on this file (must run after). */
  dependedBy: string[];
}

export interface DependencyGraph {
  /** All nodes in the dependency graph. */
  nodes: DependencyNode[];
  /** Detected dependency cycles (each cycle is a list of file paths). */
  cycles: string[][];
  /** Files that have no dependencies in either direction. */
  orphans: string[];
}

/**
 * Build a dependency graph from a set of migration files.
 *
 * Parses each file to discover which tables it creates and which tables
 * it references. Builds directed edges between files: if file B references
 * a table created by file A, then B depends on A.
 *
 * @param files - Array of migration files with path and SQL content.
 * @returns The complete dependency graph with cycle and orphan detection.
 */
export async function buildDependencyGraph(
  files: Array<{ path: string; sql: string }>,
): Promise<DependencyGraph> {
  // Step 1: Parse each file to find created and referenced tables
  const fileData = await Promise.all(
    files.map(async (f) => {
      const { created, referenced } = await extractTableOperations(f.sql);
      return { path: f.path, created, referenced };
    }),
  );

  // Step 2: Build a map of table -> creating file
  const tableCreators = new Map<string, string>();
  for (const fd of fileData) {
    for (const table of fd.created) {
      // First file to create a table owns it
      if (!tableCreators.has(table)) {
        tableCreators.set(table, fd.path);
      }
    }
  }

  // Step 3: Build dependency edges
  const nodes: DependencyNode[] = fileData.map(fd => ({
    file: fd.path,
    tables: [...new Set([...fd.created, ...fd.referenced])],
    dependsOn: [],
    dependedBy: [],
  }));

  const nodeMap = new Map<string, DependencyNode>();
  for (const node of nodes) {
    nodeMap.set(node.file, node);
  }

  for (const fd of fileData) {
    const node = nodeMap.get(fd.path);
    if (!node) continue;

    for (const table of fd.referenced) {
      const creator = tableCreators.get(table);
      if (creator && creator !== fd.path) {
        // fd.path depends on the file that created this table
        if (!node.dependsOn.includes(creator)) {
          node.dependsOn.push(creator);
        }

        const creatorNode = nodeMap.get(creator);
        if (creatorNode && !creatorNode.dependedBy.includes(fd.path)) {
          creatorNode.dependedBy.push(fd.path);
        }
      }
    }
  }

  // Step 4: Detect cycles using DFS
  const cycles = detectCycles(nodes, nodeMap);

  // Step 5: Identify orphans (no dependencies in either direction)
  const orphans = nodes
    .filter(n => n.dependsOn.length === 0 && n.dependedBy.length === 0)
    .map(n => n.file);

  return { nodes, cycles, orphans };
}

// ---------------------------------------------------------------------------
// SQL parsing
// ---------------------------------------------------------------------------

interface TableOperations {
  /** Tables created by this SQL (CREATE TABLE). */
  created: string[];
  /** Tables referenced by this SQL (ALTER, INSERT, SELECT, FK, etc.). */
  referenced: string[];
}

async function extractTableOperations(sql: string): Promise<TableOperations> {
  const created: string[] = [];
  const referenced: string[] = [];

  try {
    const result = await pgParse(sql);

    for (const s of result.stmts) {
      const stmt = s.stmt as Record<string, unknown>;
      processStmtForTables(stmt, created, referenced);
    }
  } catch {
    // Fall back to regex-based extraction on parse failure
    extractTablesFromRegex(sql, created, referenced);
  }

  return {
    created: [...new Set(created)],
    referenced: [...new Set(referenced.filter(t => !created.includes(t)))],
  };
}

function processStmtForTables(
  stmt: Record<string, unknown>,
  created: string[],
  referenced: string[],
): void {
  // CREATE TABLE
  if (hasKey(stmt, 'CreateStmt')) {
    const node = stmt.CreateStmt as { relation?: { relname?: string } };
    if (node.relation?.relname) {
      created.push(node.relation.relname);
    }
  }

  // ALTER TABLE
  if (hasKey(stmt, 'AlterTableStmt')) {
    const node = stmt.AlterTableStmt as { relation?: { relname?: string } };
    if (node.relation?.relname) {
      referenced.push(node.relation.relname);
    }
  }

  // DROP TABLE
  if (hasKey(stmt, 'DropStmt')) {
    const drop = stmt.DropStmt as { objects?: unknown[]; removeType?: string };
    if (drop.objects) {
      for (const obj of drop.objects) {
        const name = extractNameFromObject(obj);
        if (name) referenced.push(name);
      }
    }
  }

  // CREATE INDEX
  if (hasKey(stmt, 'IndexStmt')) {
    const idx = stmt.IndexStmt as { relation?: { relname?: string } };
    if (idx.relation?.relname) {
      referenced.push(idx.relation.relname);
    }
  }

  // INSERT / SELECT (references)
  if (hasKey(stmt, 'InsertStmt')) {
    const insert = stmt.InsertStmt as { relation?: { relname?: string } };
    if (insert.relation?.relname) {
      referenced.push(insert.relation.relname);
    }
  }

  // CREATE TRIGGER
  if (hasKey(stmt, 'CreateTrigStmt')) {
    const trig = stmt.CreateTrigStmt as { relation?: { relname?: string } };
    if (trig.relation?.relname) {
      referenced.push(trig.relation.relname);
    }
  }
}

function extractTablesFromRegex(
  sql: string,
  created: string[],
  referenced: string[],
): void {
  // CREATE TABLE
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
  let match: RegExpExecArray | null;
  while ((match = createRegex.exec(sql)) !== null) {
    if (match[1]) created.push(match[1]);
  }

  // ALTER TABLE
  const alterRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:\w+\.)?(\w+)/gi;
  while ((match = alterRegex.exec(sql)) !== null) {
    if (match[1]) referenced.push(match[1]);
  }

  // DROP TABLE
  const dropRegex = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
  while ((match = dropRegex.exec(sql)) !== null) {
    if (match[1]) referenced.push(match[1]);
  }

  // CREATE INDEX ON
  const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+.*?\s+ON\s+(?:\w+\.)?(\w+)/gi;
  while ((match = indexRegex.exec(sql)) !== null) {
    if (match[1]) referenced.push(match[1]);
  }

  // REFERENCES (foreign keys)
  const fkRegex = /REFERENCES\s+(?:\w+\.)?(\w+)/gi;
  while ((match = fkRegex.exec(sql)) !== null) {
    if (match[1]) referenced.push(match[1]);
  }
}

function extractNameFromObject(obj: unknown): string | null {
  if (Array.isArray(obj)) {
    const parts = obj
      .filter((item): item is { str: string } =>
        item != null && typeof item === 'object' && 'str' in item,
      )
      .map(item => item.str);
    return parts[parts.length - 1] ?? null;
  }

  if (obj && typeof obj === 'object' && 'List' in obj) {
    const list = (obj as { List: { items: unknown[] } }).List;
    return extractNameFromObject(list.items);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cycle detection (DFS-based)
// ---------------------------------------------------------------------------

function detectCycles(
  nodes: DependencyNode[],
  nodeMap: Map<string, DependencyNode>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(file: string): void {
    if (inStack.has(file)) {
      // Found a cycle: extract the cycle from the stack
      const cycleStart = stack.indexOf(file);
      if (cycleStart !== -1) {
        const cycle = stack.slice(cycleStart);
        cycle.push(file); // Close the cycle
        cycles.push(cycle);
      }
      return;
    }

    if (visited.has(file)) return;

    visited.add(file);
    inStack.add(file);
    stack.push(file);

    const node = nodeMap.get(file);
    if (node) {
      for (const dep of node.dependsOn) {
        dfs(dep);
      }
    }

    stack.pop();
    inStack.delete(file);
  }

  for (const node of nodes) {
    dfs(node.file);
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasKey(obj: Record<string, unknown>, key: string): boolean {
  return key in obj && obj[key] != null;
}
