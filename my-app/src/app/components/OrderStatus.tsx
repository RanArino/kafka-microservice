'use client';

import { useState, useEffect, useRef } from 'react';

interface OrderStatus {
  orderId: string;
  status: string;
  reason?: string;
  updatedAt: string;
}

interface OrderStatusProps {
  orderId: string | null;
}

export default function OrderStatus({ orderId }: OrderStatusProps) {
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectToEventStream = (orderIdToConnect: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `http://localhost:8083/events?orderId=${orderIdToConnect}`
    );

    eventSource.onopen = () => {
      console.log('SSE connected for order:', orderIdToConnect);
      setConnected(true);
      setError(null);
      setReconnectAttempts(0);
    };

    eventSource.onmessage = (event) => {
      try {
        const status: OrderStatus = JSON.parse(event.data);
        console.log('Received status update:', status);
        setStatuses((prev) => {
          // Avoid duplicate status updates
          const isDuplicate = prev.some(s => 
            s.orderId === status.orderId && 
            s.status === status.status && 
            s.updatedAt === status.updatedAt
          );
          if (isDuplicate) return prev;
          return [...prev, status];
        });
      } catch (err) {
        console.error('Failed to parse status update:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err, 'ReadyState:', eventSource.readyState);
      setConnected(false);
      
      // Only set error and attempt reconnect if we're not manually closing
      if (eventSource.readyState !== EventSource.CLOSED) {
        const attempts = reconnectAttempts + 1;
        setReconnectAttempts(attempts);
        
        if (attempts <= 5) {
          setError(`Connection lost. Attempting to reconnect... (${attempts}/5)`);
          
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 16000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (orderId) {
              console.log(`Reconnecting attempt ${attempts} for order:`, orderId);
              connectToEventStream(orderId);
            }
          }, delay);
        } else {
          setError('Connection failed after multiple attempts. Please refresh the page.');
        }
      }
    };

    eventSourceRef.current = eventSource;
  };

  useEffect(() => {
    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!orderId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setStatuses([]);
      setConnected(false);
      setError(null);
      setReconnectAttempts(0);
      return;
    }

    // Reset state for new order
    setStatuses([]);
    setError(null);
    setReconnectAttempts(0);
    
    // Connect to event stream
    connectToEventStream(orderId);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setConnected(false);
    };
  }, [orderId]);

  const manualReconnect = () => {
    if (orderId) {
      setError(null);
      setReconnectAttempts(0);
      connectToEventStream(orderId);
    }
  };

  if (!orderId) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto opacity-50" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">
            Create an order to see real-time status updates
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Order: <span className="text-sm font-mono text-gray-600">{orderId}</span>
        </h3>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full transition-colors ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-600">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <span>{error}</span>
          {reconnectAttempts > 0 && (
            <button
              onClick={manualReconnect}
              className="ml-4 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded text-sm transition-colors"
            >
              Retry Now
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {statuses.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-block animate-pulse">
              <div className="w-8 h-8 bg-blue-200 rounded-full mx-auto mb-3"></div>
            </div>
            <p className="text-gray-500">
              Waiting for status updates...
            </p>
          </div>
        ) : (
          statuses.map((status, index) => (
            <div
              key={`${status.orderId}-${status.status}-${index}`}
              className="border-l-4 border-blue-500 pl-6 py-4 bg-blue-50 rounded-r-lg hover:bg-blue-100 transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-lg text-gray-900">{status.status}</span>
                <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded">
                  {new Date(status.updatedAt).toLocaleTimeString()}
                </span>
              </div>
              {status.reason && (
                <p className="text-gray-600 text-sm">{status.reason}</p>
              )}
            </div>
          ))
        )}
      </div>

      {statuses.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Last update: {new Date(statuses[statuses.length - 1]?.updatedAt).toLocaleString()}
          </p>
        </div>
      )}

      {connected && (
        <div className="mt-4 text-xs text-green-600 flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live connection active - updates will appear automatically
        </div>
      )}
    </div>
  );
}