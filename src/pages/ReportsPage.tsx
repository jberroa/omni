import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Transaction, Item, Employee, Location, Stock, InventoryCheck } from '../types/inventory';
import { startOfDay, format, subDays, eachDayOfInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  BarChart3, History, Search, TrendingUp, DollarSign, Package, Users, 
  Clock, ArrowDownRight, ArrowUpRight, FileSpreadsheet, FileDown, Loader2,
  ClipboardList, ChevronDown, ChevronRight
} from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { toEventDate } from '../lib/dates';

export function ReportsPage() {
  const { theme } = useTheme();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'history' | 'inventory'>('overview');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [inventoryLocationFilter, setInventoryLocationFilter] = useState('');
  const [inventoryEmployeeFilter, setInventoryEmployeeFilter] = useState('');
  const [inventoryStartDate, setInventoryStartDate] = useState('');
  const [inventoryEndDate, setInventoryEndDate] = useState('');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [overviewStartDate, setOverviewStartDate] = useState('');
  const [overviewEndDate, setOverviewEndDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [i, e, l, tx, s, checks] = await Promise.all([
          api.getItems(),
          api.getEmployees(),
          api.getLocations(),
          api.getTransactions({ limit: 8000 }),
          api.getStock(),
          api.getInventoryChecks({ limit: 8000 }),
        ]);
        if (!cancelled) {
          setItems(i);
          setEmployees(e);
          setLocations(l);
          setAllTransactions(tx);
          setStocks(s);
          setInventoryChecks(checks);
        }
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const filteredTransactions = allTransactions.filter(tx => {
    const item = items.find(i => i.id === tx.itemId);
    const location = locations.find(l => l.id === tx.locationId);
    const employee = employees.find(e => e.id === tx.employeeId);
    const searchLower = historySearchTerm.toLowerCase();
    const date = toEventDate(tx.timestamp);
    
    const matchesSearch = (
      item?.name.toLowerCase().includes(searchLower) ||
      location?.name.toLowerCase().includes(searchLower) ||
      employee?.name.toLowerCase().includes(searchLower)
    );

    const matchesType = historyTypeFilter === 'ALL' || tx.type === historyTypeFilter;

    const matchesDate = (() => {
      if (!historyStartDate && !historyEndDate) return true;
      const txDate = startOfDay(date);
      if (historyStartDate) {
        const start = startOfDay(new Date(historyStartDate));
        if (txDate < start) return false;
      }
      if (historyEndDate) {
        const end = startOfDay(new Date(historyEndDate));
        if (txDate > end) return false;
      }
      return true;
    })();
    
    return matchesSearch && matchesType && matchesDate;
  });

  const filteredInventoryChecks = inventoryChecks.filter((check) => {
    const location = locations.find((l) => l.id === check.locationId);
    const employee = employees.find((e) => e.id === check.employeeId);
    const date = toEventDate(check.timestamp);
    const searchLower = inventorySearchTerm.toLowerCase();

    const matchesLocation =
      !inventoryLocationFilter || check.locationId === inventoryLocationFilter;
    const matchesEmployee =
      !inventoryEmployeeFilter || check.employeeId === inventoryEmployeeFilter;

    const matchesSearch =
      location?.name.toLowerCase().includes(searchLower) ||
      employee?.name.toLowerCase().includes(searchLower) ||
      (check.lines ?? []).some((line) =>
        line.itemName.toLowerCase().includes(searchLower)
      );

    const matchesDate = (() => {
      if (!inventoryStartDate && !inventoryEndDate) return true;
      const checkDate = startOfDay(date);
      if (inventoryStartDate) {
        const start = startOfDay(new Date(inventoryStartDate));
        if (checkDate < start) return false;
      }
      if (inventoryEndDate) {
        const end = startOfDay(new Date(inventoryEndDate));
        if (checkDate > end) return false;
      }
      return true;
    })();

    return matchesLocation && matchesEmployee && matchesSearch && matchesDate;
  });

  const toggleCheckExpanded = (checkId: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      return next;
    });
  };

  const handleExportExcel = () => {
    const exportData = filteredTransactions.map(tx => {
      const item = items.find(i => i.id === tx.itemId);
      const location = locations.find(l => l.id === tx.locationId);
      const employee = employees.find(e => e.id === tx.employeeId);
      const date = toEventDate(tx.timestamp);
      const unitPrice = item?.price ?? 0;
      const totalValue = tx.quantity * unitPrice;

      return {
        'Type': tx.type === 'IN' ? 'Restock (IN)' : 'Check Out (OUT)',
        'Product': item?.name || 'Deleted Item',
        'SKU': item?.sku || 'N/A',
        'Location': location?.name || 'Deleted Location',
        'Staff': employee?.name || 'Deleted Staff',
        'Quantity': tx.quantity,
        'Unit Price': unitPrice,
        'Total Value': totalValue,
        'Date': format(date, 'yyyy-MM-dd'),
        'Time': format(date, 'HH:mm:ss')
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transaction History');
    XLSX.writeFile(wb, `inventory_history_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportInventoryExcel = () => {
    const exportData: Array<Record<string, string | number>> = [];
    for (const check of filteredInventoryChecks) {
      const location = locations.find((l) => l.id === check.locationId);
      const employee = employees.find((e) => e.id === check.employeeId);
      const date = toEventDate(check.timestamp);
      for (const line of check.lines ?? []) {
        exportData.push({
          'Check ID': check.id.slice(0, 8),
          Location: location?.name || 'Deleted Location',
          Staff: employee?.name || 'Deleted Staff',
          Date: format(date, 'yyyy-MM-dd'),
          Time: format(date, 'HH:mm:ss'),
          Item: line.itemName,
          Quantity: line.quantity,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Checks');
    XLSX.writeFile(wb, `inventory_checks_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    
    setIsGeneratingPDF(true);
    try {
      const element = reportRef.current;
      
      // Use html-to-image instead of html2canvas for better modern CSS support
      const dataUrl = await toPng(element, {
        quality: 0.95,
        backgroundColor: theme === 'dark' ? '#0c0a09' : '#ffffff',
        style: {
          padding: '20px',
          borderRadius: '0'
        },
        pixelRatio: 2
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      // Handle multi-page if content is too long
      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`inventory_report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const summaryData = React.useMemo(() => {
    const filteredTxs = allTransactions.filter(tx => {
      if (!overviewStartDate && !overviewEndDate) return true;
      const date = toEventDate(tx.timestamp);
      const txDate = startOfDay(date);
      if (overviewStartDate) {
        const start = startOfDay(new Date(overviewStartDate));
        if (txDate < start) return false;
      }
      if (overviewEndDate) {
        const end = startOfDay(new Date(overviewEndDate));
        if (txDate > end) return false;
      }
      return true;
    });

    const totalCheckouts = filteredTxs.filter(tx => tx.type === 'OUT').length;
    
    const totalValueOut = filteredTxs
      .filter(tx => tx.type === 'OUT')
      .reduce((acc, tx) => {
        const item = items.find(i => i.id === tx.itemId);
        return acc + (tx.quantity * (item?.price || 0));
      }, 0);

    const activeSKUs = items.length;
    const totalStaff = employees.length;

    // Helper to limit chart data and group "Others"
    const limitChartData = (data: any[], sortKey: string, limit: number = 10) => {
      if (data.length <= limit) return data;
      
      const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey]);
      const top = sorted.slice(0, limit - 1);
      const others = sorted.slice(limit - 1);
      
      const othersEntry: any = { name: 'Others' };
      // Sum all numeric keys for the "Others" entry
      Object.keys(sorted[0]).forEach(key => {
        if (typeof sorted[0][key] === 'number') {
          othersEntry[key] = others.reduce((acc, curr) => acc + (curr[key] || 0), 0);
        }
      });
      
      return [...top, othersEntry];
    };

    // Location Performance
    const rawLocationPerformance = locations.map(loc => {
      const locTxs = filteredTxs.filter(tx => tx.locationId === loc.id && tx.type === 'OUT');
      const value = locTxs.reduce((acc, tx) => {
        const item = items.find(i => i.id === tx.itemId);
        return acc + (tx.quantity * (item?.price || 0));
      }, 0);
      return {
        name: loc.name,
        checkouts: locTxs.length,
        value: value
      };
    });
    const locationPerformance = limitChartData(rawLocationPerformance, 'value');

    // Daily Activity (Last 7 days or selected range)
    let activityStart = subDays(new Date(), 6);
    let activityEnd = new Date();

    if (overviewStartDate) activityStart = new Date(overviewStartDate);
    if (overviewEndDate) activityEnd = new Date(overviewEndDate);

    // Limit activity chart to 31 days to prevent overcrowding
    const daysDiff = Math.ceil((activityEnd.getTime() - activityStart.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 31 && !overviewStartDate && !overviewEndDate) {
      activityStart = subDays(activityEnd, 30);
    }

    const activityInterval = eachDayOfInterval({
      start: startOfDay(activityStart),
      end: startOfDay(activityEnd)
    });

    const dailyActivity = activityInterval.map(date => {
      const dayStr = format(date, 'MMM dd');
      const dayTxs = filteredTxs.filter(tx => {
        const txDate = toEventDate(tx.timestamp);
        return format(txDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
      });

      return {
        date: dayStr,
        checkins: dayTxs.filter(tx => tx.type === 'IN').length,
        checkouts: dayTxs.filter(tx => tx.type === 'OUT').length
      };
    });

    // Inventory Value by Type (Current Snapshot - Not filtered by date)
    const rawInventoryValueByType = items.reduce((acc: any[], item) => {
      const itemStocks = stocks.filter(s => s.itemId === item.id);
      const totalQty = itemStocks.reduce((sum, s) => sum + s.quantity, 0);
      const value = totalQty * (item.price || 0);
      
      const typeName = item.type || 'Uncategorized';
      const existing = acc.find(a => a.name === typeName);
      if (existing) {
        existing.value += value;
      } else {
        acc.push({ name: typeName, value });
      }
      return acc;
    }, [])
    .filter(a => a.value > 0);
    const inventoryValueByType = limitChartData(rawInventoryValueByType, 'value', 8);

    // Top 5 Moving Products (by checkout quantity)
    const productMovement = items.map(item => {
      const checkouts = filteredTxs
        .filter(tx => tx.itemId === item.id && tx.type === 'OUT')
        .reduce((sum, tx) => sum + tx.quantity, 0);
      return {
        name: item.name,
        checkouts
      };
    }).sort((a, b) => b.checkouts - a.checkouts).slice(0, 5);

    // Inventory Value by Location (Current Snapshot - Not filtered by date)
    const rawInventoryValueByLocation = locations.map(loc => {
      const locStocks = stocks.filter(s => s.locationId === loc.id);
      const value = locStocks.reduce((acc, s) => {
        const item = items.find(i => i.id === s.itemId);
        return acc + (s.quantity * (item?.price || 0));
      }, 0);
      return {
        name: loc.name,
        value
      };
    });
    const inventoryValueByLocation = limitChartData(rawInventoryValueByLocation, 'value');

    // Value Delivered by Location (IN transactions)
    const rawValueDeliveredByLocation = locations.map(loc => {
      const locTxs = filteredTxs.filter(tx => tx.locationId === loc.id && tx.type === 'IN');
      const value = locTxs.reduce((acc, tx) => {
        const item = items.find(i => i.id === tx.itemId);
        return acc + (tx.quantity * (item?.price || 0));
      }, 0);
      return {
        name: loc.name,
        value
      };
    });
    const valueDeliveredByLocation = limitChartData(rawValueDeliveredByLocation, 'value');

    // Value Removed by Location (OUT transactions)
    const rawValueRemovedByLocation = locations.map(loc => {
      const locTxs = filteredTxs.filter(tx => tx.locationId === loc.id && tx.type === 'OUT');
      const value = locTxs.reduce((acc, tx) => {
        const item = items.find(i => i.id === tx.itemId);
        return acc + (tx.quantity * (item?.price || 0));
      }, 0);
      return {
        name: loc.name,
        value
      };
    });
    const valueRemovedByLocation = limitChartData(rawValueRemovedByLocation, 'value');

    return {
      totalCheckouts,
      totalValueOut,
      activeSKUs,
      totalStaff,
      locationPerformance,
      dailyActivity,
      inventoryValueByLocation,
      inventoryValueByType,
      productMovement,
      valueDeliveredByLocation,
      valueRemovedByLocation
    };
  }, [allTransactions, items, employees, locations, stocks, overviewStartDate, overviewEndDate]);

  const COLORS = ['#1c1917', '#44403c', '#78716c', '#a8a29e', '#d6d3d1'];
  const DARK_COLORS = ['#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#44403c'];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-bold text-stone-900 dark:text-white tracking-tight">System Reports</h2>
          <p className="text-stone-500 dark:text-stone-400 mt-2">Comprehensive overview of inventory performance and transaction history.</p>
        </div>
        {activeSubTab === 'overview' && (
          <button
            onClick={handleExportPDF}
            disabled={isGeneratingPDF}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-2xl text-sm font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF Report'}
          </button>
        )}
      </header>

      <div className="flex items-center gap-4 border-b border-stone-100 dark:border-stone-800 pb-4">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'overview' ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-md" : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'history' ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-md" : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
          }`}
        >
          <History className="w-4 h-4" />
          History
        </button>
        <button
          onClick={() => setActiveSubTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'inventory' ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-md" : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Inventory Reports
        </button>
      </div>

      {activeSubTab === 'inventory' ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">Inventory Check History</h3>
              <button
                onClick={handleExportInventoryExcel}
                className="flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl text-xs font-bold hover:bg-stone-200 dark:hover:bg-stone-700 transition-all"
                title="Download as Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400" />
                Export Excel
              </button>
            </div>
            <div className="flex items-center gap-4 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500" />
                <input
                  type="text"
                  placeholder="Search by item, location, or staff..."
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 transition-all shadow-sm"
                  value={inventorySearchTerm}
                  onChange={(e) => setInventorySearchTerm(e.target.value)}
                />
              </div>
              <div className="bg-stone-100 dark:bg-stone-800 px-4 py-3 rounded-2xl text-xs font-bold text-stone-600 dark:text-stone-400 whitespace-nowrap">
                {filteredInventoryChecks.length} Checks
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-stone-900 p-6 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Location</label>
              <select
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={inventoryLocationFilter}
                onChange={(e) => setInventoryLocationFilter(e.target.value)}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">User</label>
              <select
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={inventoryEmployeeFilter}
                onChange={(e) => setInventoryEmployeeFilter(e.target.value)}
              >
                <option value="">All Staff</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">From</label>
              <input
                type="date"
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={inventoryStartDate}
                onChange={(e) => setInventoryStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">To</label>
              <input
                type="date"
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={inventoryEndDate}
                onChange={(e) => setInventoryEndDate(e.target.value)}
              />
            </div>
            {(inventoryLocationFilter || inventoryEmployeeFilter || inventoryStartDate || inventoryEndDate) && (
              <button
                onClick={() => {
                  setInventoryLocationFilter('');
                  setInventoryEmployeeFilter('');
                  setInventoryStartDate('');
                  setInventoryEndDate('');
                }}
                className="text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white uppercase tracking-widest ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest w-10"></th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Staff</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Items</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredInventoryChecks.map((check) => {
                    const location = locations.find((l) => l.id === check.locationId);
                    const employee = employees.find((e) => e.id === check.employeeId);
                    const date = toEventDate(check.timestamp);
                    const isExpanded = expandedChecks.has(check.id);
                    const lineCount = check.lines?.length ?? 0;

                    return (
                      <React.Fragment key={check.id}>
                        <tr
                          className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer"
                          onClick={() => toggleCheckExpanded(check.id)}
                        >
                          <td className="px-6 py-4">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-stone-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-stone-400" />
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">
                            {location?.name || 'Deleted Location'}
                          </td>
                          <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                            {employee?.name || 'Deleted Staff'}
                          </td>
                          <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                            {lineCount} items
                          </td>
                          <td className="px-6 py-4 text-xs text-stone-400 dark:text-stone-500 font-mono">
                            {date.toLocaleString()}
                          </td>
                        </tr>
                        {isExpanded && (check.lines ?? []).map((line) => (
                          <tr key={line.id} className="bg-stone-50/30 dark:bg-stone-800/30">
                            <td className="px-6 py-3"></td>
                            <td className="px-6 py-3 text-sm text-stone-600 dark:text-stone-400" colSpan={2}>
                              <div className="flex items-center gap-2 pl-4">
                                <Package className="w-3.5 h-3.5 text-stone-400" />
                                {line.itemName}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-sm font-bold text-blue-600 dark:text-blue-400">
                              {line.quantity}
                            </td>
                            <td className="px-6 py-3"></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {filteredInventoryChecks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-stone-400 dark:text-stone-500 font-medium">
                        {inventorySearchTerm || inventoryLocationFilter || inventoryEmployeeFilter || inventoryStartDate || inventoryEndDate
                          ? 'No inventory checks match your filters.'
                          : 'No inventory checks recorded yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'history' ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">Global Transaction History</h3>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl text-xs font-bold hover:bg-stone-200 dark:hover:bg-stone-700 transition-all"
                title="Download as Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400" />
                Export Excel
              </button>
            </div>
            <div className="flex items-center gap-4 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500" />
                <input
                  type="text"
                  placeholder="Search by product, location, or staff..."
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 transition-all shadow-sm"
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                />
              </div>
              <div className="bg-stone-100 dark:bg-stone-800 px-4 py-3 rounded-2xl text-xs font-bold text-stone-600 dark:text-stone-400 whitespace-nowrap">
                {filteredTransactions.length} Records
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-stone-900 p-6 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Type</label>
              <select 
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
              >
                <option value="ALL">All Types</option>
                <option value="IN">Restock (IN)</option>
                <option value="OUT">Check Out (OUT)</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">From</label>
              <input 
                type="date" 
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">To</label>
              <input 
                type="date" 
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
              />
            </div>
            {(historyTypeFilter !== 'ALL' || historyStartDate || historyEndDate) && (
              <button 
                onClick={() => {
                  setHistoryTypeFilter('ALL');
                  setHistoryStartDate('');
                  setHistoryEndDate('');
                }}
                className="text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white uppercase tracking-widest ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Employee</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Quantity</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredTransactions.map((tx) => {
                    const item = items.find(i => i.id === tx.itemId);
                    const location = locations.find(l => l.id === tx.locationId);
                    const employee = employees.find(e => e.id === tx.employeeId);
                    const date = toEventDate(tx.timestamp);

                    return (
                      <tr key={tx.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            tx.type === 'IN' ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                          }`}>
                            {tx.type === 'IN' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden flex-shrink-0">
                              {item?.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-stone-300 dark:text-stone-600" /></div>
                              )}
                            </div>
                            <span className="font-medium text-stone-900 dark:text-white">{item?.name || 'Deleted Item'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{location?.name || 'Deleted Location'}</td>
                        <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{employee?.name || 'Deleted Staff'}</td>
                        <td className={`px-6 py-4 font-bold ${tx.type === 'IN' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                        </td>
                        <td className="px-6 py-4 text-xs text-stone-400 dark:text-stone-500 font-mono">
                          {date.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-stone-400 dark:text-stone-500 font-medium">
                        {historySearchTerm || historyTypeFilter !== 'ALL' || historyStartDate || historyEndDate ? 'No transactions match your filters.' : 'No transactions recorded yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-12" ref={reportRef} id="report-content">
          {/* Date Range Filter for Overview */}
          <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-stone-900 p-6 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Filter Overview Range:</label>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">From</label>
              <input 
                type="date" 
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={overviewStartDate}
                onChange={(e) => setOverviewStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">To</label>
              <input 
                type="date" 
                className="bg-stone-50 dark:bg-stone-800 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                value={overviewEndDate}
                onChange={(e) => setOverviewEndDate(e.target.value)}
              />
            </div>
            {(overviewStartDate || overviewEndDate) && (
              <button 
                onClick={() => {
                  setOverviewStartDate('');
                  setOverviewEndDate('');
                }}
                className="text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white uppercase tracking-widest ml-auto"
              >
                Reset Range
              </button>
            )}
          </div>

          {/* Analytics Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-stone-900 dark:text-white" />
              </div>
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Total Checkouts</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">
                {summaryData.totalCheckouts}
              </p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center mb-4">
                <DollarSign className="w-6 h-6 text-stone-900 dark:text-white" />
              </div>
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Total Value Out</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">
                ${summaryData.totalValueOut.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-stone-900 dark:text-white" />
              </div>
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Active SKUs</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">{summaryData.activeSKUs}</p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-stone-900 dark:text-white" />
              </div>
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Staff Members</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">{summaryData.totalStaff}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Performance by Location */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Performance by Location</h4>
                <BarChart3 className="w-5 h-5 text-stone-400 dark:text-stone-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summaryData.locationPerformance}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Legend />
                    <Bar dataKey="checkouts" name="Units Out" fill="#1c1917" className="dark:fill-stone-100" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="value" name="Value ($)" fill="#a8a29e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Activity Timeline</h4>
                <Clock className="w-5 h-5 text-stone-400 dark:text-stone-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={summaryData.dailyActivity}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                    />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                    />
                    <Area type="monotone" dataKey="checkins" name="Check In" stroke="#22c55e" fillOpacity={1} fill="url(#colorIn)" />
                    <Area type="monotone" dataKey="checkouts" name="Check Out" stroke="#ef4444" fillOpacity={1} fill="url(#colorOut)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Inventory Value by Type (Pie Chart) */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Value by Product Type</h4>
                <TrendingUp className="w-5 h-5 text-stone-400 dark:text-stone-500" />
              </div>
              <div className="h-[300px] w-full flex items-center justify-center">
                {summaryData.inventoryValueByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summaryData.inventoryValueByType}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                      >
                        {summaryData.inventoryValueByType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={theme === 'dark' ? DARK_COLORS[index % DARK_COLORS.length] : COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']}
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                          backgroundColor: theme === 'dark' ? '#1c1917' : '#fff',
                          color: theme === 'dark' ? '#fff' : '#000'
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center space-y-2">
                    <Package className="w-12 h-12 text-stone-200 dark:text-stone-800 mx-auto" />
                    <p className="text-stone-400 dark:text-stone-500 text-sm font-medium">No inventory value to display</p>
                    <p className="text-stone-300 dark:text-stone-600 text-xs">Add stock and prices to see valuation</p>
                  </div>
                )}
              </div>
            </div>

            {/* Top 5 Moving Products */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Top 5 Moving Products</h4>
                <TrendingUp className="w-5 h-5 text-stone-400 dark:text-stone-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summaryData.productMovement}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Bar dataKey="checkouts" name="Total Checkouts" fill="#1c1917" className="dark:fill-stone-100" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Value Delivered by Location */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Value Delivered by Location</h4>
                <ArrowDownRight className="w-5 h-5 text-green-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={summaryData.valueDeliveredByLocation}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                      width={120}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value Delivered']}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                    />
                    <Bar dataKey="value" name="Delivered Value ($)" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Value Removed by Location */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Value Removed by Location</h4>
                <ArrowUpRight className="w-5 h-5 text-red-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={summaryData.valueRemovedByLocation}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                      width={120}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value Removed']}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                    />
                    <Bar dataKey="value" name="Removed Value ($)" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Inventory Value by Location (Snapshot) */}
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-stone-900 dark:text-white">Current Inventory Value Snapshot</h4>
                <DollarSign className="w-5 h-5 text-stone-400 dark:text-stone-500" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={summaryData.inventoryValueByLocation}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f4" className="dark:stroke-stone-800" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#a8a29e', fontSize: 10, fontWeight: 700 }}
                      width={120}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        color: 'var(--tooltip-text, #000)'
                      }}
                    />
                    <Bar dataKey="value" name="Inventory Value ($)" fill="#1c1917" className="dark:fill-stone-100" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
