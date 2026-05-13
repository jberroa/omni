import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Item, Stock, Transaction } from '../types/inventory';
import { GoogleGenAI, Type } from "@google/genai";
import { Sparkles, TrendingUp, AlertCircle, DollarSign, Zap, RefreshCw, BarChart3, Lightbulb, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { useTheme } from '../contexts/ThemeContext';
import { toEventDate } from '../lib/dates';

interface AIInsight {
  type: 'warning' | 'opportunity' | 'trend' | 'tip';
  title: string;
  description: string;
  impact: string;
  action?: string;
}

interface InventoryAnalysis {
  healthScore: number;
  insights: AIInsight[];
  summary: string;
}

export const InsightAI: React.FC = () => {
  const { theme } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analysis, setAnalysis] = useState<InventoryAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [i, st, tx] = await Promise.all([
          api.getItems(),
          api.getStock(),
          api.getTransactions({ limit: 100 }),
        ]);
        if (!cancelled) {
          setItems(i);
          setStocks(st);
          setTransactions(tx);
        }
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const runAnalysis = async () => {
    if (items.length === 0) return;
    
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Prepare data for AI
      const inventoryData = items.map(item => {
        const itemStock = stocks.filter(s => s.itemId === item.id);
        const totalQty = itemStock.reduce((acc, s) => acc + s.quantity, 0);
        return {
          name: item.name,
          category: item.type,
          price: item.price,
          priceByBox: item.priceByBox,
          currentStock: totalQty,
          threshold: item.lowStockThreshold || 10
        };
      });

      const recentActivity = transactions.slice(0, 20).map(t => ({
        itemName: items.find(i => i.id === t.itemId)?.name || 'Unknown',
        type: t.type,
        qty: t.quantity,
        date: toEventDate(t.timestamp).toLocaleDateString(),
      }));

      const prompt = `Analyze this hotel housekeeping inventory data and provide strategic insights.
      Inventory: ${JSON.stringify(inventoryData)}
      Recent Activity: ${JSON.stringify(recentActivity)}
      
      Return a JSON object with:
      - healthScore (0-100)
      - summary (brief overview)
      - insights (array of objects with type: 'warning'|'opportunity'|'trend'|'tip', title, description, impact, action)
      
      Focus on:
      1. Stockouts risks.
      2. Cost savings (e.g. using priceByBox).
      3. Unusual usage patterns.
      4. Efficiency tips.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthScore: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['warning', 'opportunity', 'trend', 'tip'] },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    action: { type: Type.STRING }
                  },
                  required: ['type', 'title', 'description', 'impact']
                }
              }
            },
            required: ['healthScore', 'summary', 'insights']
          }
        }
      });

      const result = JSON.parse(response.text);
      setAnalysis(result);
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadPDF = async () => {
    if (!analysis) return;
    const element = document.getElementById('insight-report');
    if (!element) return;

    setIsGeneratingPDF(true);
    try {
      // Small delay to ensure any animations are settled
      await new Promise(resolve => setTimeout(resolve, 100));

      const dataUrl = await htmlToImage.toPng(element, {
        quality: 0.95,
        backgroundColor: theme === 'dark' ? '#0c0a09' : '#ffffff',
        pixelRatio: 2,
        style: {
          borderRadius: '0',
          margin: '0',
          padding: '40px'
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => (img.onload = resolve));
      
      const imgWidth = img.width;
      const imgHeight = img.height;
      const ratio = pdfWidth / imgWidth;
      const pdfHeight = imgHeight * ratio;
      
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

      pdf.save(`OmniStock_Insight_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'opportunity': return <DollarSign className="w-5 h-5 text-emerald-500" />;
      case 'trend': return <TrendingUp className="w-5 h-5 text-blue-500" />;
      case 'tip': return <Lightbulb className="w-5 h-5 text-amber-500" />;
      default: return <Zap className="w-5 h-5 text-stone-500" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-mono text-xs uppercase tracking-[0.2em]">
            <Sparkles className="w-3 h-3" />
            Intelligence Engine
          </div>
          <h1 className="text-5xl md:text-7xl font-light tracking-tighter text-stone-900 dark:text-white leading-none">
            Insight <span className="italic font-serif">AI</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          {analysis && (
            <button
              onClick={downloadPDF}
              disabled={isAnalyzing || isGeneratingPDF}
              className="flex items-center gap-2 px-6 py-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 rounded-full font-semibold hover:bg-stone-50 dark:hover:bg-stone-800 transition-all active:scale-95 disabled:opacity-50"
            >
              {isGeneratingPDF ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGeneratingPDF ? 'Preparing PDF...' : 'Download PDF'}
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing || isGeneratingPDF}
            className="group relative px-8 py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-full font-semibold overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center gap-2">
              {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {isAnalyzing ? 'Analyzing Data...' : 'Generate Insights'}
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-stone-800 to-stone-900 dark:from-stone-100 dark:to-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {!analysis && !isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="aspect-[21/9] flex flex-col items-center justify-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-[3rem] text-center p-12 space-y-4"
          >
            <div className="w-16 h-16 bg-stone-50 dark:bg-stone-900 rounded-full flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-stone-300" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-xl font-medium text-stone-900 dark:text-white">Ready for Analysis</h3>
              <p className="text-stone-500 dark:text-stone-400">
                Click the button above to let Gemini AI analyze your inventory levels, usage trends, and procurement costs.
              </p>
            </div>
          </motion.div>
        )}

        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-stone-100 dark:bg-stone-900 animate-pulse rounded-[2rem]" />
            ))}
          </motion.div>
        )}

        {analysis && !isAnalyzing && (
          <motion.div
            id="insight-report"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8 p-4"
          >
            {/* Summary & Score */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-stone-50 dark:bg-stone-900/50 p-10 rounded-[3rem] border border-stone-100 dark:border-stone-800 flex flex-col justify-center space-y-6">
                <div className="text-xs font-bold text-stone-400 uppercase tracking-widest">Executive Summary</div>
                <p className="text-2xl md:text-3xl font-light text-stone-800 dark:text-stone-200 leading-tight">
                  "{analysis.summary}"
                </p>
              </div>
              
              <div className="bg-stone-900 dark:bg-white p-10 rounded-[3rem] text-white dark:text-stone-900 flex flex-col items-center justify-center text-center space-y-2">
                <div className="text-xs font-bold opacity-50 uppercase tracking-widest">Health Score</div>
                <div className="text-8xl font-light tracking-tighter">{analysis.healthScore}</div>
                <div className="text-sm font-medium opacity-70">Inventory Efficiency</div>
              </div>
            </div>

            {/* Insights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {analysis.insights.map((insight, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="group p-8 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-[2.5rem] hover:shadow-2xl hover:shadow-stone-200/50 dark:hover:shadow-none transition-all"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl group-hover:scale-110 transition-transform">
                      {getIcon(insight.type)}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-full">
                      {insight.type}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-stone-900 dark:text-white mb-2">{insight.title}</h3>
                  <p className="text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
                    {insight.description}
                  </p>
                  
                  <div className="space-y-4 pt-6 border-t border-stone-50 dark:border-stone-800">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Impact</div>
                      <div className="text-sm font-medium text-stone-700 dark:text-stone-300">{insight.impact}</div>
                    </div>
                    {insight.action && (
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Action</div>
                        <div className="text-sm font-semibold text-stone-900 dark:text-white underline underline-offset-4 decoration-stone-200 dark:decoration-stone-700">
                          {insight.action}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="pt-12 border-t border-stone-100 dark:border-stone-800 flex flex-col md:flex-row justify-between items-center gap-4 text-stone-400 text-xs font-mono uppercase tracking-widest">
        <div>Powered by Gemini 3.1 Flash</div>
        <div>Last Analysis: {analysis ? new Date().toLocaleTimeString() : 'Never'}</div>
      </footer>
    </div>
  );
};
