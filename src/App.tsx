import React, { useState } from "react";
import { Layout } from "./components/Layout";
import { AdminDashboard } from "./pages/AdminDashboard";
import { LocationDashboard } from "./pages/LocationDashboard";
import { CheckoutPage } from "./pages/CheckoutPage";
import { ReportsPage } from "./pages/ReportsPage";
import { InsightAI } from "./components/InsightAI";
import { LoginPage } from "./pages/LoginPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Employee } from "./types/inventory";
import { api } from "./lib/api";

export default function App() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [currentPage, setCurrentPage] = useState<
    "admin" | "locations" | "checkout" | "reports" | "insight"
  >("admin");

  const handleEmployeeLogin = async (pin: string) => {
    try {
      const emp = await api.getEmployeeByPin(pin);
      if (emp) {
        setEmployee(emp);
        setCurrentPage(emp.role === "admin" ? "admin" : "checkout");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Employee login error:", error);
      return false;
    }
  };

  const handleLogout = () => {
    setEmployee(null);
  };

  if (!employee) {
    return <LoginPage onEmployeeLogin={handleEmployeeLogin} />;
  }

  if (employee.role === "staff") {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-[#f5f5f4] dark:bg-stone-950 p-4 sm:p-6 transition-colors overflow-x-hidden">
          <div className="max-w-4xl mx-auto min-w-0">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-stone-900 dark:bg-white rounded-xl flex items-center justify-center">
                  <span className="text-white dark:text-stone-900 font-bold">OS</span>
                </div>
                <div>
                  <h1 className="font-bold text-stone-900 dark:text-white">OmniStock</h1>
                  <p className="text-xs text-stone-500">Staff: {employee.name}</p>
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
        employee={employee}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onLogout={handleLogout}
      >
        {currentPage === "admin" && (
          <AdminDashboard loggedInEmployee={employee} />
        )}
        {currentPage === "locations" && <LocationDashboard />}
        {currentPage === "checkout" && (
          <CheckoutPage loggedInEmployee={employee} />
        )}
        {currentPage === "reports" && <ReportsPage />}
        {currentPage === "insight" && <InsightAI />}
      </Layout>
    </ErrorBoundary>
  );
}
