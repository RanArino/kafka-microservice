# Kafka Microservice Demo

A real-time order processing system built with Go microservices, Apache Kafka event streaming, and a Next.js frontend. This project demonstrates event-driven architecture with proper observability and reliability patterns.

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Next.js   │    │  orders-api  │    │ orders-processor│    │notifications-│
│  Frontend   │───▶│   :8081      │───▶│     :8082       │───▶│   api :8083  │
│   :3000     │    │              │    │                 │    │              │
└─────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
                           │                     │                      │
                           ▼                     ▼                      ▼
                   ┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
                   │   Kafka     │    │     Kafka       │    │    Kafka     │
                   │orders.created│   │ orders.status   │    │orders.status │
                   └─────────────┘    └─────────────────┘    └──────────────┘
                           │                                          │
                           ▼                                          ▼
                   ┌─────────────┐                            ┌──────────────┐
                   │stock-service│                            │  Frontend    │
                   │   :8084     │                            │  (SSE)       │
                   └─────────────┘                            └──────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │   Kafka     │
                   │inventory.   │
                   │  updated    │
                   └─────────────┘
```

## 🚀 Quick Start

There are two ways to start the applications:

- Option A (recommended): All-in-one with Docker Compose — build and start everything at once
- Option B: Manual per-service — start Kafka infra with Docker, then run each microservice/front-end locally

### Prerequisites
- Docker & Docker Compose
- Go ≥ 1.21
- Node.js ≥ 18
- Make (optional)

### 1. Start Kafka Infrastructure

Option A — All-in-one (build & start everything):

```bash
# One command to build and start all services
./deploy.sh

# or directly via Docker Compose
docker compose up --build -d
```

Option B — Infra only (for manual per-service startup):

```bash
# Start only ZooKeeper, Kafka, and Kafka UI
docker compose up -d zookeeper kafka kafka-ui

# Verify Kafka is running
docker compose ps

# Check Kafka UI at http://localhost:8080
```

### 2. Start Backend Services (used for Option B)

Open 4 terminal windows and run each service:

```bash
# Terminal 1: Orders API
make orders-api
# or: cd services/orders-api && go run .

# Terminal 2: Orders Processor  
make orders-processor
# or: cd services/orders-processor && go run .

# Terminal 3: Notifications API
make notifications-api
# or: cd services/notifications-api && go run .

# Terminal 4: Stock Service
make stock-service
# or: cd services/stock-service && go run .
```

### 3. Start Frontend (used for Option B)

```bash
# Terminal 5: Next.js Frontend
cd my-app
npm run dev
```

### 4. Test the System

1. **Open the frontend**: http://localhost:3000
2. **Seed inventory** (Stock tab): 
   ```json
   {"S1": 50, "S2": 30}
   ```
3. **Create an order** (Orders tab):
   - User ID: `u1`
   - Items: `S1`, quantity `2`
   - Total: `25.50`
4. **Watch real-time status updates** appear automatically via SSE

### 5. Manual API Testing

```bash
# Health checks
curl http://localhost:8081/healthz  # orders-api
curl http://localhost:8082/readyz   # orders-processor
curl http://localhost:8083/healthz  # notifications-api
curl http://localhost:8084/readyz   # stock-service

# Create order via API
curl -X POST http://localhost:8081/orders \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u1","items":[{"sku":"S1","qty":2}],"total":25.5,"currency":"USD"}'

# Check current stock
curl http://localhost:8084/stock

# Monitor Kafka topics at http://localhost:8080
```

## 📊 Service Endpoints

| Service | Port | Endpoints | Purpose |
|---------|------|-----------|---------|
| orders-api | 8081 | `POST /orders`, `/healthz`, `/readyz` | Create orders, produce events |
| orders-processor | 8082 | `/healthz`, `/readyz` | Process orders, update status |
| notifications-api | 8083 | `GET /events?orderId=X`, `/healthz`, `/readyz` | Stream status via SSE |
| stock-service | 8084 | `GET /stock`, `POST /seed`, `/healthz`, `/readyz` | Manage inventory |
| Frontend | 3000 | Next.js app | Order creation & monitoring |
| Kafka UI | 8080 | Web interface | Monitor topics & messages |

## 🔄 Event Flow

1. **Order Creation**: Frontend → `orders-api` → `orders.created` topic
2. **Order Processing**: `orders-processor` consumes → simulates payment → `orders.status` topic  
3. **Live Notifications**: `notifications-api` consumes → broadcasts via SSE → Frontend
4. **Inventory Update**: `stock-service` consumes `orders.created` → decrements stock → `inventory.updated` topic

## 🛠️ Features Implemented

- ✅ **Event-driven architecture** with Kafka
- ✅ **Real-time updates** via Server-Sent Events (SSE)
- ✅ **Graceful shutdown** on SIGTERM/SIGINT
- ✅ **Health & readiness probes** (`/healthz`, `/readyz`)
- ✅ **Retry logic** with exponential backoff
- ✅ **CORS support** for local development
- ✅ **Modern frontend** with Next.js & TypeScript

## 🧪 Testing Scenarios

1. **Happy Path**: Create order → See status updates → Check inventory decrease
2. **Service Resilience**: Stop/restart services → Verify graceful handling
3. **Kafka Monitoring**: Use Kafka UI to inspect topics and message flow
4. **Load Testing**: Create multiple orders rapidly
5. **Frontend Responsiveness**: Multiple browser tabs with different orders

## 🚢 Production Considerations

For production deployment, consider:
- Container orchestration (Docker, Kubernetes)
- Schema Registry for event contracts (Avro/Protobuf)
- Persistent storage (PostgreSQL, MongoDB)
- Monitoring & metrics (Prometheus, Grafana)
- Security (TLS, authentication, authorization)
- Horizontal scaling of services and Kafka partitions

## 📚 References

- [Building Microservices, 2nd Edition](https://www.oreilly.com/library/view/building-microservices-2nd/9781492034018/)
- [Kafka Microservice Architecture](https://medium.com/@andhikayusup/kafka-on-the-microservice-architecture-dc52d73837f2)
- [Real-time Payment Microservices](https://medium.com/@tharusha.wijayabahu/real-time-payment-microservices-with-apache-kafka-spring-boot-and-redis-streams-7d47665daf1e)
- [Spring Boot Microservices with Kafka](https://dev.to/ahmadtheswe/connecting-spring-boot-microservices-with-kafka-3hc7)
- [Kafka for Beginners](https://www.youtube.com/watch?v=QkdkLdMBuL0)