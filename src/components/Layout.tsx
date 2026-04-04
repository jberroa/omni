import React from 'react';
import { User, auth } from '../lib/firebase';
import { LayoutDashboard, MapPin, QrCode, BarChart3, LogOut, Package, Sun, Moon, Sparkles, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { Employee } from '../types/inventory';

interface LayoutProps {
  children: React.ReactNode;
  user?: User;
  employee?: Employee;
  currentPage: string;
  onPageChange: (page: any) => void;
  onLogout: () => void;
}

export function Layout({ children, user, employee, currentPage, onPageChange, onLogout }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const navItems = [
    { id: 'admin', label: 'Inventory', icon: Package },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'checkout', label: 'Checkout', icon: QrCode },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'insight', label: 'Insight AI', icon: Sparkles },
  ];

  const displayName = user?.displayName || employee?.name || 'User';
  const displayEmail = user?.email || (employee?.role === 'admin' ? 'Administrator' : 'Staff');
  const photoURL = user?.photoURL;

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-stone-950 flex flex-col md:flex-row transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 flex flex-col transition-colors duration-300">
        <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-stone-900 dark:text-white" />
              OmniStock
            </h1>
            <p className="text-xs text-stone-500 mt-1 uppercase tracking-widest font-semibold">Inventory Control</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                currentPage === item.id
                  ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-lg shadow-stone-200 dark:shadow-none"
                  : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            {photoURL ? (
              <img src={photoURL} alt="" className="w-8 h-8 rounded-full border border-stone-200 dark:border-stone-700" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center border border-stone-200 dark:border-stone-700">
                <UserIcon className="w-4 h-4 text-stone-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-white truncate">{displayName}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">{displayEmail}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
