import React, { useState, useEffect, useRef } from 'react';
import { Location, Item, Employee, Stock } from '../types/inventory';
import { QrCode, Scan, CheckCircle2, ArrowRightLeft, Package, MapPin, User, AlertCircle, Trash2 } from 'lucide-react';
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
  const [txType, setTxType] = useState<'IN' | 'OUT'>('OUT');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (loggedInEmployee) {
      setEmployee(loggedInEmployee);
      // Set initial txType based on permissions
      if (loggedInEmployee.permissions) {
        if (loggedInEmployee.permissions.canCheckOut) setTxType('OUT');
        else if (loggedInEmployee.permissions.canCheckIn) setTxType('IN');
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
      setError('Location ID not found');
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
          if (emp.permissions.canCheckOut) setTxType('OUT');
          else if (emp.permissions.canCheckIn) setTxType('IN');
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
    if (txType === 'OUT' && !batchNumber) {
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
    if (!result.ok) {
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
        type: txType,
        lines: checkoutCart.map((c) => ({
          itemId: c.itemId,
          quantity: c.quantity,
          batchNumber: c.batchNumber,
          expiryDate: c.expiryDate,
        })),
      });
      setCart([]);
      resetItemForm();
      setStep('success');
    } catch (err) {
      console.error("Transaction failed:", err);
      setError('Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

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
    setError('');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="text-center">
        <h2 className="text-4xl font-bold text-stone-900 dark:text-white tracking-tight">Stock Movement</h2>
        <p className="text-stone-500 dark:text-stone-400 mt-2">Scan location QR and enter PIN to check items in/out.</p>
      </header>

      <div className="bg-white dark:bg-stone-900 rounded-[40px] border border-stone-100 dark:border-stone-800 shadow-xl shadow-stone-200/50 dark:shadow-none overflow-hidden min-h-[500px] flex flex-col">
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

        <div className="flex-1 p-10 flex flex-col items-center justify-center relative">
          {error && (
            <div className="absolute top-4 left-10 right-10 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-sm flex items-center gap-2 border border-red-100 dark:border-red-900/50">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {step === 'scan' && (
            <div className="w-full space-y-8 text-center">
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
                    <p className="text-stone-500 dark:text-stone-400 text-sm">Enter the Location ID number (e.g., 101)</p>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Location ID #"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-center text-2xl font-bold tracking-widest focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-600 transition-all"
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
            <form id="pin-form" onSubmit={handlePinSubmit} className="w-full max-w-xs space-y-8 text-center">
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-stone-900 dark:text-white">{scannedLocation?.name}</h3>
                <p className="text-stone-500 dark:text-stone-400 text-sm">Enter your 4-digit employee PIN</p>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold ${
                    pin.length > i 
                      ? "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900" 
                      : "border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white"
                  }`}>
                    {pin.length > i ? "•" : ""}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((num) => (
                  <button
                    key={num}
                    type={num === 'OK' ? 'submit' : 'button'}
                    onClick={() => {
                      if (num === 'C') setPin('');
                      else if (num === 'OK') return;
                      else setPin(p => p.length < 4 ? p + num : p);
                    }}
                    className={`h-16 rounded-2xl font-bold text-xl transition-all ${
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
            <div className="w-full space-y-8">
              <div className="flex items-center justify-between p-6 bg-stone-50 dark:bg-stone-800 rounded-[32px] border border-stone-100 dark:border-stone-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center shadow-sm">
                    <MapPin className="w-6 h-6 text-stone-900 dark:text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Location</p>
                    <p className="font-bold text-stone-900 dark:text-white">{scannedLocation?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Employee</p>
                    <p className="font-bold text-stone-900 dark:text-white">{employee?.name}</p>
                  </div>
                  <div className="w-12 h-12 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center shadow-sm">
                    <User className="w-6 h-6 text-stone-900 dark:text-white" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {(employee?.permissions?.canCheckIn !== false || employee?.permissions?.canCheckOut !== false) ? (
                  <div className="flex p-2 bg-stone-100 dark:bg-stone-800 rounded-2xl">
                    <button 
                      onClick={() => setTxType('OUT')}
                      disabled={employee?.permissions?.canCheckOut === false}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        txType === 'OUT' ? "bg-white dark:bg-stone-700 text-red-600 dark:text-red-400 shadow-sm" : "text-stone-500 dark:text-stone-400"
                      } ${employee?.permissions?.canCheckOut === false ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      Check Out
                    </button>
                    <button 
                      onClick={() => setTxType('IN')}
                      disabled={employee?.permissions?.canCheckIn === false}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        txType === 'IN' ? "bg-white dark:bg-stone-700 text-green-600 dark:text-green-400 shadow-sm" : "text-stone-500 dark:text-stone-400"
                      } ${employee?.permissions?.canCheckIn === false ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      Check In (Restock)
                    </button>
                  </div>
                ) : (
                  <div className="p-6 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-[32px] border border-red-100 dark:border-red-900/50 text-sm font-bold text-center">
                    You do not have permission to check items in or out.
                  </div>
                )}

                <div className="space-y-4 bg-stone-50 dark:bg-stone-800 p-6 rounded-[32px] border border-stone-100 dark:border-stone-700">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Add Item</label>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-700 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
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
                        className="flex-1 p-4 bg-white dark:bg-stone-900 border-none rounded-2xl text-stone-900 dark:text-white font-medium focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                        value={selectedItem}
                        onChange={(e) => setSelectedItem(e.target.value)}
                        disabled={employee?.permissions?.canCheckIn === false && employee?.permissions?.canCheckOut === false}
                      >
                        <option value="">Choose an item...</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1" ref={quantityControlsRef}>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => setQuantityValue(quantity - 1)}
                          disabled={employee?.permissions?.canCheckIn === false && employee?.permissions?.canCheckOut === false}
                          className="w-12 h-12 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center text-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-sm disabled:opacity-50"
                        >
                          -
                        </button>
                        <input 
                          ref={quantityInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
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
                          disabled={employee?.permissions?.canCheckIn === false && employee?.permissions?.canCheckOut === false}
                          className={`flex-1 h-12 bg-white dark:bg-stone-900 rounded-xl text-center font-bold text-stone-900 dark:text-white shadow-sm focus:ring-2 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            quantityError
                              ? 'ring-2 ring-red-300 dark:ring-red-800'
                              : 'focus:ring-stone-200 dark:focus:ring-stone-700'
                          }`}
                        />
                        <button 
                          type="button"
                          onClick={() => setQuantityValue(quantity + 1)}
                          disabled={employee?.permissions?.canCheckIn === false && employee?.permissions?.canCheckOut === false}
                          className="w-12 h-12 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center text-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-sm disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                      <button 
                        type="button"
                        onClick={handleAddToCart}
                        disabled={!selectedItem || (employee?.permissions?.canCheckIn === false && employee?.permissions?.canCheckOut === false)}
                        className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-8 h-12 rounded-xl font-bold text-sm hover:bg-stone-800 dark:hover:bg-white transition-all disabled:opacity-50 shadow-md"
                      >
                        Add to List
                      </button>
                    </div>
                    {quantityError && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 ml-1">{quantityError}</p>
                    )}
                  </div>

                  {txType === 'IN' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Batch Number</label>
                        <input 
                          type="text"
                          placeholder="Optional"
                          className="w-full p-3 bg-white dark:bg-stone-900 border-none rounded-xl text-xs text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Expiry Date</label>
                        <input 
                          type="date"
                          className="w-full p-3 bg-white dark:bg-stone-900 border-none rounded-xl text-xs text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {txType === 'OUT' && availableStocks.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-2">Select Batch</label>
                      <select 
                        className="w-full p-3 bg-white dark:bg-stone-900 border-none rounded-xl text-xs text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 shadow-sm"
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
                      <h4 className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Items to {txType === 'IN' ? 'Check In' : 'Check Out'}</h4>
                      <span className="text-xs font-bold text-stone-900 dark:text-white bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">{cart.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {cart.map((item, idx) => (
                        <div key={`${item.itemId}-${idx}`} className="flex items-center justify-between p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-lg overflow-hidden flex-shrink-0">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-stone-300 dark:text-stone-600" /></div>
                              )}
                            </div>
                              <div>
                                <p className="text-sm font-bold text-stone-900 dark:text-white">{item.name}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">{item.sku}</p>
                                  {item.batchNumber && (
                                    <>
                                      <span className="text-[10px] text-stone-300 dark:text-stone-600">•</span>
                                      <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-tighter">Batch: {item.batchNumber}</p>
                                    </>
                                  )}
                                </div>
                              </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-stone-900 dark:text-white">x{item.quantity}</span>
                            <button 
                              onClick={() => removeFromCart(idx)}
                              className="p-2 text-stone-300 dark:text-stone-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
                  className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-5 rounded-[24px] font-bold text-lg hover:bg-stone-800 dark:hover:bg-white transition-all shadow-xl shadow-stone-200 dark:shadow-none disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 dark:border-stone-900/30 border-t-white dark:border-t-stone-900 rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Confirm ${txType === 'IN' ? 'Check In' : 'Check Out'} (${cart.length + (pendingQuantityValid ? 1 : 0)} items)`
                  )}
                </button>
                {!canCheckout && (
                  <p className="text-center text-xs text-stone-400 dark:text-stone-500">
                    Select an item and enter a quantity to check out
                  </p>
                )}
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
                <p className="text-stone-500 dark:text-stone-400">Inventory has been updated successfully.</p>
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
