import React, { useState, useEffect, useRef } from 'react';
import { Location, Item, Employee, Stock } from '../types/inventory';
import { QrCode, Scan, CheckCircle2, ArrowRightLeft, Package, MapPin, User, AlertCircle, Trash2, ClipboardList } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { api } from '../lib/api';

interface CheckoutPageProps {
  loggedInEmployee?: Employee | null;
}

interface CartItem {
  itemId: string;
  name: string;
  sku: string;
  quantity: number;
  imageUrl?: string;
  batchNumber?: string;
  expiryDate?: string;
}

type ActionMode = 'IN' | 'OUT' | 'INVENTORY_CHECK';

export function CheckoutPage({ loggedInEmployee }: CheckoutPageProps) {
  const [step, setStep] = useState<'scan' | 'pin' | 'action' | 'success'>('scan');
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [manualLocationId, setManualLocationId] = useState('');
  const [scannedLocation, setScannedLocation] = useState<Location | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(loggedInEmployee || null);
  const [pin, setPin] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [quantityError, setQuantityError] = useState('');
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const quantityControlsRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [actionMode, setActionMode] = useState<ActionMode>('OUT');
  const [inventoryQuantities, setInventoryQuantities] = useState<Record<string, string>>({});
  const [systemQuantities, setSystemQuantities] = useState<Record<string, number>>({});
  const [isLoadingInventoryStock, setIsLoadingInventoryStock] = useState(false);
  const [lastActionMode, setLastActionMode] = useState<ActionMode>('OUT');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationStockSummary, setLocationStockSummary] = useState<
    Record<string, { items: number; units: number }>
  >({});
  const [adminLocationSearch, setAdminLocationSearch] = useState('');

  const isAdmin = employee?.role === 'admin';

  const setInitialActionMode = (emp: Employee) => {
    if (emp.permissions?.canCheckOut !== false) setActionMode('OUT');
    else if (emp.permissions?.canCheckIn !== false) setActionMode('IN');
    else if (emp.permissions?.canInventoryCheck !== false) setActionMode('INVENTORY_CHECK');
  };

  useEffect(() => {
    if (loggedInEmployee) {
      setEmployee(loggedInEmployee);
      if (loggedInEmployee.permissions) {
        setInitialActionMode(loggedInEmployee);
      }
    }
  }, [loggedInEmployee]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const list = await api.getItems();
        setItems(list);
      } catch (err) {
        console.error("Error fetching items:", err);
      }
    };
    fetchItems();
  }, []);

  useEffect(() => {
    if (!isAdmin || step !== 'scan') return;

    let cancelled = false;
    const loadAdminLocations = async () => {
      try {
        const [locs, levels] = await Promise.all([
          api.getLocations(),
          api.getInventoryLevels(),
        ]);
        if (cancelled) return;

        setLocations(locs);
        const summary: Record<string, { items: number; units: number }> = {};
        for (const row of levels) {
          if (!summary[row.locationId]) {
            summary[row.locationId] = { items: 0, units: 0 };
          }
          if (row.quantity > 0) {
            summary[row.locationId].items += 1;
          }
          summary[row.locationId].units += row.quantity;
        }
        setLocationStockSummary(summary);
      } catch (err) {
        if (!cancelled) console.error("Error loading locations for admin:", err);
      }
    };

    loadAdminLocations();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, step]);

  const selectLocation = (loc: Location) => {
    setScannedLocation(loc);
    setError('');
    if (employee) {
      setStep('action');
    } else {
      setStep('pin');
    }
  };

  useEffect(() => {
    if (selectedItem && scannedLocation) {
      api
        .getStock({ itemId: selectedItem, locationId: scannedLocation.id })
        .then((rows) => {
        const sortedStocks = rows
          .filter(s => s.quantity > 0)
          .sort((a, b) => {
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            return a.expiryDate.localeCompare(b.expiryDate);
          });
        setAvailableStocks(sortedStocks);
      }).catch(err => {
        console.error("Error fetching available stocks:", err);
      });
    } else {
      setAvailableStocks([]);
    }
  }, [selectedItem, scannedLocation]);

  useEffect(() => {
    if (actionMode !== 'INVENTORY_CHECK' || !scannedLocation || step !== 'action') {
      return;
    }

    let cancelled = false;
    setIsLoadingInventoryStock(true);

    const loadLocationStock = async () => {
      try {
        const levels = await api.getInventoryLevels({
          locationIds: [scannedLocation.id],
        });
        if (cancelled) return;

        const byItem: Record<string, number> = {};
        for (const row of levels) {
          byItem[row.itemId] = row.quantity;
        }

        setSystemQuantities(byItem);

        const quantities: Record<string, string> = {};
        for (const item of items) {
          quantities[item.id] = String(byItem[item.id] ?? 0);
        }
        setInventoryQuantities(quantities);
      } catch (err) {
        console.error("Error loading location stock for inventory check:", err);
        if (!cancelled) {
          setSystemQuantities({});
          setInventoryQuantities({});
        }
      } finally {
        if (!cancelled) setIsLoadingInventoryStock(false);
      }
    };

    if (items.length > 0) {
      loadLocationStock();
      const t = setInterval(loadLocationStock, 4000);
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    } else {
      setSystemQuantities({});
      setInventoryQuantities({});
      setIsLoadingInventoryStock(false);
    }

    return () => {
      cancelled = true;
    };
  }, [actionMode, scannedLocation?.id, step, items]);

  useEffect(() => {
    if (step !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin(p => p.length < 4 ? p + e.key : p);
      } else if (e.key === 'Backspace') {
        setPin(p => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (pin.length === 4) {
          const form = document.getElementById('pin-form') as HTMLFormElement;
          form?.requestSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, pin.length]);

  const handleScan = async (result: any) => {
    if (result && result[0] && result[0].rawValue) {
      const locId = result[0].rawValue;
      try {
        const loc = await api.getLocation(locId);
          setScannedLocation(loc);
          if (employee) {
            setStep('action');
          } else {
            setStep('pin');
          }
      } catch (err) {
        console.error("Error scanning QR code:", err);
        setError('Invalid Location QR Code');
      }
    }
  };
  
  const handleManualLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLocationId.trim()) return;
    
    setError('');
    try {
      const loc = await api.getLocationByNumber(manualLocationId.trim());
        setScannedLocation(loc);
        setIsManualLocation(false);
        if (employee) {
          setStep('action');
        } else {
          setStep('pin');
        }
    } catch (err) {
      console.error("Error finding location:", err);
      const message =
        err instanceof Error && err.message.includes("Multiple locations")
          ? "Multiple locations share that name. Use the location number (e.g. #4121)."
          : 'Location not found. Use the location number from the Locations page, or scan the QR code.';
      setError(message);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const emp = await api.getEmployeeByPin(pin);
      if (emp) {
        setEmployee(emp);
        if (emp.permissions) {
          setInitialActionMode(emp);
        }
        setStep('action');
      } else {
        setError('Invalid PIN code');
        setPin('');
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError('Authentication error');
    }
  };

  type CartLineInput = {
    itemId: string;
    quantity: number;
    batchNumber?: string;
    expiryDate?: string;
  };

  const buildCartLineEntries = (itemId: string, qty: number): CartLineInput[] => {
    if (actionMode === 'OUT' && !batchNumber) {
      let remainingQty = qty;
      const entries: CartLineInput[] = [];

      for (const stock of availableStocks) {
        if (remainingQty <= 0) break;
        const take = Math.min(remainingQty, stock.quantity);
        entries.push({
          itemId,
          quantity: take,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
        });
        remainingQty -= take;
      }

      if (remainingQty > 0) {
        entries.push({
          itemId,
          quantity: remainingQty,
          batchNumber: '',
          expiryDate: '',
        });
      }

      return entries;
    }

    return [{ itemId, quantity: qty, batchNumber, expiryDate }];
  };

  const applyLinesToCart = (prevCart: CartItem[], entries: CartLineInput[]): CartItem[] => {
    const updatedCart = [...prevCart];

    for (const { itemId, quantity: qty, batchNumber: bn, expiryDate: ed } of entries) {
      const item = items.find((i) => i.id === itemId);
      if (!item) continue;

      const existingIndex = updatedCart.findIndex(
        (c) => c.itemId === itemId && c.batchNumber === bn && c.expiryDate === ed
      );

      if (existingIndex >= 0) {
        updatedCart[existingIndex] = {
          ...updatedCart[existingIndex],
          quantity: updatedCart[existingIndex].quantity + qty,
        };
      } else {
        updatedCart.push({
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          quantity: qty,
          imageUrl: item.imageUrl,
          batchNumber: bn,
          expiryDate: ed,
        });
      }
    }

    return updatedCart;
  };

  const resetItemForm = () => {
    setSelectedItem('');
    setQuantity(1);
    setQuantityInput('1');
    setQuantityError('');
    setBatchNumber('');
    setExpiryDate('');
  };

  const addToCart = (entries: CartLineInput[]) => {
    if (entries.length === 0) return;

    setCart((prevCart) => applyLinesToCart(prevCart, entries));
    resetItemForm();
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const parseQuantityRaw = (
    raw: string
  ): { ok: true; value: number } | { ok: false; message: string } => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return { ok: false, message: 'Enter a quantity' };
    }
    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed < 1) {
      return { ok: false, message: 'Quantity must be at least 1' };
    }
    return { ok: true, value: parsed };
  };

  const getQuantityRaw = () => quantityInputRef.current?.value ?? quantityInput;

  const validateQuantity = (options?: { syncState?: boolean }): number | null => {
    const result = parseQuantityRaw(getQuantityRaw());
    if (result.ok === false) {
      setQuantityError(result.message);
      return null;
    }
    setQuantityError('');
    if (options?.syncState !== false) {
      setQuantity(result.value);
      setQuantityInput(String(result.value));
    }
    return result.value;
  };

  const handleQuantityBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active && quantityControlsRef.current?.contains(active)) {
        return;
      }
      validateQuantity();
    }, 0);
  };

  const setQuantityValue = (value: number) => {
    const clamped = Math.max(1, value);
    setQuantity(clamped);
    setQuantityInput(String(clamped));
    setQuantityError('');
  };

  const handleAddToCart = () => {
    if (!selectedItem) {
      setError('Choose an item before adding to the list');
      return;
    }

    const qty = validateQuantity();
    if (qty === null) return;

    addToCart(buildCartLineEntries(selectedItem, qty));
  };

  const buildCheckoutCart = (): CartItem[] | null => {
    let checkoutCart = [...cart];

    if (selectedItem) {
      const qty = validateQuantity();
      if (qty === null) return null;
      checkoutCart = applyLinesToCart(checkoutCart, buildCartLineEntries(selectedItem, qty));
    }

    return checkoutCart.length > 0 ? checkoutCart : null;
  };

  const pendingQuantityValid =
    selectedItem !== '' && parseQuantityRaw(getQuantityRaw()).ok;
  const canCheckout = cart.length > 0 || pendingQuantityValid;

  const handleTransaction = async () => {
    if (!scannedLocation || !employee) return;

    const checkoutCart = buildCheckoutCart();
    if (!checkoutCart) return;

    setIsProcessing(true);
    setError('');
    try {
      await api.checkout({
        locationId: scannedLocation.id,
        employeeId: employee.id,
        type: actionMode as 'IN' | 'OUT',
        lines: checkoutCart.map((c) => ({
          itemId: c.itemId,
          quantity: c.quantity,
          batchNumber: c.batchNumber,
          expiryDate: c.expiryDate,
        })),
      });
      setCart([]);
      resetItemForm();
      setLastActionMode(actionMode);
      setStep('success');
    } catch (err) {
      console.error("Transaction failed:", err);
      setError('Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInventoryCheck = async () => {
    if (!scannedLocation || !employee) return;

    setIsProcessing(true);
    setError('');
    try {
      const lines = items.map((item) => ({
        itemId: item.id,
        quantity: parseInt(inventoryQuantities[item.id] || '0', 10) || 0,
      }));

      await api.submitInventoryCheck({
        locationId: scannedLocation.id,
        employeeId: employee.id,
        lines,
      });
      setInventoryQuantities({});
      setLastActionMode('INVENTORY_CHECK');
      setStep('success');
    } catch (err) {
      console.error("Inventory check failed:", err);
      setError('Inventory check failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const canOut = employee?.permissions?.canCheckOut !== false;
  const canIn = employee?.permissions?.canCheckIn !== false;
  const canInventory = employee?.permissions?.canInventoryCheck !== false;
  const hasAnyAction = canOut || canIn || canInventory;
  const canInventorySubmit = items.length > 0;

  const filteredAdminLocations = locations.filter((loc) => {
    const q = adminLocationSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      loc.name.toLowerCase().includes(q) ||
      loc.locationNumber.toLowerCase().includes(q) ||
      loc.id.toLowerCase().includes(q)
    );
  });

  const reset = () => {
    setStep('scan');
    setIsManualLocation(false);
    setManualLocationId('');
    setScannedLocation(null);
    setEmployee(loggedInEmployee ?? null);
    setPin('');
    setSelectedItem('');
    setQuantity(1);
    setQuantityInput('1');
    setQuantityError('');
    setCart([]);
    setInventoryQuantities({});
    setSystemQuantities({});
    setError('');
  };

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0 space-y-4 sm:space-y-8 overflow-x-hidden">
      <header className="text-center px-1">
        <h2 className="text-2xl sm:text-4xl font-bold text-stone-900 dark:text-white tracking-tight">Stock Movement</h2>
        <p className="text-sm sm:text-base text-stone-500 dark:text-stone-400 mt-2">Scan location QR and enter PIN to check items in/out.</p>
      </header>

      <div className="bg-white dark:bg-stone-900 rounded-3xl sm:rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-xl shadow-stone-200/50 dark:shadow-none overflow-hidden min-h-0 sm:min-h-[500px] flex flex-col w-full">
        {/* Progress Header */}
        <div className="flex border-b border-stone-100 dark:border-stone-800">
          {[
            { id: 'scan', icon: Scan, label: 'Scan' },
            { id: 'pin', icon: User, label: 'Auth' },
            { id: 'action', icon: ArrowRightLeft, label: 'Move' },
            { id: 'success', icon: CheckCircle2, label: 'Done' }
          ].map((s, idx) => (
            <div 
              key={s.id}
              className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${
                step === s.id ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900" : "text-stone-300 dark:text-stone-600"
              }`}
            >
              <s.icon className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 p-4 sm:p-6 md:p-10 flex flex-col items-center justify-center relative w-full min-w-0">
          {error && (
            <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-6 md:left-10 md:right-10 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-sm flex items-center gap-2 border border-red-100 dark:border-red-900/50 z-10">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {step === 'scan' && (
            <div className="w-full space-y-8 text-center">
              {isAdmin && !isManualLocation && (
                <div className="text-left space-y-3 max-w-lg mx-auto w-full">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-stone-400" />
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                      Select location (admin)
                    </p>
                  </div>
                  <input
                    type="text"
                    placeholder="Search by name or location number..."
                    value={adminLocationSearch}
                    onChange={(e) => setAdminLocationSearch(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredAdminLocations.map((loc) => {
                      const summary = locationStockSummary[loc.id];
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => selectLocation(loc)}
                          className="w-full flex items-center justify-between gap-3 p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-stone-900 dark:text-white truncate">
                              {loc.name || 'Unnamed location'}
                            </p>
                            <p className="text-[10px] text-stone-500 dark:text-stone-400">
                              #{loc.locationNumber || '—'}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 px-2 py-1 rounded-lg ${
                            summary && summary.units > 0
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                              : 'bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400'
                          }`}>
                            {summary && summary.units > 0
                              ? `${summary.units} units`
                              : 'No stock'}
                          </span>
                        </button>
                      );
                    })}
                    {filteredAdminLocations.length === 0 && (
                      <p className="text-sm text-stone-400 text-center py-4">No locations match your search.</p>
                    )}
                  </div>
                  <p className="text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest">or scan QR below</p>
                </div>
              )}

              {!isManualLocation ? (
                <>
                  <div className="relative w-full aspect-square max-w-[300px] mx-auto rounded-[32px] overflow-hidden border-4 border-stone-900 dark:border-stone-100">
                    <Scanner
                      onScan={handleScan}
                      onError={() => setError('Camera error')}
                      styles={{ container: { width: '100%', height: '100%' } }}
                    />
                    <div className="absolute inset-0 border-[40px] border-black/20 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white/50 rounded-2xl pointer-events-none"></div>
                  </div>
                  <p className="text-stone-500 dark:text-stone-400 font-medium">Point your camera at a Location QR Code</p>
                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={() => setIsManualLocation(true)}
                      className="text-sm font-bold text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 px-6 py-3 rounded-2xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-all mx-auto"
                    >
                      Enter Location ID Manually
                    </button>
                    <button 
                      onClick={() => handleScan([{ rawValue: 'test-location-id' }])} // For testing if no camera
                      className="text-xs text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400"
                    >
                      (Demo: Click to skip scan)
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleManualLocationSubmit} className="space-y-8 max-w-xs mx-auto">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-stone-900 dark:text-white">Manual Entry</h3>
                    <p className="text-stone-500 dark:text-stone-400 text-sm">
                      Enter the <strong>location number</strong> (e.g. 4121) from the Locations page, or paste the location ID from a QR code.
                    </p>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Location ID #"
                    className="w-full px-4 sm:px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-center text-xl sm:text-2xl font-bold tracking-widest focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-600 transition-all"
                    value={manualLocationId}
                    onChange={(e) => setManualLocationId(e.target.value)}
                  />
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setIsManualLocation(false)}
                      className="flex-1 px-6 py-4 rounded-2xl text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-4 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                    >
                      Continue
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {step === 'pin' && (
            <form id="pin-form" onSubmit={handlePinSubmit} className="w-full max-w-xs space-y-6 sm:space-y-8 text-center px-1">
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-stone-900 dark:text-white">{scannedLocation?.name}</h3>
                <p className="text-stone-500 dark:text-stone-400 text-sm">Enter your 4-digit employee PIN</p>
              </div>
              
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-14 sm:h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold ${
                    pin.length > i 
                      ? "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900" 
                      : "border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white"
                  }`}>
                    {pin.length > i ? "•" : ""}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((num) => (
                  <button
                    key={num}
                    type={num === 'OK' ? 'submit' : 'button'}
                    onClick={() => {
                      if (num === 'C') setPin('');
                      else if (num === 'OK') return;
                      else setPin(p => p.length < 4 ? p + num : p);
                    }}
                    className={`h-14 sm:h-16 rounded-2xl font-bold text-xl transition-all touch-manipulation ${
                      num === 'OK' 
                        ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-lg shadow-stone-200 dark:shadow-none" 
                        : "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </form>
          )}

          {step === 'action' && (
            <div className="w-full min-w-0 space-y-4 sm:space-y-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl sm:rounded-[32px] border border-stone-100 dark:border-stone-700">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center shadow-sm">
                    <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-stone-900 dark:text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Location</p>
                    <p className="font-bold text-stone-900 dark:text-white truncate">{scannedLocation?.name}</p>
                    {scannedLocation?.locationNumber && (
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                        Location #{scannedLocation.locationNumber}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 sm:text-right border-t border-stone-200/80 dark:border-stone-700/80 pt-4 sm:border-0 sm:pt-0">
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Employee</p>
                    <p className="font-bold text-stone-900 dark:text-white truncate">{employee?.name}</p>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center shadow-sm">
                    <User className="w-5 h-5 sm:w-6 sm:h-6 text-stone-900 dark:text-white" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {hasAnyAction ? (
                  <div className="flex p-2 bg-stone-100 dark:bg-stone-800 rounded-2xl gap-1">
                    <button 
                      onClick={() => setActionMode('OUT')}
                      disabled={!canOut}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        actionMode === 'OUT' ? "bg-white dark:bg-stone-700 text-red-600 dark:text-red-400 shadow-sm" : "text-stone-500 dark:text-stone-400"
                      } ${!canOut ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      Check Out
                    </button>
                    <button 
                      onClick={() => setActionMode('IN')}
                      disabled={!canIn}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        actionMode === 'IN' ? "bg-white dark:bg-stone-700 text-green-600 dark:text-green-400 shadow-sm" : "text-stone-500 dark:text-stone-400"
                      } ${!canIn ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      <span className="sm:hidden">Check In</span>
                      <span className="hidden sm:inline">Check In (Restock)</span>
                    </button>
                    <button 
                      onClick={() => setActionMode('INVENTORY_CHECK')}
                      disabled={!canInventory}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        actionMode === 'INVENTORY_CHECK' ? "bg-white dark:bg-stone-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-stone-500 dark:text-stone-400"
                      } ${!canInventory ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      <span className="sm:hidden">Count</span>
                      <span className="hidden sm:inline">Inventory Check</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-6 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-[32px] border border-red-100 dark:border-red-900/50 text-sm font-bold text-center">
                    You do not have permission to perform stock actions.
                  </div>
                )}

                {actionMode === 'INVENTORY_CHECK' && canInventory ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                        Verify quantity on hand at {scannedLocation?.name || 'this location'}
                      </p>
                    </div>
                    {isLoadingInventoryStock ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-500 dark:text-stone-400">
                        <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
                        Loading current stock...
                      </div>
                    ) : (
                    <>
                    {Object.values(systemQuantities).every((q) => q === 0) && (
                      <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-2xl text-sm border border-amber-100 dark:border-amber-900/40">
                        No stock recorded at this location yet. Quantities show 0 until items are checked in here.
                        {isAdmin && ' Pick a location with stock from the list on the scan screen, or check items in first.'}
                      </div>
                    )}
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                      {items.map((item) => {
                        const systemQty = systemQuantities[item.id] ?? 0;
                        const enteredRaw = inventoryQuantities[item.id] ?? '';
                        const enteredQty = enteredRaw === '' ? null : parseInt(enteredRaw, 10);
                        const hasVariance =
                          enteredQty !== null && !Number.isNaN(enteredQty) && enteredQty !== systemQty;

                        return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-3 sm:p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 min-w-0"
                        >
                          <div className="w-10 h-10 shrink-0 bg-white dark:bg-stone-900 rounded-xl overflow-hidden flex items-center justify-center">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Package className="w-4 h-4 text-stone-300 dark:text-stone-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-stone-900 dark:text-white truncate">{item.name}</p>
                            <p className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">{item.sku}</p>
                            <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                              System on hand: <span className="font-bold">{systemQty}</span>
                              {hasVariance && (
                                <span className="ml-2 text-amber-600 dark:text-amber-400 font-bold">
                                  Variance: {enteredQty! - systemQty > 0 ? '+' : ''}{enteredQty! - systemQty}
                                </span>
                              )}
                            </p>
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={inventoryQuantities[item.id] ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw !== '' && !/^\d+$/.test(raw)) return;
                              setInventoryQuantities((prev) => ({ ...prev, [item.id]: raw }));
                            }}
                            className="w-20 h-11 shrink-0 bg-white dark:bg-stone-900 rounded-xl text-center text-base font-bold text-stone-900 dark:text-white shadow-sm focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        );
                      })}
                      {items.length === 0 && (
                        <p className="text-center text-sm text-stone-400 dark:text-stone-500 py-8">No items in catalog.</p>
                      )}
                    </div>
                    </>
                    )}
                    <button
                      type="button"
                      onClick={handleInventoryCheck}
                      disabled={!canInventorySubmit || isProcessing || isLoadingInventoryStock}
                      className="w-full bg-blue-600 dark:bg-blue-500 text-white py-4 sm:py-5 rounded-2xl sm:rounded-[24px] font-bold text-base sm:text-lg hover:bg-blue-700 dark:hover:bg-blue-400 transition-all shadow-xl shadow-blue-200/50 dark:shadow-none disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation min-h-[52px]"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        `Submit Inventory Check (${items.length} items)`
                      )}
                    </button>
                  </div>
                ) : hasAnyAction && (canOut || canIn) ? (
                <>
                <div className="space-y-4 bg-stone-50 dark:bg-stone-800 p-4 sm:p-6 rounded-2xl sm:rounded-[32px] border border-stone-100 dark:border-stone-700 min-w-0">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-1 sm:ml-4">Add Item</label>
                    <div className="flex gap-3 sm:gap-4 min-w-0">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-700 flex items-center justify-center overflow-hidden shadow-sm">
                        {selectedItem && items.find(i => i.id === selectedItem)?.imageUrl ? (
                          <img 
                            src={items.find(i => i.id === selectedItem)?.imageUrl} 
                            alt="Item" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-stone-300 dark:text-stone-600" />
                        )}
                      </div>
                      <select 
                        className="flex-1 min-w-0 p-3 sm:p-4 text-base bg-white dark:bg-stone-900 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                        value={selectedItem}
                        onChange={(e) => setSelectedItem(e.target.value)}
                        disabled={!canIn && !canOut}
                      >
                        <option value="">Choose an item...</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0" ref={quantityControlsRef}>
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-1 sm:ml-4">
                      Quantity
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3 sm:flex-1">
                        <button 
                          type="button"
                          onClick={() => setQuantityValue(quantity - 1)}
                          disabled={!canIn && !canOut}
                          className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center text-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-sm disabled:opacity-50 touch-manipulation"
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <input 
                          ref={quantityInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          enterKeyHint="done"
                          autoComplete="off"
                          value={quantityInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw !== '' && !/^\d+$/.test(raw)) return;
                            setQuantityInput(raw);
                            setQuantityError('');
                            const parsed = parseInt(raw, 10);
                            if (!isNaN(parsed) && parsed >= 1) {
                              setQuantity(parsed);
                            }
                          }}
                          onBlur={handleQuantityBlur}
                          disabled={!canIn && !canOut}
                          className={`flex-1 min-w-0 h-14 sm:h-12 bg-white dark:bg-stone-900 rounded-xl text-center text-lg sm:text-base font-bold text-stone-900 dark:text-white shadow-sm focus:ring-2 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            quantityError
                              ? 'ring-2 ring-red-300 dark:ring-red-800'
                              : 'focus:ring-stone-200 dark:focus:ring-stone-700'
                          }`}
                        />
                        <button 
                          type="button"
                          onClick={() => setQuantityValue(quantity + 1)}
                          disabled={!canIn && !canOut}
                          className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center text-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-sm disabled:opacity-50 touch-manipulation"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button 
                        type="button"
                        onClick={handleAddToCart}
                        disabled={!selectedItem || (!canIn && !canOut)}
                        className="w-full sm:w-auto sm:shrink-0 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 sm:px-8 h-12 rounded-xl font-bold text-sm hover:bg-stone-800 dark:hover:bg-white transition-all disabled:opacity-50 shadow-md touch-manipulation"
                      >
                        Add to List
                      </button>
                    </div>
                    {quantityError && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 ml-1">{quantityError}</p>
                    )}
                  </div>

                  {actionMode === 'IN' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Batch Number</label>
                        <input 
                          type="text"
                          placeholder="Optional"
                          className="w-full p-3 text-base bg-white dark:bg-stone-900 border-none rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Expiry Date</label>
                        <input 
                          type="date"
                          className="w-full p-3 text-base bg-white dark:bg-stone-900 border-none rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {actionMode === 'OUT' && availableStocks.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Select Batch</label>
                      <select 
                        className="w-full p-3 text-base bg-white dark:bg-stone-900 border-none rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                        value={batchNumber}
                        onChange={(e) => {
                          const bn = e.target.value;
                          setBatchNumber(bn);
                          const stock = availableStocks.find(s => s.batchNumber === bn);
                          if (stock?.expiryDate) setExpiryDate(stock.expiryDate);
                        }}
                      >
                        <option value="">Default (No Batch)</option>
                        {availableStocks.map((s, idx) => (
                          <option key={idx} value={s.batchNumber || ''}>
                            {s.batchNumber || 'No Batch'} ({s.quantity} available) {s.expiryDate ? `- Exp: ${s.expiryDate}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Cart Items */}
                {cart.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-4">
                      <h4 className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Items to {actionMode === 'IN' ? 'Check In' : 'Check Out'}</h4>
                      <span className="text-xs font-bold text-stone-900 dark:text-white bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">{cart.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {cart.map((item, idx) => (
                        <div key={`${item.itemId}-${idx}`} className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm group min-w-0">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-lg overflow-hidden shrink-0">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-stone-300 dark:text-stone-600" /></div>
                              )}
                            </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-stone-900 dark:text-white truncate">{item.name}</p>
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-[10px] text-stone-400 dark:text-stone-500 font-mono truncate">{item.sku}</p>
                                  {item.batchNumber && (
                                    <>
                                      <span className="text-[10px] text-stone-300 dark:text-stone-600">•</span>
                                      <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-tighter">Batch: {item.batchNumber}</p>
                                    </>
                                  )}
                                </div>
                              </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                            <span className="text-sm font-bold text-stone-900 dark:text-white tabular-nums">x{item.quantity}</span>
                            <button 
                              type="button"
                              onClick={() => removeFromCart(idx)}
                              className="p-2 text-stone-300 dark:text-stone-600 hover:text-red-500 dark:hover:text-red-400 transition-colors touch-manipulation"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button 
                  type="button"
                  onClick={handleTransaction}
                  disabled={!canCheckout || isProcessing}
                  className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] font-bold text-base sm:text-lg hover:bg-stone-800 dark:hover:bg-white transition-all shadow-xl shadow-stone-200 dark:shadow-none disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation min-h-[52px]"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 dark:border-stone-900/30 border-t-white dark:border-t-stone-900 rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Confirm ${actionMode === 'IN' ? 'Check In' : 'Check Out'} (${cart.length + (pendingQuantityValid ? 1 : 0)} items)`
                  )}
                </button>
                {!canCheckout && (
                  <p className="text-center text-xs text-stone-400 dark:text-stone-500">
                    Select an item and enter a quantity to check out
                  </p>
                )}
                </>
                ) : null}
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center space-y-8">
              <div className="w-24 h-24 bg-green-50 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12 text-green-500 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-stone-900 dark:text-white">Success!</h3>
                <p className="text-stone-500 dark:text-stone-400">
                  {lastActionMode === 'INVENTORY_CHECK'
                    ? 'Inventory check has been recorded successfully.'
                    : 'Inventory has been updated successfully.'}
                </p>
              </div>
              <button 
                onClick={reset}
                className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-10 py-4 rounded-2xl font-bold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
              >
                Start New Transaction
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
