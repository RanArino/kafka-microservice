'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

interface OrderFormProps {
  onOrderCreated: (orderId: string) => void;
}

// Product catalog with prices
const PRODUCTS = {
  S1: { name: 'Product S1', price: 12.50 },
  S2: { name: 'Product S2', price: 8.99 },
  S3: { name: 'Product S3', price: 15.25 },
  S4: { name: 'Product S4', price: 22.00 },
};

export default function OrderForm({ onOrderCreated }: OrderFormProps) {
  const [userId, setUserId] = useState('user1');
  const [items, setItems] = useState<OrderItem[]>([{ sku: 'S1', qty: 1, price: PRODUCTS.S1.price }]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate total automatically
  const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);

  const addItem = () => {
    const availableSkus = Object.keys(PRODUCTS) as Array<keyof typeof PRODUCTS>;
    // Find first SKU not already in the items list
    const usedSkus = new Set(items.map(item => item.sku));
    const nextSku = availableSkus.find(sku => !usedSkus.has(sku)) || 'S1';
    
    setItems([...items, { 
      sku: nextSku, 
      qty: 1, 
      price: PRODUCTS[nextSku as keyof typeof PRODUCTS].price 
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Update price when SKU changes
    if (field === 'sku') {
      const sku = value as keyof typeof PRODUCTS;
      newItems[index].price = PRODUCTS[sku].price;
    }
    
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Remove price from items before sending to backend (it's calculated)
      const orderItems = items.map(({ sku, qty }) => ({ sku, qty }));
      
      const response = await axios.post('http://localhost:8081/orders', {
        userId,
        items: orderItems,
        total: parseFloat(total.toFixed(2)),
        currency,
      });

      const { orderId } = response.data;
      onOrderCreated(orderId);
      
      // Reset form after successful order
      setItems([{ sku: 'S1', qty: 1, price: PRODUCTS.S1.price }]);
      setError(null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // Handle stock validation errors specifically
        if (err.response.status === 409) {
          setError(`Stock Error: ${err.response.data.error}`);
        } else {
          setError(err.response.data.error || 'Failed to create order');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create order');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
            User ID
          </label>
          <input
            type="text"
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-4 py-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Items</label>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-6 gap-3 items-center p-3 bg-gray-50 rounded-lg">
                <div className="col-span-2">
                  <select
                    value={item.sku}
                    onChange={(e) => updateItem(index, 'sku', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Object.entries(PRODUCTS).map(([sku, product]) => (
                      <option key={sku} value={sku}>{product.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 0)}
                    min="1"
                    className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Qty"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  ${item.price.toFixed(2)}
                </div>
                <div className="text-sm font-medium text-gray-900">
                  ${(item.qty * item.price).toFixed(2)}
                </div>
                <div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
                      title="Remove item"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-6 gap-3 text-xs text-gray-500 mt-1 px-3">
            <div className="col-span-2">Product</div>
            <div>Quantity</div>
            <div>Unit Price</div>
            <div>Subtotal</div>
            <div></div>
          </div>
          
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= Object.keys(PRODUCTS).length}
            className="mt-3 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Item
          </button>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">Total:</span>
            <span className="text-xl font-bold text-blue-600">
              {currency} ${total.toFixed(2)}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-2">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-4 py-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || items.length === 0}
          className="w-full bg-blue-500 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
        >
          {loading ? 'Creating Order...' : `Create Order - ${currency} $${total.toFixed(2)}`}
        </button>
      </form>
    </div>
  );
}