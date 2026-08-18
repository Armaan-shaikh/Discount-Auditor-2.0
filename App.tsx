
import React, { useState, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend 
} from 'recharts';
import { 
  ShieldAlert, 
  FileUp, 
  LayoutDashboard, 
  TrendingDown, 
  Users, 
  AlertCircle, 
  FileText, 
  Activity, 
  ArrowRightCircle, 
  UploadCloud, 
  Download, 
  UserCheck, 
  MapPin, 
  RotateCcw, 
  Calendar,
  MessageSquare,
  MessageSquareOff,
  Info,
  Flame,
  ChevronDown
} from 'lucide-react';
import { Transaction, AuditReport, StoreBenchmarking, SuspiciousLoyalty } from './types';
import { getForensicSummary } from './geminiService';
import { StatsCard } from './components/StatsCard';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'bills' | 'loyalty' | 'stores'>('dashboard');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [manualThreshold, setManualThreshold] = useState<number | null>(null);

  const resetData = useCallback(() => {
    setReport(null);
    setLoading(false);
    setManualThreshold(null);
    setActiveTab('dashboard');
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
      (input as HTMLInputElement).value = '';
    });
  }, []);

  const processFile = useCallback((file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        const parsed: Transaction[] = jsonData.map((row, idx) => {
          const rowKeys = Object.keys(row);
          const findVal = (keys: string[]) => {
            const match = rowKeys.find(k => {
              const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              return keys.some(key => normalizedK === key.toLowerCase().replace(/[^a-z0-9]/g, ''));
            });
            return match ? row[match] : undefined;
          };

          const sales = parseFloat(findVal(['sales', 'grosssales', 'total', 'billamount', 'grossamount', 'totalsales', 'billamount', 'gross_sales', 'amount'])) || 0;
          const parsedDiscount = Math.abs(parseFloat(findVal(['discount', '(-)discount', 'discounts', 'discountamt', 'discamt', 'disc', 'discountamount', 'discount_amt'])) || 0);
          const parsedRedemptionAmt = Math.abs(parseFloat(findVal(['loyaltypointsredeemed', 'pointsredeemed', 'used', 'pts-', 'redeemed', 'pointsburnt', 'points_redeemed', 'pts_used', 'redeemedamount', 'redeem_amt', 'points_redeem'])) || 0);
          const paid = parseFloat(findVal(['paidamount', 'netbill', 'finalamount', 'netsales', 'netamount', 'paid_amount', 'net_sales'])) || 0;
          const pointsGained = parseFloat(findVal(['loyaltypointsearned', 'pointsgained', 'earned', 'pts+', 'loyaltyearned', 'pointsadded', 'points_earned', 'pts_earned'])) || 0;
          const billDate = String(findVal(['date', 'billdate', 'timestamp', 'datetime', 'bill_date', 'transaction_date', 'orderlogtime', 'order_log_time']) || new Date().toISOString());

          const directDiscount = Math.max(0, parsedDiscount - parsedRedemptionAmt);
          const rawDiscPercentage = sales > 0 ? (directDiscount / sales) * 100 : 0;
          const discountPercentage = Math.round((rawDiscPercentage + Number.EPSILON) * 100) / 100;
          
          const rawRedemptionPercentage = sales > 0 ? (parsedRedemptionAmt / sales) * 100 : 0;
          const redemptionPercentage = Math.round((rawRedemptionPercentage + Number.EPSILON) * 100) / 100;
          
          return {
            billId: String(findVal(['billid', 'billno', 'invoice', 'receipt', 'bill_no', 'bill_id', 'inv_no']) || `B-${idx}`),
            store: String(findVal(['store', 'outlet', 'location', 'branch', 'shop', 'store_name']) || 'Unknown'),
            sales,
            discount: directDiscount,
            paidAmount: paid,
            customerName: String(findVal(['customername', 'name', 'customer', 'custname', 'cust_name', 'customer_name']) || 'Guest'),
            customerPhone: String(findVal(['phone', 'customerphone', 'mobile', 'contact', 'cust_mobile', 'phone_no']) || '0000000000').toString().trim(),
            remarks: String(findVal(['remarks', 'reason', 'comment', 'discreason', 'note', 'discount_reason', 'remarks_field']) || ''),
            employee: String(findVal(['employee', 'staff', 'cashier', 'user', 'cashier_name', 'staff_name', 'operator']) || 'N/A'),
            date: billDate,
            discountPercentage,
            redemptionPercentage,
            pointsGained,
            pointsRedeemed: parsedRedemptionAmt
          };
        }).filter(t => {
          const remarksLower = t.remarks.toLowerCase();
          const isMrpExcluded = remarksLower.includes('mrp'); 
          const hasReasonableData = t.sales > 0 || t.discount > 0 || t.pointsGained > 0 || t.pointsRedeemed > 0;
          return hasReasonableData && !isMrpExcluded;
        });

        if (parsed.length === 0) {
          alert("No valid retail records detected. Ensure your Excel has columns for Sales, Discount, and Bill Date.");
          setLoading(false);
          return;
        }

        await runAudit(parsed);
      } catch (err) {
        console.error("Critical parsing error:", err);
        alert("Failed to read Excel. Ensure file isn't corrupted and has valid headers.");
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
      event.target.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const runAudit = async (transactions: Transaction[]) => {
    const totalSales = transactions.reduce((sum, t) => sum + t.sales, 0);
    const totalDiscount = transactions.reduce((sum, t) => sum + t.discount, 0);
    const overallAvgDiscount = totalSales > 0 ? (totalDiscount / totalSales) * 100 : 0;

    // First identify Staff Discounts using keywords
    const isStaff = (t: Transaction) => {
      const r = t.remarks.toLowerCase();
      const n = t.customerName.toLowerCase();
      return r.includes('staff') || n.includes('staff') || r.includes('internal') || r.includes('employee');
    };

    const staffDiscountBills = transactions.filter(isStaff);

    // Identify other tiers while EXCLUDING staff bills to prevent overlap
    const highDiscountBills = transactions.filter(t => t.discountPercentage >= 10 && t.discountPercentage < 25 && !isStaff(t));
    const extremeDiscountBills = transactions.filter(t => t.discountPercentage >= 25 && t.discountPercentage < 90 && !isStaff(t));
    const compBills = transactions.filter(t => t.discountPercentage >= 90 && !isStaff(t));
    
    const excessiveLoyaltyBills = transactions.filter(t => t.redemptionPercentage >= 25);

    const timestamps = transactions.map(t => new Date(t.date).getTime()).filter(ts => !isNaN(ts));
    const minTs = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
    const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
    const spanInDays = (maxTs - minTs) / (1000 * 60 * 60 * 24);
    
    let loyaltyThreshold = 10;
    if (spanInDays <= 5) loyaltyThreshold = 3;
    else if (spanInDays <= 15) loyaltyThreshold = 5;
    else loyaltyThreshold = 10;

    const storeMap = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      const list = storeMap.get(t.store) || [];
      list.push(t);
      storeMap.set(t.store, list);
    });

    const storeBenchmarking: StoreBenchmarking[] = Array.from(storeMap.entries()).map(([storeName, txs]) => {
      const sSales = txs.reduce((sum, t) => sum + t.sales, 0);
      const sDisc = txs.reduce((sum, t) => sum + t.discount, 0);
      const avg = sSales > 0 ? (sDisc / sSales) * 100 : 0;
      let category: 'High' | 'Low' | 'Average' = 'Average';
      if (avg >= overallAvgDiscount * 1.5) category = 'High';
      else if (avg <= overallAvgDiscount * 0.5) category = 'Low';
      return { storeName, avgDiscount: avg, totalSales: sSales, totalDiscount: sDisc, category, suspiciousCount: txs.filter(t => t.discountPercentage >= 10).length };
    }).sort((a, b) => b.avgDiscount - a.avgDiscount);

    const baseReport: AuditReport = {
      overallAvgDiscount, totalTransactions: transactions.length, 
      highDiscountBills, extremeDiscountBills, compBills, staffDiscountBills, excessiveLoyaltyBills,
      storeBenchmarking, suspiciousLoyalty: [], // Will be memoized
      loyaltyThreshold,
      rawTransactions: transactions,
      aiExecutiveSummary: "Auditor AI analyzing patterns...", aiActionList: []
    };

    setReport(baseReport);
    try {
      const aiResponse = await getForensicSummary(baseReport);
      setReport(prev => prev ? { ...prev, aiExecutiveSummary: aiResponse.executiveSummary, aiActionList: aiResponse.actionList } : null);
    } catch (e) {
      console.warn("AI summary failed", e);
    }
    setLoading(false);
  };

  const effectiveLoyaltyThreshold = useMemo(() => {
    if (manualThreshold !== null) return manualThreshold;
    return report?.loyaltyThreshold || 10;
  }, [manualThreshold, report?.loyaltyThreshold]);

  const dynamicSuspiciousLoyalty = useMemo(() => {
    if (!report?.rawTransactions) return [];
    
    const phoneMap = new Map<string, { names: Set<string>; txs: Transaction[] }>();
    report.rawTransactions.forEach(t => {
      const phone = t.customerPhone;
      const isRepetitive = /^(.)\1+$/.test(phone);
      const isCommonDummy = ['1234567890', '0123456789', '9876543210', '0000000000'].includes(phone);
      const isTooShort = phone.length < 5;
      if (isRepetitive || isCommonDummy || isTooShort) return; 

      const entry = phoneMap.get(phone) || { names: new Set(), txs: [] };
      entry.names.add(t.customerName);
      entry.txs.push(t);
      phoneMap.set(phone, entry);
    });

    return Array.from(phoneMap.entries())
      .filter(([phone, entry]) => entry.txs.length >= effectiveLoyaltyThreshold)
      .map(([phone, entry]) => {
        const flags: string[] = [];
        const uniqueNames = Array.from(entry.names);
        const stores = Array.from(new Set(entry.txs.map(t => t.store)));
        const totalPointsGained = entry.txs.reduce((sum, t) => sum + t.pointsGained, 0);
        const totalPointsRedeemed = entry.txs.reduce((sum, t) => sum + t.pointsRedeemed, 0);
        
        if (uniqueNames.length > 2) flags.push("Proxy ID (Multi-Name)");
        if (entry.txs.length > 20) flags.push("Critical Frequency");
        if (stores.length > 3) flags.push("Multi-Store Footprint");
        if (totalPointsRedeemed > 0) flags.push("Cash-Out Points");

        return { 
          phone, names: uniqueNames, transactionCount: entry.txs.length, 
          stores: stores, employees: Array.from(new Set(entry.txs.map(t => t.employee))), 
          flags, totalPointsGained, totalPointsRedeemed,
          transactions: entry.txs
        };
      })
      .sort((a, b) => b.transactionCount - a.transactionCount);
  }, [report?.rawTransactions, effectiveLoyaltyThreshold]);

  const exportListToExcel = (list: Transaction[], filename: string) => {
    try {
      if (!list || list.length === 0) {
        alert("No records found for this export criteria.");
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(list);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Forensic Data");
      const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      XLSX.writeFile(workbook, `${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Excel Export Error:", err);
      alert("Failed to generate file.");
    }
  };

  const exportWithRemarksFilter = (list: Transaction[], baseName: string, hasRemarks: boolean) => {
    const filtered = list.filter(t => {
      const exists = t.remarks && t.remarks.trim().length >= 2;
      return hasRemarks ? exists : !exists;
    });
    const suffix = hasRemarks ? "WITH_REMARKS" : "NO_REMARKS";
    exportListToExcel(filtered, `${baseName}_${suffix}`);
  };

  const chartData = useMemo(() => {
    if (!report) return [];
    return [...report.storeBenchmarking].slice(0, 10);
  }, [report]);

  const discountDistData = useMemo(() => {
    if (!report) return [];
    return [
      { name: '10-25%', value: report.highDiscountBills.length, color: '#f59e0b' },
      { name: '25-90%', value: report.extremeDiscountBills.length, color: '#ef4444' },
      { name: '>=90%', value: report.compBills.length, color: '#991b1b' },
    ].filter(d => d.value > 0);
  }, [report]);

  const combinedBills = useMemo(() => {
    if (!report) return [];
    const all = [...report.staffDiscountBills, ...report.compBills, ...report.extremeDiscountBills, ...report.highDiscountBills, ...report.excessiveLoyaltyBills];
    const unique = Array.from(new Map(all.map(item => [item.billId, item])).values());
    return unique.slice(0, 500);
  }, [report]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">Forensic Discount Auditor</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-all text-sm font-bold shadow-lg shadow-blue-900/20 active:scale-95">
            <FileUp className="w-4 h-4" />
            UPLOAD POS DATA
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {!report && !loading && (
          <div 
            className={`flex flex-col items-center justify-center py-24 text-center space-y-8 border-2 border-dashed rounded-[2rem] transition-all duration-500 ${
              dragActive ? 'border-blue-500 bg-blue-500/10 scale-[1.01]' : 'border-slate-800 bg-slate-900/20'
            }`}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
          >
            <div className={`p-10 rounded-full border transition-all duration-500 ${dragActive ? 'bg-blue-600/30 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'bg-slate-900 border-slate-800'}`}>
              <UploadCloud className={`w-20 h-20 ${dragActive ? 'text-blue-300' : 'text-slate-700'}`} />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-white tracking-tight">Drop POS Excel for Forensic Review</h2>
              <p className="text-slate-400 max-w-lg mt-2 mx-auto leading-relaxed">Instantly audit Sales, Inclusive Discounts (&gt;=10%), and Customer Loyalty Integrity for potential revenue leakage.</p>
            </div>
            <button onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()} className="bg-white hover:bg-slate-100 text-slate-950 px-10 py-4 rounded-2xl shadow-xl transition-all font-bold uppercase tracking-widest active:scale-95">Select File</button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
              <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-blue-500 relative"></div>
            </div>
            <p className="text-blue-400 font-mono animate-pulse uppercase tracking-[0.3em] text-[10px] font-black">Executing Deep Pattern Recognition...</p>
          </div>
        )}

        {report && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-slate-800">
              <div className="flex gap-8">
                {[
                  { id: 'dashboard', icon: LayoutDashboard, label: 'DASHBOARD' },
                  { id: 'bills', icon: FileText, label: 'AUDIT FLAGS' },
                  { id: 'loyalty', icon: Users, label: 'LOYALTY INTEGRITY' },
                  { id: 'stores', icon: Activity, label: 'STORE BENCHMARKS' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 pb-5 transition-all relative font-black text-xs tracking-widest ${activeTab === tab.id ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}>
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] rounded-t-full"></div>}
                  </button>
                ))}
              </div>
              
              <button 
                onClick={resetData}
                className="flex items-center gap-2 text-slate-500 hover:text-red-400 pb-5 transition-all group font-bold text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-60deg] transition-transform" />
                <span>RESET DATA</span>
              </button>
            </div>

            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatsCard title="Avg Discount" value={`${report.overallAvgDiscount.toFixed(2)}%`} color="blue" icon={<TrendingDown className="text-blue-400 w-5 h-5" />} />
                  <StatsCard title="General Flags" value={report.highDiscountBills.length} subtitle="10% - 25% Range" color="yellow" icon={<AlertCircle className="text-yellow-400 w-5 h-5" />} />
                  <StatsCard title="Staff Entry" value={report.staffDiscountBills.length} subtitle="Internal ID Usage" color="green" icon={<UserCheck className="text-green-400 w-5 h-5" />} />
                  <StatsCard title="Loyalty Burn" value={report.excessiveLoyaltyBills.length} subtitle=">= 25% Redemption" color="red" icon={<Flame className="text-red-400 w-5 h-5" />} />
                  <StatsCard title="Suspicious Users" value={dynamicSuspiciousLoyalty.length} subtitle={`Benchmark: >=${effectiveLoyaltyThreshold} bills`} color="blue" icon={<Users className="text-blue-400 w-5 h-5" />} />
                </div>

                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="bg-slate-800/40 px-6 py-5 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ShieldAlert className="w-5 h-5 text-blue-400" />
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white">Forensic Auditor Intelligence</h3>
                      </div>
                    </div>
                    <div className="p-8">
                      <p className="text-slate-300 leading-relaxed italic border-l-4 border-blue-500/50 pl-6 py-2 mb-8 text-lg font-light tracking-tight">"{report.aiExecutiveSummary}"</p>
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Critical Action Items</h4>
                        {report.aiActionList.map((action, i) => (
                          <div key={i} className="flex items-start gap-4 bg-slate-800/20 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800/40 transition-all group">
                            <ArrowRightCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
                            <span className="text-sm text-slate-300 font-medium">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-xl">
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white mb-8">Top Discount Leakage Points (Stores)</h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="storeName" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                          <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                          <Bar dataKey="avgDiscount" fill="#3b82f6" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.avgDiscount > report.overallAvgDiscount * 1.5 ? '#f43f5e' : '#3b82f6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-xl">
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white mb-8">Flag Composition</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={discountDistData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" cornerRadius={6} isAnimationActive={false}>
                            {discountDistData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px' }} />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase'}} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-red-950/20 rounded-3xl border border-red-500/20 p-8 shadow-inner">
                    <div className="flex items-center gap-3 text-red-500 mb-6">
                      <AlertCircle className="w-6 h-6" />
                      <h3 className="font-black text-xs uppercase tracking-[0.2em]">Risk Highlights</h3>
                    </div>
                    <div className="space-y-5">
                      {report.excessiveLoyaltyBills.length > 0 && <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-xs font-bold"><span className="text-indigo-500 text-lg mr-2">{report.excessiveLoyaltyBills.length}</span> Loyalty Burn (&gt;=25%) Bills</div>}
                      {report.compBills.length > 0 && <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 text-xs font-bold"><span className="text-red-500 text-lg mr-2">{report.compBills.length}</span> Critical (&gt;=90%) Discounts</div>}
                      {report.extremeDiscountBills.length > 0 && <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 text-xs font-bold"><span className="text-orange-500 text-lg mr-2">{report.extremeDiscountBills.length}</span> Extreme (25-90%) Discounts</div>}
                      {report.highDiscountBills.length > 0 && <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-xs font-bold"><span className="text-yellow-500 text-lg mr-2">{report.highDiscountBills.length}</span> General Flags (10-25%)</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bills' && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-slate-800 bg-slate-800/30">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div className="space-y-1">
                      <h3 className="font-black text-sm uppercase tracking-widest text-white">Leakage Detail List</h3>
                      <p className="text-slate-500 text-xs font-medium">Download separate lists for accounts with/without remarks.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {[
                      { label: 'STAFF AUDIT', list: report.staffDiscountBills, key: 'staff', color: 'emerald' },
                      { label: 'LOYALTY BURN (>=25%)', list: report.excessiveLoyaltyBills, key: 'burn', color: 'indigo' },
                      { label: 'GENERAL 10-25%', list: report.highDiscountBills, key: 'high', color: 'yellow' },
                      { label: 'EXTREME 25-90%', list: report.extremeDiscountBills, key: 'orange', color: 'orange' },
                      { label: 'CRITICAL >=90%', list: report.compBills, key: 'comp', color: 'red' },
                    ].map(section => {
                      const withRemarksCount = section.list.filter(t => t.remarks && t.remarks.trim().length >= 2).length;
                      const noRemarksCount = section.list.length - withRemarksCount;
                      
                      return (
                        <div key={section.key} className="bg-slate-800/20 rounded-2xl border border-slate-700/50 p-4 space-y-3">
                          <div className="flex justify-between items-center px-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{section.label}</div>
                            <div className="text-[10px] font-bold text-slate-500 font-mono">[{section.list.length}]</div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {section.key === 'burn' ? (
                              <button 
                                onClick={() => exportListToExcel(section.list, section.label)} 
                                className="flex items-center justify-between text-[9px] bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl border border-slate-600 transition-all font-black uppercase tracking-tighter active:scale-95"
                              >
                                <span className="flex items-center gap-2">
                                  <Flame className="w-3 h-3 text-indigo-400" /> DOWNLOAD FULL LIST
                                </span>
                                <Download className="w-3 h-3 text-slate-500" />
                              </button>
                            ) : (
                              <>
                                <button 
                                  onClick={() => exportWithRemarksFilter(section.list, section.label, true)} 
                                  className="flex items-center justify-between text-[9px] bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl border border-slate-600 transition-all font-black uppercase tracking-tighter active:scale-95"
                                >
                                  <span className="flex items-center gap-2">
                                    <MessageSquare className="w-3 h-3 text-blue-400" /> WITH REMARKS <span className="text-slate-500">[{withRemarksCount}]</span>
                                  </span>
                                  <Download className="w-3 h-3 text-slate-500" />
                                </button>
                                <button 
                                  onClick={() => exportWithRemarksFilter(section.list, section.label, false)} 
                                  className="flex items-center justify-between text-[9px] bg-red-950/20 hover:bg-red-950/30 text-red-400 px-3 py-2 rounded-xl border border-red-500/20 transition-all font-black uppercase tracking-tighter active:scale-95"
                                >
                                  <span className="flex items-center gap-2">
                                    <MessageSquareOff className="w-3 h-3 text-red-500" /> NO REMARKS <span className="text-red-900">[{noRemarksCount}]</span>
                                  </span>
                                  <Download className="w-3 h-3 text-red-800" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-x-auto min-h-[450px]">
                  {combinedBills.length > 0 ? (
                    <table className="w-full text-xs text-left">
                      <thead className="text-[10px] uppercase bg-slate-800/70 text-slate-400 font-black tracking-widest border-b border-slate-700">
                        <tr>
                          <th className="px-8 py-5">Bill Identifier</th>
                          <th className="px-8 py-5">Location</th>
                          <th className="px-8 py-5 text-right">Gross Sales</th>
                          <th className="px-8 py-5 text-right">Disc %</th>
                          <th className="px-8 py-5 text-right">Redeem %</th>
                          <th className="px-8 py-5">Operator</th>
                          <th className="px-8 py-5">Audit Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {combinedBills.map((bill, i) => {
                          return (
                            <tr key={i} className="hover:bg-slate-800/40 transition-all group">
                              <td className="px-8 py-5 font-bold text-slate-300 group-hover:text-white">{bill.billId}</td>
                              <td className="px-8 py-5 text-slate-400">{bill.store}</td>
                              <td className="px-8 py-5 text-right font-mono text-slate-300">₹{bill.sales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className={`px-8 py-5 text-right font-black ${bill.discountPercentage >= 90 ? 'text-red-500' : bill.discountPercentage >= 25 ? 'text-orange-500' : 'text-yellow-500'}`}>
                                {bill.discountPercentage.toFixed(1)}%
                              </td>
                              <td className={`px-8 py-5 text-right font-black ${bill.redemptionPercentage >= 25 ? 'text-indigo-400' : 'text-slate-500'}`}>
                                {bill.redemptionPercentage.toFixed(1)}%
                              </td>
                              <td className="px-8 py-5 text-slate-500 font-medium">{bill.employee}</td>
                              <td className="px-8 py-5">
                                <div className="flex gap-2 items-center">
                                  {(!bill.remarks || bill.remarks.trim().length < 2) ? (
                                    <span className="text-[9px] px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded font-black tracking-tighter shadow-sm">NO REMARKS</span>
                                  ) : (
                                    <span className="text-slate-500 italic truncate max-w-[200px] inline-block font-light">"{bill.remarks}"</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-48 text-center text-slate-600 font-mono italic tracking-tighter text-sm">
                      Zero leakage patterns identified in current data set.
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'loyalty' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-5">
                <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                   <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <h3 className="font-black text-sm uppercase tracking-widest text-white">Loyalty Integrity Audit</h3>
                      <p className="text-slate-500 text-xs font-medium">Order log analysis: Proxy ID & frequency tracking.</p>
                    </div>
                    <div className="relative group">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                      <select 
                        value={effectiveLoyaltyThreshold}
                        onChange={(e) => setManualThreshold(parseInt(e.target.value))}
                        className="appearance-none bg-blue-500/10 text-blue-400 pl-11 pr-12 py-3 rounded-xl border border-blue-500/20 font-black uppercase tracking-widest text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer shadow-lg shadow-blue-500/5 transition-all hover:bg-blue-500/20"
                      >
                        <option value={3} className="bg-slate-900 text-slate-200 font-sans">THRESHOLD: &gt;= 3 BILLS (1-5 DAYS DATA)</option>
                        <option value={5} className="bg-slate-900 text-slate-200 font-sans">THRESHOLD: &gt;= 5 BILLS (5-15 DAYS DATA)</option>
                        <option value={10} className="bg-slate-900 text-slate-200 font-sans">THRESHOLD: &gt;= 10 BILLS (15+ DAYS DATA)</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none transition-transform group-hover:translate-y-[-2px]" />
                    </div>
                  </div>
                  <div className="p-8">
                    {dynamicSuspiciousLoyalty.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                          {dynamicSuspiciousLoyalty.slice(0, 60).map((s, i) => (
                            <div key={i} className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6 hover:border-blue-500/50 transition-all shadow-xl flex flex-col h-full group relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all"></div>
                              
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex flex-col">
                                  <span className="text-2xl font-black text-white font-mono group-hover:text-blue-400 transition-colors tracking-tighter">{s.phone}</span>
                                  <span className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] mt-1.5">ID Identity Track</span>
                                </div>
                                <div className="flex flex-col gap-1.5 items-end">
                                  {s.flags.map((f, idx) => (
                                    <span key={idx} className="text-[8px] px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg font-black uppercase tracking-tighter shadow-sm">{f}</span>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-6 flex-grow relative z-10">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 text-center">
                                    <div className="text-[8px] font-black uppercase text-green-500 mb-1.5 tracking-widest">EARNED PTS</div>
                                    <div className="text-xl font-black text-green-400 font-mono">+{s.totalPointsGained.toLocaleString()}</div>
                                  </div>
                                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 text-center">
                                    <div className="text-[8px] font-black uppercase text-orange-500 mb-1.5 tracking-widest">REDEEMED</div>
                                    <div className="text-xl font-black text-orange-400 font-mono">₹{s.totalPointsRedeemed.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</div>
                                  </div>
                                </div>

                                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50">
                                  <div className="flex items-center gap-2 mb-3">
                                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Store Footprint</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {s.stores.map((store, idx) => (
                                      <span key={idx} className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-bold">{store}</span>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-700/50 text-center">
                                    <div className="text-[8px] text-slate-500 uppercase font-black mb-1 tracking-widest">VISIT COUNT</div>
                                    <div className="text-xl font-black text-white font-mono">{s.transactionCount}</div>
                                  </div>
                                  <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-700/50 text-center">
                                    <div className="text-[8px] text-slate-500 uppercase font-black mb-1 tracking-widest">ALIASES</div>
                                    <div className="text-xl font-black text-white font-mono">{s.names.length}</div>
                                  </div>
                                </div>

                                <div>
                                  <div className="flex justify-between items-center mb-4">
                                    <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Registered Names:</div>
                                    <button 
                                      onClick={() => exportListToExcel(s.transactions || [], `loyalty_history_${s.phone}`)}
                                      className="flex items-center gap-2 text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-blue-900/20 transition-all font-black uppercase tracking-tighter active:scale-95"
                                    >
                                      <Download className="w-3 h-3" /> DOWNLOAD XLS
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.names.map((n, idx) => (
                                      <span key={idx} className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-[10px] border border-slate-600 truncate max-w-full inline-block font-medium">{n}</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-8 pt-6 border-t border-slate-700/50 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                  <span className="text-[9px] text-red-500 font-black uppercase tracking-widest">Flagged Review</span>
                                </div>
                                <div className="flex -space-x-2">
                                  {s.employees.slice(0, 4).map((e, idx) => (
                                    <div key={idx} className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-slate-300 uppercase shadow-lg" title={e}>{e.charAt(0)}</div>
                                  ))}
                                  {s.employees.length > 4 && (
                                    <div className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-slate-400">+{s.employees.length - 4}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {dynamicSuspiciousLoyalty.length > 60 && (
                          <div className="mt-12 p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex items-center justify-center gap-4 text-blue-400 font-bold italic text-xs uppercase tracking-widest">
                            <Info className="w-5 h-5" />
                            Displaying top 60 flagged accounts for performance. Use the global export to view all {dynamicSuspiciousLoyalty.length} accounts.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-48 text-center text-slate-600 font-mono italic text-sm">
                        Zero suspicious loyalty accounts identified using current {effectiveLoyaltyThreshold}-bill benchmark.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stores' && (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                  <div className="space-y-1">
                    <h3 className="font-black text-sm uppercase tracking-widest text-white">Store Benchmarking</h3>
                    <p className="text-slate-500 text-xs font-medium">Comparative risk assessment by location.</p>
                  </div>
                  <button 
                    onClick={() => {
                      const data = report.storeBenchmarking.map(s => ({
                        "Store": s.storeName,
                        "Avg Discount %": s.avgDiscount.toFixed(2),
                        "Total Revenue": s.totalSales,
                        "Audit Rank": s.category,
                        "Flags Count": s.suspiciousCount
                      }));
                      const worksheet = XLSX.utils.json_to_sheet(data);
                      const workbook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(workbook, worksheet, "Benchmarks");
                      XLSX.writeFile(workbook, `location_audit_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
                    }}
                    className="flex items-center gap-2 text-[9px] bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl border border-slate-600 font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> EXPORT LOCATION RANKING
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[10px] uppercase bg-slate-800/70 text-slate-400 font-black tracking-widest border-b border-slate-700">
                      <tr>
                        <th className="px-8 py-5">Location Identifier</th>
                        <th className="px-8 py-5 text-right">Avg Direct Disc %</th>
                        <th className="px-8 py-5 text-right">Aggregate Revenue</th>
                        <th className="px-8 py-5">Risk Probability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {report.storeBenchmarking.map((store, i) => (
                        <tr key={i} className="hover:bg-slate-800/40 transition-all">
                          <td className="px-8 py-5 font-black text-slate-300 uppercase tracking-tight">{store.storeName}</td>
                          <td className="px-8 py-5 text-right font-mono font-bold text-slate-300">{store.avgDiscount.toFixed(2)}%</td>
                          <td className="px-8 py-5 text-right font-mono text-slate-300">₹{store.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-8 py-5">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${store.category === 'High' ? 'bg-red-500/10 text-red-500 border-red-500/20' : store.category === 'Low' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                              {store.category} Risk
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-24 border-t border-slate-900 py-12 px-8 text-center text-slate-700 text-[9px] font-black uppercase tracking-[0.4em]">
        <p>Forensic Auditor Engine • v3.9.0 • Precision Loyalty Burn Mapping • Mutually Exclusive Leakage Audit</p>
      </footer>
    </div>
  );
};

export default App;
