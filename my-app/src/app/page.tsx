'use client';

import { useState } from 'react';
import OrderForm from './components/OrderForm';
import OrderStatus from './components/OrderStatus';
import StockView from './components/StockView';

export default function Home() {
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'stock'>('orders');

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Kafka Microservice Demo
          </h1>
          <p className="text-gray-600">
            Real-time order processing with Kafka event streaming
          </p>
        </header>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'orders'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Orders
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'stock'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Stock
          </button>
        </div>

        {activeTab === 'orders' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Create Order</h2>
              <OrderForm onOrderCreated={setCurrentOrderId} />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Order Status</h2>
              <OrderStatus orderId={currentOrderId} />
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Current Stock</h2>
            <StockView />
          </div>
        )}
      </div>
    </div>
  );
}
