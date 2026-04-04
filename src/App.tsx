import React, { useState, useEffect } from 'react';
import { auth, onAuthStateChanged, User, db, collection, query, where, getDocs, signInAnonymously } from './lib/firebase';
import { Layout } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { LocationDashboard } from './pages/LocationDashboard';
import { CheckoutPage } from './pages/CheckoutPage';
import { ReportsPage } from './pages/ReportsPage';
import { InsightAI } from './components/InsightAI';
import { LoginPage } from './pages/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Employee } from './types/inventory';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'admin' | 'locations' | 'checkout' | 'reports' | 'insight'>('admin');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Clear employee if the user logs out or logs in as a real admin
      if (!u || !u.isAnonymous) {
        setEmployee(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleEmployeeLogin = async (pin: string) => {
    try {
      // 1. Verify the PIN first (requires allow read: if true on employees collection)
      const q = query(collection(db, 'employees'), where('pin', '==', pin));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const empData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Employee;
        
        // Note: We are skipping signInAnonymously because it may be disabled in the Firebase console.
        // The firestore.rules are configured to allow these specific employee actions without auth.
        // If you want to use isAuthenticated() in rules, enable the "Anonymous" provider in Firebase Console.
        
        setEmployee(empData);
        // If they are an admin, send them to the dashboard, otherwise to checkout
        setCurrentPage(empData.role === 'admin' ? 'admin' : 'checkout');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Employee login error:", error);
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
    setEmployee(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f5f5f4]">
        <div className="animate-pulse text-xl font-medium text-stone-400">Loading OmniStock...</div>
      </div>
    );
  }

  // If not logged in at all
  if (!user && !employee) {
    return <LoginPage onEmployeeLogin={handleEmployeeLogin} />;
  }

  // If employee is logged in (either via state or anonymous auth)
  // We prioritize the employee view if the user is anonymous
  if (employee && employee.role === 'staff') {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-[#f5f5f4] dark:bg-stone-950 p-6 transition-colors">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-stone-900 dark:bg-white rounded-xl flex items-center justify-center">
                  <span className="text-white dark:text-stone-900 font-bold">OS</span>
                </div>
                <div>
                  <h1 className="font-bold text-stone-900 dark:text-white">OmniStock</h1>
                  <p className="text-xs text-stone-500">
                    Staff: {employee.name}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="text-sm font-semibold text-stone-500 hover:text-stone-900 dark:hover:text-white"
              >
                Logout
              </button>
            </div>
            <CheckoutPage loggedInEmployee={employee} />
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Layout 
        user={user || undefined} 
        employee={employee || undefined}
        currentPage={currentPage} 
        onPageChange={setCurrentPage} 
        onLogout={handleLogout}
      >
        {currentPage === 'admin' && <AdminDashboard loggedInUser={user || undefined} loggedInEmployee={employee || undefined} />}
        {currentPage === 'locations' && <LocationDashboard />}
        {currentPage === 'checkout' && <CheckoutPage loggedInEmployee={employee || undefined} />}
        {currentPage === 'reports' && <ReportsPage />}
        {currentPage === 'insight' && <InsightAI />}
      </Layout>
    </ErrorBoundary>
  );
}
