export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  account?: string;
  category?: string;
  merchant?: string;
  tags?: string[];
  notes?: string;
  sourceFile?: string;
  importedAt: string;
};

export type Rule = {
  id: string;
  name: string;
  match: {
    contains?: string[];
    startsWith?: string[];
    regex?: string;
    account?: string;
  };
  set: {
    category?: string;
    tags?: string[];
  };
  priority: number;
  enabled: boolean;
};

export type ColumnMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  account?: string;
  category?: string;
};
