#!/bin/bash

echo "🚀 Starting Kafka Microservice System Deployment..."

# Stop and remove existing containers
echo "🛑 Stopping existing containers..."
docker compose down

# Remove old images to ensure fresh builds
echo "🗑️  Removing old images..."
docker compose down --rmi all

# Build and start all services
echo "🔨 Building and starting all services..."
docker compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Check service health
echo "🏥 Checking service health..."
services=("kafka-ui:8080" "orders-api:8081" "orders-processor:8082" "notifications-api:8083" "stock-service:8084" "frontend:3000")

for service in "${services[@]}"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    
    if curl -s -f "http://localhost:$port" > /dev/null || curl -s -f "http://localhost:$port/healthz" > /dev/null; then
        echo "✅ $name is healthy"
    else
        echo "❌ $name is not responding"
    fi
done

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📱 Access the services:"
echo "   Frontend:        http://localhost:3000"
echo "   Kafka UI:        http://localhost:8080"
echo "   Orders API:      http://localhost:8081"
echo "   Orders Processor: http://localhost:8082"
echo "   Notifications:   http://localhost:8083"
echo "   Stock Service:   http://localhost:8084"
echo ""
echo "🧪 Test the system:"
echo "   1. Open http://localhost:3000"
echo "   2. Create an order"
echo "   3. Watch real-time updates"
echo "   4. Check stock levels"
echo ""
echo "📊 Monitor Kafka:"
echo "   Open http://localhost:8080 to see message flow"
echo ""
echo "🛑 To stop all services:"
echo "   docker compose down"
