'use client';

/**
 * Loads the MigrationPilot analysis engine into the page.
 *
 * `/playground/engine.js` is the whole rule set compiled to a browser bundle
 * (built by scripts/build-playground.js) plus the real PostgreSQL parser as
 * WebAssembly. It is a classic script on purpose: the parser's Emscripten glue
 * finds libpg-query.wasm relative to `document.currentScript.src`, so both
 * files just need to sit together under /playground/.
 *
 * Once loaded, analysis is a plain function call. No request carries the SQL.
 */

export type RiskLevel = 'RED' | 'YELLOW' | 'GREEN';
export type Severity = 'critical' | 'warning';

export interface Violation {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  line: number;
  safeAlternative?: string;
  whyItMatters?: string;
  docsUrl?: string;
}

export interface AnalyzedStatement {
  sql: string;
  lockType: string;
  blocksReads: boolean;
  blocksWrites: boolean;
  riskLevel: RiskLevel;
  riskScore: number;
}

export interface Report {
  version: string;
  file: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskFactors: Array<{ name: string; value: number; weight: number; detail: string }>;
  statements: AnalyzedStatement[];
  violations: Violation[];
  summary: {
    totalStatements: number;
    totalViolations: number;
    criticalCount: number;
    warningCount: number;
  };
  parseError?: string;
}

export interface ProductionRule {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
}

export interface Engine {
  analyzeMigration(sql: string, pgVersion: number): Promise<Report>;
  warmup(): Promise<void>;
  ruleCount: number;
  productionRules: ProductionRule[];
}

declare global {
  interface Window {
    MigrationPilotEngine?: Engine;
  }
}

const ENGINE_URL = '/playground/engine.js';

let pending: Promise<Engine> | null = null;

/** Load (once) and warm up the engine. Safe to call from several places. */
export function loadEngine(): Promise<Engine> {
  if (!pending) {
    pending = injectScript().then(async (engine) => {
      await engine.warmup();
      return engine;
    });
  }
  return pending;
}

function injectScript(): Promise<Engine> {
  return new Promise((resolve, reject) => {
    if (window.MigrationPilotEngine) {
      resolve(window.MigrationPilotEngine);
      return;
    }

    const script = document.createElement('script');
    script.src = ENGINE_URL;
    script.async = true;
    script.onload = () => {
      const engine = window.MigrationPilotEngine;
      if (engine) resolve(engine);
      else reject(new Error('Engine script loaded but exposed nothing.'));
    };
    script.onerror = () => reject(new Error(`Could not load ${ENGINE_URL}.`));
    document.head.appendChild(script);
  });
}
