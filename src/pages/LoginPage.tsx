import React, { useState } from "react";
import { Package, User, ArrowRight } from "lucide-react";

interface LoginPageProps {
  onEmployeeLogin: (pin: string) => Promise<boolean>;
}

export function LoginPage({ onEmployeeLogin }: LoginPageProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) return;

    setLoading(true);
    setError("");
    const success = await onEmployeeLogin(pin);
    if (!success) {
      setError("Invalid PIN code");
      setPin("");
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
        <p className="text-stone-500 dark:text-stone-400 mb-10">
          Professional Inventory & Asset Management
        </p>

        <div className="space-y-8">
          <div className="flex items-center justify-between gap-3 mb-2 text-left">
            <div className="flex items-center gap-3">
              <User className="w-6 h-6 text-stone-900 dark:text-stone-100" />
              <div>
                <p className="text-lg font-bold text-stone-900 dark:text-white">PIN Login</p>
                <p className="text-xs text-stone-400 dark:text-stone-500 font-normal">
                  Admins & staff use your 4-digit PIN
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-stone-300 dark:text-stone-600" />
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-8">
            <div className="space-y-2">
              {error && (
                <p className="text-red-500 dark:text-red-400 text-xs font-bold">{error}</p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={`h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                    pin.length > i
                      ? "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900"
                      : "border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white"
                  }`}
                >
                  {pin.length > i ? "•" : ""}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((num) => (
                <button
                  key={num}
                  type={num === "OK" ? "submit" : "button"}
                  disabled={loading}
                  onClick={() => {
                    if (num === "C") setPin("");
                    else if (num === "OK") return;
                    else if (pin.length < 4) setPin((p) => p + num);
                  }}
                  className={`h-16 rounded-2xl font-bold text-xl transition-all ${
                    num === "OK"
                      ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-lg shadow-stone-200 dark:shadow-none"
                      : "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
