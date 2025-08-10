'use client';

import { useState } from 'react';
import OrderForm from './components/OrderForm';
import OrderStatus from './components/OrderStatus';
import StockView from './components/StockView';
import EventStreamViewer from './components/EventStreamViewer';

export default function Home() {
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'stock'>('orders');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Kafka Microservice Demo
          </h1>
          <p className="text-gray-600 text-lg">
            Real-time order processing with Kafka event streaming
          </p>
        </header>

        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              activeTab === 'orders'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            Orders
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              activeTab === 'stock'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            Stock
          </button>
        </div>

        {activeTab === 'orders' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div>
                              <h2 className="text-2xl font-semibold mb-6 text-gray-900">Create Order</h2>
              <OrderForm onOrderCreated={setCurrentOrderId} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-gray-900">Order Status</h2>
              <OrderStatus orderId={currentOrderId} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-900">🔄 Kafka Event Stream Visualization</h2>
              <EventStreamViewer orderId={currentOrderId} />
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-900">Current Stock</h2>
            <StockView />
          </div>
        )}
      </div>
    </div>
  );
}
