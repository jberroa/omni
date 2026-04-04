import React, { useState } from 'react';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { Package, LogIn, User, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onEmployeeLogin: (pin: string) => Promise<boolean>;
}

export function LoginPage({ onEmployeeLogin }: LoginPageProps) {
  const [loginType, setLoginType] = useState<'admin' | 'employee' | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    
    setLoading(true);
    setError('');
    const success = await onEmployeeLogin(pin);
    if (!success) {
      setError('Invalid PIN code');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-stone-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-stone-900 rounded-[40px] p-10 shadow-xl shadow-stone-200 dark:shadow-none border border-stone-100 dark:border-stone-800 text-center">
        <div className="w-16 h-16 bg-stone-900 dark:bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Package className="w-8 h-8 text-white dark:text-stone-900" />
        </div>
        <h1 className="text-3xl font-bold text-stone-900 dark:text-white mb-2">OmniStock</h1>
        <p className="text-stone-500 dark:text-stone-400 mb-10">Professional Inventory & Asset Management</p>
        
        {!loginType ? (
          <div className="space-y-4">
            <button
              onClick={() => setLoginType('employee')}
              className="w-full flex items-center justify-between bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-5 px-8 rounded-3xl font-bold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none group"
            >
              <div className="flex items-center gap-4">
                <User className="w-6 h-6" />
                <div className="text-left">
                  <p className="text-lg">PIN Login</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 font-normal">For Admin & Staff members</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all" />
            </button>

            <button
              onClick={() => setLoginType('admin')}
              className="w-full flex items-center justify-between bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 py-5 px-8 rounded-3xl font-bold hover:bg-stone-50 dark:hover:bg-stone-700 transition-all group"
            >
              <div className="flex items-center gap-4">
                <LogIn className="w-6 h-6" />
                <div className="text-left">
                  <p className="text-lg">Superadmin Portal</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 font-normal">Full system management</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all" />
            </button>
          </div>
        ) : loginType === 'admin' ? (
          <div className="space-y-6">
            <button
              onClick={handleAdminLogin}
              className="w-full flex items-center justify-center gap-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-5 px-6 rounded-3xl font-bold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>
            <button 
              onClick={() => setLoginType(null)}
              className="text-sm font-semibold text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
            >
              Back to options
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <form onSubmit={handlePinSubmit} className="space-y-8">
              <div className="space-y-2">
                <p className="text-stone-500 dark:text-stone-400 text-sm">Enter your 4-digit employee PIN</p>
                {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold">{error}</p>}
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
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
                    disabled={loading}
                    onClick={() => {
                      if (num === 'C') setPin('');
                      else if (num === 'OK') return;
                      else if (pin.length < 4) setPin(p => p + num);
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
            <button 
              onClick={() => setLoginType(null)}
              className="text-sm font-semibold text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
            >
              Back to options
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
