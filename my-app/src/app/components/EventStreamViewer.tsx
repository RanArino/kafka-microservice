'use client';

import { useState, useEffect } from 'react';

interface KafkaEvent {
  id: string;
  timestamp: string;
  topic: string;
  service: string;
  event: Record<string, unknown>;
  type: 'produced' | 'consumed';
}

interface EventStreamViewerProps {
  orderId: string | null;
}

export default function EventStreamViewer({ orderId }: EventStreamViewerProps) {
  const [events, setEvents] = useState<KafkaEvent[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setEvents([]);
      return;
    }

    // Simulate Kafka event stream for educational purposes
    // In a real system, you might have a dedicated endpoint that streams Kafka events
    const simulateEventStream = () => {
      const eventTypes = [
        {
          topic: 'orders.created',
          service: 'orders-api',
          type: 'produced' as const,
          event: {
            orderId,
            userId: 'user1',
            items: [{ sku: 'S1', qty: 2 }],
            total: 25.5,
            currency: 'USD',
            createdAt: new Date().toISOString()
          }
        },
        {
          topic: 'orders.created',
          service: 'orders-processor',
          type: 'consumed' as const,
          event: {
            orderId,
            status: 'PROCESSING',
            message: 'Order received for processing'
          }
        },
        {
          topic: 'orders.created',
          service: 'stock-service',
          type: 'consumed' as const,
          event: {
            orderId,
            action: 'STOCK_CHECK',
            message: 'Checking inventory for order items'
          }
        },
        {
          topic: 'orders.status',
          service: 'orders-processor',
          type: 'produced' as const,
          event: {
            orderId,
            status: 'PAID',
            reason: 'Payment processed successfully',
            updatedAt: new Date().toISOString()
          }
        },
        {
          topic: 'inventory.updated',
          service: 'stock-service',
          type: 'produced' as const,
          event: {
            sku: 'S1',
            delta: -2,
            newQuantity: 48,
            orderId,
            updatedAt: new Date().toISOString()
          }
        },
        {
          topic: 'orders.status',
          service: 'notifications-api',
          type: 'consumed' as const,
          event: {
            orderId,
            action: 'NOTIFY_CLIENT',
            message: 'Forwarding status update to frontend via SSE'
          }
        }
      ];

      eventTypes.forEach((eventTemplate, index) => {
        setTimeout(() => {
          const kafkaEvent: KafkaEvent = {
            id: `${orderId}-${index}`,
            timestamp: new Date().toISOString(),
            ...eventTemplate
          };
          
          setEvents(prev => [...prev, kafkaEvent]);
        }, (index + 1) * 800); // Stagger events by 800ms
      });
    };

    // Start simulation after a short delay
    const timer = setTimeout(simulateEventStream, 500);

    return () => clearTimeout(timer);
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="font-medium mb-4">🔄 Kafka Event Stream</h3>
        <p className="text-gray-500 text-center">
          Create an order to see Kafka events flowing through the system
        </p>
      </div>
    );
  }

  const getEventColor = (event: KafkaEvent) => {
    if (event.type === 'produced') {
      return 'border-blue-500 bg-blue-50';
    }
    return 'border-green-500 bg-green-50';
  };

  const getServiceColor = (service: string) => {
    const colors = {
      'orders-api': 'bg-blue-100 text-blue-800',
      'orders-processor': 'bg-purple-100 text-purple-800',
      'stock-service': 'bg-orange-100 text-orange-800',
      'notifications-api': 'bg-green-100 text-green-800'
    };
    return colors[service as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">🔄 Kafka Event Stream</h3>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {isVisible ? 'Hide' : 'Show'} Events
        </button>
      </div>

      {isVisible && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <p className="text-sm text-gray-600 mt-2">Waiting for Kafka events...</p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className={`border-l-4 p-3 rounded-r ${getEventColor(event)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getServiceColor(event.service)}`}>
                      {event.service}
                    </span>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {event.topic}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      event.type === 'produced' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {event.type === 'produced' ? '📤 PRODUCED' : '📥 CONSUMED'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="bg-white p-2 rounded text-xs font-mono">
                  <pre className="whitespace-pre-wrap text-gray-700">
                    {JSON.stringify(event.event, null, 2)}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-4 pt-4 border-t text-xs text-gray-600">
          <p>💡 <strong>This shows the Kafka event flow:</strong> Services produce events to topics, 
          other services consume them. This eliminates the &quot;black box&quot; and shows how microservices communicate!</p>
        </div>
      )}
    </div>
  );
}
