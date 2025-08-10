'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface StockData {
  [sku: string]: number;
}

export default function StockView() {
  const [stock, setStock] = useState<StockData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedData, setSeedData] = useState('{"S1": 50, "S2": 30}');

  const fetchStock = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8084/stock');
      setStock(response.data);
      setError(null);
    } catch {
      setError('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  };

  const seedStock = async () => {
    try {
      const data = JSON.parse(seedData);
      await axios.post('http://localhost:8084/seed', data);
      await fetchStock(); // Refresh stock data
    } catch {
      setError('Failed to seed stock data. Check JSON format.');
    }
  };

  useEffect(() => {
    fetchStock();
    
    // Poll for stock updates every 5 seconds
    const interval = setInterval(fetchStock, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl shadow-lg border border-border">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-foreground">Current Inventory</h3>
        <button
          onClick={fetchStock}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          <p className="mt-2 text-muted-foreground">Loading stock data...</p>
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3 mb-6">
          {Object.keys(stock).length === 0 ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground mb-2">
                <svg className="w-12 h-12 mx-auto opacity-50" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-muted-foreground">No stock data available</p>
            </div>
          ) : (
            Object.entries(stock).map(([sku, quantity]) => (
              <div
                key={sku}
                className="flex justify-between items-center p-4 border border-border rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors"
              >
                <span className="font-medium text-foreground text-lg">{sku}</span>
                <span
                  className={`font-bold text-lg ${
                    quantity > 10
                      ? 'text-success'
                      : quantity > 0
                      ? 'text-warning'
                      : 'text-error'
                  }`}
                >
                  {quantity} units
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="pt-6 border-t border-border">
        <h4 className="text-lg font-semibold text-foreground mb-4">Seed Stock Data</h4>
        <div className="space-y-4">
          <textarea
            value={seedData}
            onChange={(e) => setSeedData(e.target.value)}
            className="w-full h-24 px-4 py-3 border border-input-border bg-input text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring font-mono text-sm transition-colors resize-none"
            placeholder='{"S1": 50, "S2": 30}'
          />
          <button
            onClick={seedStock}
            className="w-full bg-success text-white py-3 px-6 rounded-lg font-medium hover:bg-success/90 transition-colors shadow-lg"
          >
            Seed Stock
          </button>
        </div>
      </div>
    </div>
  );
}
