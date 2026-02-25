import type { Rule, Transaction } from '../types/models';

export interface LedgerRepository {
  getTransactions(): Transaction[];
  saveTransactions(transactions: Transaction[]): void;
  getRules(): Rule[];
  saveRules(rules: Rule[]): void;
}

const TX_KEY = 'ledgerlite.transactions';
const RULE_KEY = 'ledgerlite.rules';

export class LocalStorageLedgerRepository implements LedgerRepository {
  getTransactions(): Transaction[] {
    const raw = localStorage.getItem(TX_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  }

  saveTransactions(transactions: Transaction[]): void {
    localStorage.setItem(TX_KEY, JSON.stringify(transactions));
  }

  getRules(): Rule[] {
    const raw = localStorage.getItem(RULE_KEY);
    return raw ? (JSON.parse(raw) as Rule[]) : [];
  }

  saveRules(rules: Rule[]): void {
    localStorage.setItem(RULE_KEY, JSON.stringify(rules));
  }
}
