// Pending progress store (task 5.2). Progress saves are debounced and may fail
// or arrive offline, so the store keeps at most ONE pending revision per
// account — always the newest unacknowledged one. A stale (older-revision)
// record can never overwrite a newer one, and a stale acknowledgement can never
// clear a revision it did not cover. This converges the pending state to the
// newest unacknowledged progress regardless of ordering.
//
// Data here is account progress only — never a token or device id.

export interface PendingRecord {
  /** Monotonic revision id, assigned at record time by the caller. */
  rev: number;
  [field: string]: unknown;
}

export interface PendingProgress {
  record(accountId: string, record: PendingRecord): void;
  peek(accountId: string): PendingRecord | null;
  /** Clear the pending record iff `rev` matches the currently stored one. */
  acknowledge(accountId: string, rev: number): void;
  pendingAccounts(): string[];
  clear(accountId: string): void;
}

export function createPendingProgress(): PendingProgress {
  const byAccount = new Map<string, PendingRecord>();

  return {
    record(accountId, record) {
      const current = byAccount.get(accountId);
      if (current && current.rev >= record.rev) return; // stale — keep newer
      byAccount.set(accountId, record);
    },
    peek(accountId) {
      return byAccount.get(accountId) ?? null;
    },
    acknowledge(accountId, rev) {
      const current = byAccount.get(accountId);
      if (current && current.rev === rev) byAccount.delete(accountId);
    },
    pendingAccounts() {
      return [...byAccount.keys()];
    },
    clear(accountId) {
      byAccount.delete(accountId);
    },
  };
}
