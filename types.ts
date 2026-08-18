
export interface Transaction {
  billId: string;
  store: string;
  sales: number;
  discount: number;
  paidAmount: number;
  customerName: string;
  customerPhone: string;
  remarks: string;
  employee: string;
  date: string;
  discountPercentage: number;
  redemptionPercentage: number;
  pointsGained: number;
  pointsRedeemed: number;
}

export interface StoreBenchmarking {
  storeName: string;
  avgDiscount: number;
  totalSales: number;
  totalDiscount: number;
  category: 'High' | 'Low' | 'Average';
  suspiciousCount: number;
}

export interface SuspiciousLoyalty {
  phone: string;
  names: string[];
  transactionCount: number;
  stores: string[];
  employees: string[];
  flags: string[];
  totalPointsGained: number;
  totalPointsRedeemed: number;
  transactions?: Transaction[];
}

export interface AuditReport {
  overallAvgDiscount: number;
  totalTransactions: number;
  highDiscountBills: Transaction[]; // 10-25%
  extremeDiscountBills: Transaction[]; // 25-90%
  compBills: Transaction[]; // >=90%
  staffDiscountBills: Transaction[]; // Remarks/Name contains "Staff"
  excessiveLoyaltyBills: Transaction[]; // Redeemed > 25% of sales
  storeBenchmarking: StoreBenchmarking[];
  suspiciousLoyalty: SuspiciousLoyalty[];
  loyaltyThreshold: number;
  rawTransactions: Transaction[];
  aiExecutiveSummary: string;
  aiActionList: string[];
}
