import React, { useState, useEffect } from 'react';
import { api, handleApiError, OperationType } from '../lib/api';
import { Item, Employee, Transaction, Location, Stock } from '../types/inventory';
import { Plus, Search, FileSpreadsheet, Package, Users, Trash2, Edit2, X, History, AlertTriangle, FileText, Clock, ArrowDownRight, ArrowUpRight, Sparkles, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from "@google/genai";

const HOUSEKEEPING_CATEGORIES = [
  "Cleaning Chemicals",
  "Paper Products",
  "Guest Amenities",
  "Linens & Towels",
  "Cleaning Tools",
  "Laundry Supplies",
  "Waste Management",
  "Safety & PPE"
];
import { ConfirmModal } from '../components/ConfirmModal';
import { startOfDay } from 'date-fns';
import { toEventDate } from '../lib/dates';

interface AdminDashboardProps {
  loggedInEmployee?: Employee;
}

export function AdminDashboard({ loggedInEmployee }: AdminDashboardProps) {
  const isSuperAdmin = loggedInEmployee?.role === 'admin';
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'employees'>('items');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [newEmployee, setNewEmployee] = useState({ 
    name: '', 
    pin: '', 
    email: '',
    notificationsEnabled: false,
    role: 'staff' as const,
    permissions: { canCheckIn: true, canCheckOut: true, canInventoryCheck: true }
  });
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: '', price: '', type: '', sku: '', imageUrl: '', lowStockThreshold: '', priceByBox: '' });
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isGeneratingCategories, setIsGeneratingCategories] = useState(false);
  const [categories, setCategories] = useState<string[]>(HOUSEKEEPING_CATEGORIES);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<Item | null>(null);
  const [itemTransactions, setItemTransactions] = useState<Transaction[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [i, e, l, s] = await Promise.all([
          api.getItems(),
          api.getEmployees(),
          api.getLocations(),
          api.getStock(),
        ]);
        if (!cancelled) {
          setItems(i);
          setEmployees(e);
          setLocations(l);
          setStocks(s);
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

  useEffect(() => {
    if (!selectedItemForHistory) {
      setItemTransactions([]);
      return;
    }

    let cancelled = false;
    setIsLoadingHistory(true);
    const loadTx = async () => {
      try {
        const txs = await api.getTransactions({
          itemId: selectedItemForHistory.id,
          limit: 2000,
        });
        if (!cancelled) {
          setItemTransactions(txs);
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    };
    loadTx();
    const t = setInterval(loadTx, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedItemForHistory]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.sku) return;

    try {
      const itemData = {
        name: newItem.name.trim(),
        sku: newItem.sku.trim(),
        type: newItem.type.trim(),
        price: Number(newItem.price) || 0,
        imageUrl: newItem.imageUrl || undefined,
        priceByBox: newItem.priceByBox ? Number(newItem.priceByBox) : undefined,
        lowStockThreshold: newItem.lowStockThreshold
          ? Number(newItem.lowStockThreshold)
          : undefined,
      };

      if (editingItemId) {
        await api.updateItem(editingItemId, itemData);
      } else {
        await api.createItem(itemData as { name: string; sku: string } & Partial<Item>);
      }

      setNewItem({ name: '', price: '', type: '', sku: '', imageUrl: '', lowStockThreshold: '', priceByBox: '' });
      setIsAddingItem(false);
      setEditingItemId(null);
    } catch (error) {
      console.error("Error saving item:", error);
      handleApiError(
        error,
        editingItemId ? OperationType.UPDATE : OperationType.CREATE,
        "items"
      );
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit size to 500KB for reasonable DB payload
    if (file.size > 500 * 1024) {
      alert("Image is too large. Please select an image smaller than 500KB.");
      return;
    }

    setIsImageLoading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewItem(prev => ({ ...prev, imageUrl: reader.result as string }));
      setIsImageLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const generateAICategories = async () => {
    setIsGeneratingCategories(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate a list of 12 distinct inventory categories for a hotel housekeeping department. Return only the category names as a JSON array of strings.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      
      const generated = JSON.parse(response.text);
      if (Array.isArray(generated)) {
        setCategories(generated);
      }
    } catch (error) {
      console.error("Error generating categories:", error);
    } finally {
      setIsGeneratingCategories(false);
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await api.deleteItem(itemToDelete);
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      await api.deleteEmployee(employeeToDelete);
      setEmployeeToDelete(null);
    } catch (error) {
      console.error("Error deleting employee:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!jsonData || jsonData.length === 0) {
          alert('The Excel file appears to be empty.');
          return;
        }

        const imported: Array<{ name: string; sku: string; type: string; price: number }> = [];
        let skippedCount = 0;
        const skippedReasons: string[] = [];
        for (const row of jsonData) {
          // Normalize keys to lowercase and remove all non-alphanumeric characters to handle different header naming
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedRow[normalizedKey] = row[key];
          });

          // Expanded aliases for Name
          const name = normalizedRow.name || 
                       normalizedRow.productname || 
                       normalizedRow.supplyname || 
                       normalizedRow.itemname ||
                       normalizedRow.item || 
                       normalizedRow.supply ||
                       normalizedRow.description || 
                       normalizedRow.productdescription ||
                       normalizedRow.itemdescription ||
                       normalizedRow.title || 
                       normalizedRow.label ||
                       normalizedRow.product;

          // Expanded aliases for SKU
          const sku = normalizedRow.sku || 
                      normalizedRow.skunumber ||
                      normalizedRow.barcode || 
                      normalizedRow.id || 
                      normalizedRow.code || 
                      normalizedRow.itemcode ||
                      normalizedRow.productcode ||
                      normalizedRow.partnumber || 
                      normalizedRow.model || 
                      normalizedRow.reference || 
                      normalizedRow.ref ||
                      normalizedRow.upc ||
                      normalizedRow.ean;

          // Expanded aliases for Price
          const price = normalizedRow.price || 
                        normalizedRow.unitprice || 
                        normalizedRow.cost || 
                        normalizedRow.rate ||
                        normalizedRow.value;

          // Expanded aliases for Type/Category
          const type = normalizedRow.type || 
                       normalizedRow.category || 
                       normalizedRow.group || 
                       normalizedRow.class ||
                       normalizedRow.department ||
                       normalizedRow.supply ||
                       'General';

          if (name && sku) {
            imported.push({
              name: String(name).trim(),
              price: Number(price) || 0,
              type: String(type).trim(),
              sku: String(sku).trim(),
            });
          } else {
            skippedCount++;
            if (!name && !sku) skippedReasons.push("Missing both Name and SKU");
            else if (!name) skippedReasons.push(`Missing Name (SKU: ${sku})`);
            else if (!sku) skippedReasons.push(`Missing SKU (Name: ${name})`);
          }
        }

        const { created: createdCount } = await api.importItems(imported);
        if (createdCount > 0) {
          let message = `Successfully imported ${createdCount} items.`;
          if (skippedCount > 0) {
            message += `\n\nSkipped ${skippedCount} rows. Top reasons:\n- ${Array.from(new Set(skippedReasons)).slice(0, 3).join('\n- ')}`;
          }
          alert(message);
        } else {
          const detectedHeaders = jsonData.length > 0 ? Object.keys(jsonData[0]).join(', ') : 'None';
          alert(`No valid items found. \n\nDetected headers in your file: ${detectedHeaders}\n\nPlease ensure your Excel has columns for "Name" and "SKU" (or similar headers like "Product" and "Barcode").`);
        }
      } catch (error) {
        console.error("Upload error:", error);
        alert('Error processing file. Please ensure it is a valid Excel document (.xlsx or .xls).');
      } finally {
        setIsUploading(false);
        // Reset the input so the same file can be uploaded again if needed
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.pin) return;
    
    // Security check: Only Superadmin can create/edit Admins
    if (!isSuperAdmin && newEmployee.role === 'admin') {
      alert("Only Super Administrators can create or manage other Administrators.");
      return;
    }

    try {
      if (editingEmployeeId) {
        await api.updateEmployee(editingEmployeeId, newEmployee);
      } else {
        await api.createEmployee(newEmployee);
      }
      
      setNewEmployee({ 
        name: '', 
        pin: '', 
        email: '',
        notificationsEnabled: false,
        role: 'staff',
        permissions: { canCheckIn: true, canCheckOut: true, canInventoryCheck: true }
      });
      setEditingEmployeeId(null);
    } catch (err) {
      console.error("Error saving employee:", err);
      handleApiError(err, editingEmployeeId ? OperationType.UPDATE : OperationType.CREATE, 'employees');
    }
  };

  const getTotalStock = (itemId: string) => {
    return stocks
      .filter(s => s.itemId === itemId)
      .reduce((acc, curr) => acc + curr.quantity, 0);
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredItemTransactions = itemTransactions.filter(tx => {
    const date = toEventDate(tx.timestamp);
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
    return matchesType && matchesDate;
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold text-stone-900 dark:text-white tracking-tight">
            {isSuperAdmin ? 'Super Control' : 'Management Console'}
          </h2>
          <p className="text-stone-500 dark:text-stone-400 mt-2">
            {isSuperAdmin ? 'Full system access and administrator management.' : 'Manage your global product catalog and authorized staff members.'}
          </p>
        </div>
        
        <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl self-start">
          <button 
            onClick={() => setActiveTab('items')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'items' ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-500 dark:text-stone-400"
            }`}
          >
            Products
          </button>
          <button 
            onClick={() => setActiveTab('employees')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'employees' ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-500 dark:text-stone-400"
            }`}
          >
            Employees
          </button>
        </div>
      </header>

      {activeTab === 'items' ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-stone-900 dark:text-white">Product Catalog</h3>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer flex items-center gap-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-6 py-3 rounded-2xl text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shadow-sm">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                {isUploading ? 'Uploading...' : 'Bulk Import Excel'}
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isUploading} />
              </label>
              <button 
                onClick={() => setIsAddingItem(true)}
                className="flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-3 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
          </div>

          {/* Modal for adding new item */}
          {isAddingItem && (
            <div className="fixed inset-0 bg-stone-900/40 dark:bg-stone-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <div className="bg-white dark:bg-stone-900 rounded-[40px] p-10 max-w-xl w-full shadow-2xl shadow-stone-900/20 dark:shadow-stone-950/40 border border-stone-100 dark:border-stone-800">
                <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">
                  {editingItemId ? 'Edit Product' : 'New Product'}
                </h3>
                <p className="text-stone-500 dark:text-stone-400 mb-8">
                  {editingItemId ? 'Update product details and stock threshold.' : 'Add a single item to your inventory catalog.'}
                </p>
                
                <form onSubmit={handleAddItem} className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Product Image</label>
                    <div className="flex items-center gap-6">
                      {newItem.imageUrl ? (
                        <div className="relative group">
                          <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-stone-100 dark:border-stone-800 shadow-sm">
                            <img src={newItem.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                          <button 
                            type="button"
                            onClick={() => setNewItem(prev => ({ ...prev, imageUrl: '' }))}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-all transform hover:scale-110"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-700 flex flex-col items-center justify-center cursor-pointer hover:border-stone-400 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all group">
                          <Plus className="w-6 h-6 text-stone-400 group-hover:text-stone-600 transition-colors" />
                          <span className="text-[10px] font-bold text-stone-400 group-hover:text-stone-600 mt-1 uppercase tracking-widest">Upload</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </label>
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-bold text-stone-900 dark:text-white">Product Photo</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">JPG, PNG or WebP. Max 500KB.</p>
                        {isImageLoading && (
                          <div className="flex items-center gap-2 text-xs text-stone-900 dark:text-white font-bold">
                            <div className="w-3 h-3 border-2 border-stone-900 dark:border-white border-t-transparent rounded-full animate-spin"></div>
                            Processing...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Product Name</label>
                    <input
                      autoFocus
                      type="text"
                      required
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">SKU Number</label>
                    <input
                      type="text"
                      required
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                      value={newItem.sku}
                      onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Category / Type</label>
                    <div className="relative">
                      <select
                        className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 appearance-none"
                        value={newItem.type}
                        onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                      <button
                        type="button"
                        onClick={generateAICategories}
                        disabled={isGeneratingCategories}
                        className="absolute right-12 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                        title="Regenerate categories with AI"
                      >
                        <Sparkles className={`w-4 h-4 ${isGeneratingCategories ? 'animate-pulse text-stone-900 dark:text-white' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Unit Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Price by Box ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                      value={newItem.priceByBox}
                      onChange={(e) => setNewItem({ ...newItem, priceByBox: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Low Stock Alert Threshold</label>
                    <input
                      type="number"
                      placeholder={`Default: ${lowStockThreshold}`}
                      className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                      value={newItem.lowStockThreshold}
                      onChange={(e) => setNewItem({ ...newItem, lowStockThreshold: e.target.value })}
                    />
                  </div>
                  
                  <div className="col-span-2 flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingItem(false);
                        setEditingItemId(null);
                        setNewItem({ name: '', price: '', type: '', sku: '', imageUrl: '', lowStockThreshold: '', priceByBox: '' });
                      }}
                      className="flex-1 px-6 py-4 rounded-2xl text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-4 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                    >
                      {editingItemId ? 'Update Product' : 'Save Product'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-stone-900 p-6 rounded-[24px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Total Items</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">{items.length}</p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-6 rounded-[24px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Categories</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">{new Set(items.map(i => i.type)).size}</p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-6 rounded-[24px] border border-stone-100 dark:border-stone-800 shadow-sm">
              <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Last Update</p>
              <p className="text-3xl font-light text-stone-900 dark:text-white">Today</p>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search by name, SKU, or category..."
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 px-4 py-2 rounded-2xl border border-stone-100 dark:border-stone-800">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Low Stock Alert at:</label>
                <input
                  type="number"
                  className="w-12 bg-transparent border-none p-0 text-sm font-bold text-stone-900 dark:text-white focus:ring-0"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">SKU</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Price</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Stock</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-stone-100 dark:bg-stone-800 rounded-xl flex items-center justify-center overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Package className="w-5 h-5 text-stone-400 dark:text-stone-500" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-stone-900 dark:text-white">{item.name}</span>
                            {getTotalStock(item.id) < (item.lowStockThreshold || lowStockThreshold) && (
                              <span className={`text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded w-fit mt-1 ${
                                getTotalStock(item.id) <= 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                              }`}>
                                {getTotalStock(item.id) <= 0 ? 'Out of Stock' : 'Low Stock'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-stone-500 dark:text-stone-400">{item.sku}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-stone-900 dark:text-white">${item.price.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${getTotalStock(item.id) <= 0 ? 'text-red-500' : getTotalStock(item.id) < (item.lowStockThreshold || lowStockThreshold) ? 'text-amber-500' : 'text-stone-900 dark:text-white'}`}>
                              {getTotalStock(item.id)}
                            </span>
                            {getTotalStock(item.id) < (item.lowStockThreshold || lowStockThreshold) && getTotalStock(item.id) > 0 && (
                              <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" title="Low Stock" />
                            )}
                            {getTotalStock(item.id) <= 0 && (
                              <AlertTriangle className="w-4 h-4 text-red-500" title="Out of Stock" />
                            )}
                            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-widest">Units</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {stocks.filter(s => s.itemId === item.id && s.quantity > 0).map((s, idx) => (
                              <div key={idx} className="text-[8px] px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded border border-stone-200 dark:border-stone-700" title={s.expiryDate ? `Expires: ${s.expiryDate}` : 'No expiry date'}>
                                {s.batchNumber || 'No Batch'}: {s.quantity}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setSelectedItemForHistory(item)}
                            className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors"
                            title="View Transaction History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingItemId(item.id);
                              setNewItem({
                                name: item.name,
                                price: String(item.price),
                                type: item.type,
                                sku: item.sku,
                                imageUrl: item.imageUrl || '',
                                lowStockThreshold: item.lowStockThreshold ? String(item.lowStockThreshold) : '',
                                priceByBox: item.priceByBox ? String(item.priceByBox) : ''
                              });
                              setIsAddingItem(true);
                            }}
                            className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setItemToDelete(item.id)}
                            className="p-2 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'employees' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-stone-900 p-8 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                  {editingEmployeeId ? 'Edit Profile' : 'Add Employee'}
                </h3>
                {editingEmployeeId && (
                  <button 
                    onClick={() => {
                      setEditingEmployeeId(null);
                      setNewEmployee({ 
                        name: '', 
                        pin: '', 
                        email: '',
                        notificationsEnabled: false,
                        role: 'staff',
                        permissions: { canCheckIn: true, canCheckOut: true, canInventoryCheck: true }
                      });
                    }}
                    className="text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <form onSubmit={handleSaveEmployee} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Full Name</label>
                  <input
                    type="text"
                    required
                    className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">4-Digit PIN</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    title="Please enter a 4-digit number"
                    className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                    value={newEmployee.pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setNewEmployee({ ...newEmployee, pin: val });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Email Address</label>
                  <input
                    type="email"
                    className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    placeholder="For notifications..."
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Role & Notifications</label>
                  <div className="flex flex-col gap-4">
                    {isSuperAdmin && (
                      <select
                        className="w-full p-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                        value={newEmployee.role}
                        onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value as 'admin' | 'staff' })}
                      >
                        <option value="staff">Staff Member</option>
                        <option value="admin">Administrator</option>
                      </select>
                    )}
                    
                    <label className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-stone-900 dark:focus:ring-stone-100"
                        checked={newEmployee.notificationsEnabled}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          notificationsEnabled: e.target.checked
                        })}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-stone-700 dark:text-stone-300">Enable Email Alerts</span>
                        <span className="text-[10px] text-stone-500 dark:text-stone-400">Receive low stock & critical warnings</span>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Permissions</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-stone-900 dark:focus:ring-stone-100"
                        checked={newEmployee.permissions.canCheckIn}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          permissions: { ...newEmployee.permissions, canCheckIn: e.target.checked }
                        })}
                      />
                      <span className="text-sm font-bold text-stone-700 dark:text-stone-300">Check In</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-stone-900 dark:focus:ring-stone-100"
                        checked={newEmployee.permissions.canCheckOut}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          permissions: { ...newEmployee.permissions, canCheckOut: e.target.checked }
                        })}
                      />
                      <span className="text-sm font-bold text-stone-700 dark:text-stone-300">Check Out</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:ring-stone-900 dark:focus:ring-stone-100"
                        checked={newEmployee.permissions.canInventoryCheck !== false}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          permissions: { ...newEmployee.permissions, canInventoryCheck: e.target.checked }
                        })}
                      />
                      <span className="text-sm font-bold text-stone-700 dark:text-stone-300">Inventory Check</span>
                    </label>
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-4 rounded-2xl font-bold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                >
                  {editingEmployeeId ? 'Update Profile' : 'Register Employee'}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-stone-900 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-stone-100 dark:border-stone-800">
                <h3 className="text-xl font-bold text-stone-900 dark:text-white">Authorized Staff</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-8">
                {employees
                  .filter(emp => isSuperAdmin || emp.role === 'staff')
                  .map((emp) => (
                  <div key={emp.id} className="p-6 bg-stone-50 dark:bg-stone-800 rounded-[32px] border border-stone-100 dark:border-stone-700 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center shadow-sm">
                        {emp.role === 'admin' ? (
                          <ShieldCheck className="w-6 h-6 text-amber-500" />
                        ) : (
                          <Users className="w-6 h-6 text-stone-900 dark:text-white" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900 dark:text-white">{emp.name}</p>
                          {emp.role === 'admin' && (
                            <span className="text-[8px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Admin</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-widest font-bold">PIN: {emp.pin}</p>
                          <span className="text-stone-300 dark:text-stone-600">•</span>
                          <div className="flex gap-1">
                            {emp.permissions?.canCheckIn && (
                              <span className="text-[8px] bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">In</span>
                            )}
                            {emp.permissions?.canCheckOut && (
                              <span className="text-[8px] bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Out</span>
                            )}
                            {emp.permissions?.canInventoryCheck !== false && (
                              <span className="text-[8px] bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Count</span>
                            )}
                            {emp.notificationsEnabled && (
                              <span className="text-[8px] bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Alerts</span>
                            )}
                          </div>
                        </div>
                        {emp.email && (
                          <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">{emp.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingEmployeeId(emp.id);
                          setNewEmployee({
                            name: emp.name,
                            pin: emp.pin,
                            email: emp.email || '',
                            notificationsEnabled: emp.notificationsEnabled || false,
                            role: emp.role,
                            permissions: emp.permissions || { canCheckIn: true, canCheckOut: true, canInventoryCheck: true }
                          });
                        }}
                        className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEmployeeToDelete(emp.id)}
                        className="p-2 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDeleteItem}
        title="Delete Product"
        message="Are you sure you want to delete this product? This will also affect stock records."
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={confirmDeleteEmployee}
        title="Remove Employee"
        message="Are you sure you want to remove this employee? They will no longer be able to check items in or out."
        confirmText="Remove"
        variant="danger"
      />

      {/* Transaction History Modal */}
      {selectedItemForHistory && (
        <div className="fixed inset-0 bg-stone-900/40 dark:bg-stone-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-stone-900 rounded-[40px] p-10 max-w-3xl w-full shadow-2xl shadow-stone-900/20 dark:shadow-stone-950/40 border border-stone-100 dark:border-stone-800 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-stone-900 dark:bg-stone-100 rounded-2xl flex items-center justify-center">
                  <History className="w-6 h-6 text-white dark:text-stone-900" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-stone-900 dark:text-white">{selectedItemForHistory.name}</h3>
                  <p className="text-stone-500 dark:text-stone-400 text-sm">Transaction History • SKU: {selectedItemForHistory.sku}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedItemForHistory(null)}
                className="p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 bg-stone-50 dark:bg-stone-800 p-6 rounded-[32px] border border-stone-100 dark:border-stone-700 mb-8">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Type</label>
                <select 
                  className="bg-white dark:bg-stone-900 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
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
                  className="bg-white dark:bg-stone-900 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">To</label>
                <input 
                  type="date" 
                  className="bg-white dark:bg-stone-900 border-none rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 px-4 py-2 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
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

            <div className="flex-1 overflow-y-auto pr-2">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-8 h-8 border-4 border-stone-900 dark:border-white border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-stone-500 dark:text-stone-400 font-medium">Loading history...</p>
                </div>
              ) : filteredItemTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-stone-50 dark:bg-stone-800 rounded-full flex items-center justify-center">
                    <Clock className="w-8 h-8 text-stone-300 dark:text-stone-600" />
                  </div>
                  <p className="text-stone-500 dark:text-stone-400">No transactions match your filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredItemTransactions.map((tx) => {
                    const location = locations.find(l => l.id === tx.locationId);
                    const employee = employees.find(e => e.id === tx.employeeId);
                    const date = toEventDate(tx.timestamp);
                    
                    return (
                      <div key={tx.id} className="flex items-center justify-between p-6 bg-stone-50 dark:bg-stone-800 rounded-[24px] border border-stone-100 dark:border-stone-700 group hover:bg-white dark:hover:bg-stone-700 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                            tx.type === 'IN' ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                          }`}>
                            {tx.type === 'IN' ? <ArrowDownRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${tx.type === 'IN' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                {tx.type === 'IN' ? '+' : '-'}{tx.quantity} units
                              </span>
                              <span className="text-stone-300 dark:text-stone-600">•</span>
                              <span className="font-bold text-stone-900 dark:text-white">{location?.name || 'Unknown Location'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mt-1">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {employee?.name || 'Unknown Staff'}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {date.toLocaleString()}
                              </span>
                            </div>
                            {(tx.batchNumber || tx.expiryDate) && (
                              <div className="flex items-center gap-2 text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                                {tx.batchNumber && <span>Batch: {tx.batchNumber}</span>}
                                {tx.batchNumber && tx.expiryDate && <span>•</span>}
                                {tx.expiryDate && <span>Expires: {tx.expiryDate}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                            tx.type === 'IN' ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                          }`}>
                            {tx.type === 'IN' ? 'Restock' : 'Check Out'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
