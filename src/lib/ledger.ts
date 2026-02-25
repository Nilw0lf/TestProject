import * as XLSX from 'xlsx';
import type { ColumnMapping, Rule, Transaction } from '../types/models';

export type ParsedSheet = {
  rows: Record<string, unknown>[];
  headers: string[];
};

export function parseWorkbook(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
          header: 1,
          raw: true,
          blankrows: false,
        });

        const headerRow = matrix.findIndex((row) => row.filter(Boolean).length >= 3);
        const headers = (matrix[headerRow] ?? []).map((h, idx) => String(h ?? `Column ${idx + 1}`).trim());
        const rows = matrix.slice(headerRow + 1).map((row) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((header, idx) => {
            obj[header] = row[idx];
          });
          return obj;
        });
        resolve({ rows, headers });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function normalizeTransactions(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  sourceFile: string,
): Transaction[] {
  const importedAt = new Date().toISOString();
  return rows
    .map((row) => {
      const description = String(row[mapping.description] ?? '').trim();
      if (!description) return null;

      const amount = deriveAmount(row, mapping);
      if (Number.isNaN(amount)) return null;

      const date = normalizeDate(row[mapping.date]);
      const account = mapping.account ? String(row[mapping.account] ?? '').trim() : '';
      const category = mapping.category ? String(row[mapping.category] ?? '').trim() : '';

      return {
        id: createStableId(date, amount, description, account),
        date,
        description,
        amount,
        account: account || undefined,
        category: category || undefined,
        merchant: extractMerchant(description),
        importedAt,
        sourceFile,
      } as Transaction;
    })
    .filter((tx): tx is Transaction => !!tx);
}

function deriveAmount(row: Record<string, unknown>, mapping: ColumnMapping): number {
  if (mapping.amount) {
    const raw = Number(row[mapping.amount]);
    if (Number.isFinite(raw)) return raw;
  }
  const debit = mapping.debit ? Number(row[mapping.debit]) : 0;
  const credit = mapping.credit ? Number(row[mapping.credit]) : 0;
  if (Number.isFinite(debit) || Number.isFinite(credit)) {
    return (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0);
  }
  return Number.NaN;
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d).toISOString();
    }
  }
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  return new Date().toISOString();
}

function extractMerchant(description: string): string {
  return description.replace(/\d+/g, '').split(/\s+/).slice(0, 3).join(' ').trim();
}

function createStableId(date: string, amount: number, description: string, account?: string): string {
  const base = `${date}|${amount.toFixed(2)}|${description.toLowerCase()}|${(account ?? '').toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `tx_${Math.abs(hash)}`;
}

export function dedupeTransactions(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const map = new Map(existing.map((tx) => [tx.id, tx]));
  for (const tx of incoming) map.set(tx.id, tx);
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export function applyRules(transactions: Transaction[], rules: Rule[]): Transaction[] {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);
  return transactions.map((tx) => {
    const next = { ...tx };
    for (const rule of sorted) {
      if (matchesRule(next, rule)) {
        if (rule.set.category) next.category = rule.set.category;
        if (rule.set.tags) next.tags = [...new Set([...(next.tags ?? []), ...rule.set.tags])];
      }
    }
    return next;
  });
}

function matchesRule(tx: Transaction, rule: Rule): boolean {
  const target = tx.description.toLowerCase();
  const contains = rule.match.contains?.every((term) => target.includes(term.toLowerCase())) ?? true;
  const startsWith =
    rule.match.startsWith?.some((term) => target.startsWith(term.toLowerCase())) ?? true;
  const account = rule.match.account ? tx.account === rule.match.account : true;
  const regex = rule.match.regex ? new RegExp(rule.match.regex, 'i').test(tx.description) : true;
  return contains && startsWith && account && regex;
}
