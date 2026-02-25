import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { applyRules, dedupeTransactions, normalizeTransactions, parseWorkbook } from './lib/ledger';
import { LocalStorageLedgerRepository } from './storage/repository';
import type { ColumnMapping, Rule, Transaction } from './types/models';

const repository = new LocalStorageLedgerRepository();

const defaultMapping: ColumnMapping = {
  date: '',
  description: '',
  amount: '',
};

const categoryOptions = ['Food', 'Transport', 'Housing', 'Salary', 'Shopping', 'Utilities', 'Other'];

export default function App() {
  // Local state keeps v1 lightweight/offline; repository abstraction allows swapping storage later.
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(defaultMapping);
  const [transactions, setTransactions] = useState<Transaction[]>(repository.getTransactions());
  const [rules, setRules] = useState<Rule[]>(repository.getRules());
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const visibleTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesQuery = `${tx.description} ${tx.account ?? ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = filterCategory === 'all' || tx.category === filterCategory;
      return matchesQuery && matchesCategory;
    });
  }, [transactions, query, filterCategory]);

  const analytics = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const tx of visibleTransactions) {
      byCategory.set(tx.category ?? 'Uncategorized', (byCategory.get(tx.category ?? 'Uncategorized') ?? 0) + tx.amount);
      const month = tx.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + tx.amount);
    }
    return {
      categories: Array.from(byCategory, ([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
      months: Array.from(byMonth, ([month, total]) => ({ month, total: Math.round(total * 100) / 100 })),
    };
  }, [visibleTransactions]);

  async function handleFile(file: File) {
    const parsed = await parseWorkbook(file);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoMap(parsed.headers));
    setStep(1);
  }

  function handleImport() {
    const normalized = normalizeTransactions(rows, mapping, fileName);
    const withRules = applyRules(normalized, rules);
    const merged = dedupeTransactions(transactions, withRules);
    setTransactions(merged);
    repository.saveTransactions(merged);
    setStep(3);
  }

  function updateTransaction(id: string, patch: Partial<Transaction>) {
    const next = transactions.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx));
    setTransactions(next);
    repository.saveTransactions(next);
  }

  function addRule() {
    const rule: Rule = {
      id: crypto.randomUUID(),
      name: 'New rule',
      priority: 100,
      enabled: true,
      match: { contains: [''] },
      set: { category: 'Other' },
    };
    const next = [...rules, rule];
    setRules(next);
    repository.saveRules(next);
  }

  function rerunRules() {
    const next = applyRules(transactions, rules);
    setTransactions(next);
    repository.saveTransactions(next);
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">LedgerLite</h1>
        <p className="text-slate-600">Import Excel transactions, map columns, and build a searchable ledger.</p>
      </header>

      <section className="rounded-xl bg-white p-4 shadow space-y-4">
        <div className="flex gap-2 text-sm">
          {['Upload', 'Preview', 'Column Mapper', 'Ledger'].map((label, idx) => (
            <div key={label} className={`rounded-full px-3 py-1 ${idx <= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {label}
            </div>
          ))}
        </div>

        {step === 0 && (
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full rounded border p-3"
          />
        )}

        {step === 1 && (
          <div>
            <h2 className="font-semibold mb-2">Preview (first 20 rows)</h2>
            <div className="overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>{headers.map((header) => <th key={header} className="px-2 py-1 text-left">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className="border-t">{headers.map((header) => <td key={header} className="px-2 py-1">{String(row[header] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setStep(2)} className="mt-3 rounded bg-blue-600 text-white px-4 py-2">Continue to mapping</button>
          </div>
        )}

        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-3">
            {(
              [
                ['date', 'Date'],
                ['description', 'Description'],
                ['amount', 'Amount'],
                ['debit', 'Debit'],
                ['credit', 'Credit'],
                ['account', 'Account'],
                ['category', 'Category'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <div className="font-medium">{label}</div>
                <select
                  className="mt-1 w-full rounded border p-2"
                  value={mapping[key] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
            <div className="md:col-span-2">
              <button onClick={handleImport} className="rounded bg-emerald-600 text-white px-4 py-2">Import transactions</button>
            </div>
          </div>
        )}
      </section>

      {step >= 3 && (
        <>
          <section className="rounded-xl bg-white p-4 shadow space-y-3">
            <h2 className="font-semibold text-lg">Rules</h2>
            <div className="flex gap-2">
              <button onClick={addRule} className="rounded border px-3 py-1">Add rule</button>
              <button onClick={rerunRules} className="rounded bg-blue-600 text-white px-3 py-1">Apply rules</button>
            </div>
            {rules.map((rule) => (
              <div key={rule.id} className="grid md:grid-cols-5 gap-2 text-sm border rounded p-2">
                <input value={rule.name} onChange={(e) => updateRule(rules, setRules, rule.id, { name: e.target.value })} className="border rounded p-1" />
                <input value={rule.match.contains?.[0] ?? ''} onChange={(e) => updateRule(rules, setRules, rule.id, { match: { ...rule.match, contains: [e.target.value] } })} className="border rounded p-1" placeholder="Description contains" />
                <select value={rule.set.category ?? ''} onChange={(e) => updateRule(rules, setRules, rule.id, { set: { ...rule.set, category: e.target.value } })} className="border rounded p-1">
                  {categoryOptions.map((category) => <option key={category}>{category}</option>)}
                </select>
                <input type="number" value={rule.priority} onChange={(e) => updateRule(rules, setRules, rule.id, { priority: Number(e.target.value) })} className="border rounded p-1" />
                <label className="flex items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={(e) => updateRule(rules, setRules, rule.id, { enabled: e.target.checked })} />Enabled</label>
              </div>
            ))}
          </section>

          <section className="rounded-xl bg-white p-4 shadow space-y-3">
            <h2 className="font-semibold text-lg">Ledger</h2>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description/account" className="rounded border p-2" />
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded border p-2">
                <option value="all">All categories</option>
                {Array.from(new Set(transactions.map((tx) => tx.category).filter(Boolean))).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="overflow-auto border rounded max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((tx) => (
                    <tr key={tx.id} className="border-t">
                      <td className="p-2">{tx.date.slice(0, 10)}</td>
                      <td className="p-2">{tx.description}</td>
                      <td className={`p-2 text-right ${tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.amount.toFixed(2)}</td>
                      <td className="p-2">
                        <select value={tx.category ?? 'Other'} onChange={(e) => updateTransaction(tx.id, { category: e.target.value })} className="border rounded p-1">
                          {categoryOptions.map((category) => <option key={category}>{category}</option>)}
                        </select>
                      </td>
                      <td className="p-2">{tx.account ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 shadow">
              <h3 className="font-semibold mb-2">Category Mix</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.categories} dataKey="value" nameKey="name" outerRadius={90} label />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 shadow">
              <h3 className="font-semibold mb-2">Monthly Net Flow</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.months}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function autoMap(headers: string[]): ColumnMapping {
  const find = (keys: string[]) => headers.find((h) => keys.some((key) => h.toLowerCase().includes(key)));
  return {
    date: find(['date', 'posted']) ?? '',
    description: find(['description', 'memo', 'narration']) ?? '',
    amount: find(['amount']) ?? '',
    debit: find(['debit', 'withdrawal']) ?? '',
    credit: find(['credit', 'deposit']) ?? '',
    account: find(['account']) ?? '',
    category: find(['category']) ?? '',
  };
}

function updateRule(
  rules: Rule[],
  setRules: (rules: Rule[]) => void,
  id: string,
  patch: Partial<Rule>,
) {
  const repo = new LocalStorageLedgerRepository();
  const next = rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
  setRules(next);
  repo.saveRules(next);
}
