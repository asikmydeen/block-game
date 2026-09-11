// Type declarations for the plain-ESM origin policy so TypeScript tests can
// import it under strict settings without an implicit `any`.

export class OriginPolicyError extends Error {}

export function parseAllowlist(raw: string | null | undefined): string[];

export interface HttpDecision {
  allowed: boolean;
  isPreflight: boolean;
  reason: string;
  headers: Record<string, string>;
}

export interface UpgradeDecision {
  allowed: boolean;
  reason: string;
}

export interface OriginPolicy {
  allowlist: string[];
  production: boolean;
  originlessUpgradeAllowed: boolean;
  isApproved(origin: string | null | undefined): boolean;
  decideHttp(input: {
    origin?: string | null;
    method?: string;
    isPreflight?: boolean;
    requestHeaders?: string;
  }): HttpDecision;
  decideUpgrade(input: { origin?: string | null; path?: string }): UpgradeDecision;
}

export function createOriginPolicy(opts?: {
  allowlist?: string[];
  production?: boolean;
  allowOriginlessUpgrade?: boolean;
}): OriginPolicy;

export const MULTIPLAYER_PATH: string;
