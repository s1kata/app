import type { BonusTransaction } from '../types';

function parseTillDate(raw?: string): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 23, 59, 59);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  const dt = new Date(s.replace(' ', 'T'));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export interface BonusBalanceStats {
  balance: number;
  availableBalance: number;
  expiringWithin7Days: number;
  bcId: number | null;
}

export function computeBonusBalanceStats(transactions: BonusTransaction[]): BonusBalanceStats {
  const now = Date.now();
  const in7 = now + 7 * 24 * 60 * 60 * 1000;

  let gross = 0;
  let available = 0;
  let expiring7 = 0;
  let bcId: number | null = null;

  for (const t of transactions || []) {
    const amount = Math.floor(t.amount ?? 0);
    if (amount <= 0) continue;
    if (t.bcard_id > 0 && bcId == null) bcId = t.bcard_id;

    if (t.increase === 1) {
      gross += amount;
      const till = parseTillDate(t.amount_till_date);
      if (till && till.getTime() < now) continue;
      available += amount;
      if (till && till.getTime() <= in7) expiring7 += amount;
    } else if (t.decrease === 1) {
      gross -= amount;
      available -= amount;
    }
  }

  const avail = Math.max(0, available);
  return {
    balance: Math.max(0, gross),
    availableBalance: avail,
    expiringWithin7Days: Math.max(0, Math.min(expiring7, avail)),
    bcId,
  };
}
