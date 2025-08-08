## Kafka Microservice Hands‑On: Implementation Guide (Checklist‑Driven)

This guide is a practical, end‑to‑end plan for building and demonstrating Kafka event streaming in a Go microservice architecture, with a minimal frontend to visualize the flow. It is structured as checklists you can follow and is designed to be the backbone for an accompanying blog post.

### Learning outcomes
- [ ] Understand how Kafka event streaming works (producers, consumers, partitions, offsets, consumer groups, delivery semantics)
- [ ] Implement a Go producer and consumer using `kafka-go` (or Sarama)
- [ ] Design event contracts and topics for a small domain (Orders)
 - [ ] Run Kafka 3.9.x locally with Docker + ZooKeeper and observe events with a Kafka UI
- [ ] Wire a simple frontend to the backend to create orders and watch status updates live (SSE/WebSocket)

---

## 0) Prerequisites
- [x] OS: macOS (tested), Linux, or Windows with Docker Desktop
- [x] Installed: Docker + Docker Compose
- [x] Installed: Go ≥ 1.21
- [x] Installed: Node ≥ 18 (for the frontend)
- [x] Installed: Make (optional), curl, jq (optional)

---

## 1) Repository layout plan

- [ ] Create the following structure as you go:

```
kafka-microservice/
  docker-compose.yml            # Kafka 3.9.x + ZooKeeper, Kafka UI
  makefile                      # Optional task shortcuts
  README.md                     # Quick start
  implementation_plan.md        # This guide

  services/
    orders-api/                 # REST API to create orders → produces events to Kafka
    orders-processor/           # Kafka consumer → processes orders → emits status updates
    notifications-api/          # SSE/WebSocket → streams order status to clients (consumes Kafka)
    stock-service/              # Kafka consumer → updates inventory → emits inventory updates

  client/
    web/                        # Minimal React/Vite frontend

  deploy/                       # Optional manifests (k8s), CI, etc.
```

---

## 2) Architecture and event flow (high‑level)

- [ ] Domain: Orders
  - `orders-api` accepts HTTP POST `/orders` with order data, produces `orders.created` event
  - `orders-processor` consumes `orders.created`, “processes” it (simulate payment), produces `orders.status` events
  - `notifications-api` consumes `orders.status` and pushes live updates to web clients via SSE (or WebSocket)
  - `stock-service` consumes `orders.created`, decrements inventory per item, and produces `inventory.updated` events
- [ ] Topics
  - `orders.created` (key: orderId, value: OrderCreated JSON)
  - `orders.status` (key: orderId, value: OrderStatus JSON)
  - `inventory.updated` (key: sku, value: InventoryUpdated JSON)
- [ ] Consumer groups
  - `orders-processor-cg`: processes new orders
  - `notifications-api-cg`: tails statuses for push to clients
  - `stock-service-cg`: updates inventory on orders

---

## 3) Kafka fundamentals (for the blog and team)

- [ ] Producers write records to topics; keys determine partitioning
- [ ] Consumers read from topics; offsets tracked per partition per consumer group
- [ ] Partitions provide horizontal scalability; ordering is guaranteed within a partition
- [ ] Delivery semantics: at‑least‑once by default; idempotent producers and transactional writes enable exactly‑once in some pipelines
- [ ] Schema/versioning: Avro/JSON/Protobuf + Schema Registry recommended for strong contracts

Add a simple diagram in the blog to show producer → topic partitions → consumer group.

---

## 4) Infrastructure: Docker Compose (Kafka 3.9.x + ZooKeeper)

- [ ] Add `docker-compose.yml` with:
  - ZooKeeper using `bitnami/zookeeper:3.9`
  - Kafka 3.9.x using `bitnami/kafka:3.9` configured to connect to ZooKeeper
  - Kafka UI using `provectuslabs/kafka-ui`

Example (ZooKeeper + Kafka 3.9) snippet to place in `docker-compose.yml`:

```yaml
services:
  zookeeper:
    image: bitnami/zookeeper:3.9
    container_name: zookeeper
    environment:
      - ALLOW_ANONYMOUS_LOGIN=yes
    ports:
      - "2181:2181"

  kafka:
    image: bitnami/kafka:3.9
    container_name: kafka
    ports:
      - "9093:9093"   # external listener for host
    environment:
      - KAFKA_CFG_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT_INTERNAL:PLAINTEXT,PLAINTEXT_EXTERNAL:PLAINTEXT
      - KAFKA_CFG_LISTENERS=PLAINTEXT_INTERNAL://:9092,PLAINTEXT_EXTERNAL://:9093
      - KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT_INTERNAL://kafka:9092,PLAINTEXT_EXTERNAL://localhost:9093
      - KAFKA_CFG_INTER_BROKER_LISTENER_NAME=PLAINTEXT_INTERNAL
      - KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=true
    depends_on:
      - zookeeper
    healthcheck:
      test: ["CMD", "bash", "-c", "/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | cat"]
      interval: 10s
      timeout: 5s
      retries: 10

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: kafka-ui
    ports:
      - "8080:8080"
    environment:
      - KAFKA_CLUSTERS_0_NAME=local
      - KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=kafka:9092
    depends_on:
      - kafka
```

- [ ] Start stack: `docker compose up -d`
- [ ] Verify UI at `http://localhost:8080` (cluster should be healthy)

---

## 5) Topics and contracts

- [ ] Create topics (optional if auto‑create enabled):
  - `orders.created` (partitions: 3, replication factor: 1)
  - `orders.status` (partitions: 3, replication factor: 1)
  - `inventory.updated` (partitions: 3, replication factor: 1)

Commands (optional when auto‑create is on):
```bash
docker compose exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --topic orders.created --partitions 3 --replication-factor 1

docker compose exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --topic orders.status --partitions 3 --replication-factor 1
```

- [ ] Define event JSON contracts (for blog + code):
```json
// orders.created value
{
  "orderId": "uuid",
  "userId": "uuid",
  "items": [{"sku": "string", "qty": 1}],
  "total": 123.45,
  "currency": "USD",
  "createdAt": "RFC3339"
}

// orders.status value
{
  "orderId": "uuid",
  "status": "CREATED|PROCESSING|PAID|FAILED",
  "reason": "optional string",
  "updatedAt": "RFC3339"
}

// inventory.updated value
{
  "sku": "string",
  "delta": -1,
  "newQuantity": 14,
  "orderId": "uuid",
  "updatedAt": "RFC3339"
}
```

---

## 6) Go services

Common notes
- [ ] Use module paths like `github.com/<you>/kafka-microservice/services/...`
- [ ] Library choice: `github.com/segmentio/kafka-go` for clarity and low boilerplate
- [ ] Config via env (optional, defaults applied if unset): `KAFKA_BROKERS=localhost:9093`
- [ ] Graceful shutdown with context cancellation and consumer close

### 6.1) `orders-api` (producer)
- [ ] Init module: `go mod init .../orders-api`
- [ ] Add HTTP server (Gin or net/http) with routes:
  - [ ] `POST /orders` → validate JSON → generate `orderId` → produce to `orders.created`
  - [ ] `GET /healthz`
- [ ] Add Kafka writer (per topic) with balanced partitioner on key `orderId`
- [ ] Return `201 Created` with `orderId`
- [ ] Dockerfile and local run target

Minimal writer example (for reference in code):
```go
import (
  "context"
  "github.com/segmentio/kafka-go"
)

func newWriter(brokers []string, topic string) *kafka.Writer {
  return &kafka.Writer{
    Addr:     kafka.TCP(brokers...),
    Topic:    topic,
    Balancer: &kafka.Hash{},
  }
}
```

### 6.2) `orders-processor` (consumer + producer)
- [ ] Init module: `go mod init .../orders-processor`
- [ ] Kafka reader for `orders.created` with group `orders-processor-cg`
- [ ] Simulate processing: sleep or simple rules; decide status → produce `orders.status`
- [ ] Ensure retry/backoff on temporary errors; log and continue
- [ ] Health endpoints if running as service

Minimal reader loop outline:
```go
r := kafka.NewReader(kafka.ReaderConfig{
  Brokers:  brokers,
  GroupID:  "orders-processor-cg",
  Topic:    "orders.created",
  MinBytes: 1, MaxBytes: 10e6,
})
defer r.Close()

for {
  m, err := r.ReadMessage(ctx)
  if err != nil { /* handle */ break }
  // decode JSON, process, write to orders.status
}
```

### 6.3) `notifications-api` (consumer → SSE/WebSocket)
- [ ] Init module: `go mod init .../notifications-api`
- [ ] Kafka reader on `orders.status` with group `notifications-api-cg`
- [ ] Maintain in‑memory map of clients subscribed by `orderId`
- [ ] SSE endpoint: `GET /events?orderId=<id>` streams matching status updates
- [ ] Broadcast status updates to all clients interested in the `orderId`
- [ ] CORS enabled for local dev

SSE handler shape:
```go
func sse(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "text/event-stream")
  w.Header().Set("Cache-Control", "no-cache")
  w.Header().Set("Connection", "keep-alive")
  // register client channel, write `data: {...}\n\n` on updates
}
```

---

### 6.4) `stock-service` (consumer + producer; optional SQLite + Ent)
- [ ] Init module: `go mod init .../stock-service`
- [ ] Kafka reader for `orders.created` with group `stock-service-cg`
- [ ] Maintain inventory store (either in-memory map or SQLite via Ent)
- [ ] For each order item, decrement stock and produce `inventory.updated` per item (key: `sku`)
- [ ] Optional HTTP endpoints for debugging:
  - [ ] `GET /stock` → returns current quantities by `sku`
  - [ ] `POST /seed` → seed inventory for demo

Minimal processing outline:
```go
type OrderItem struct { SKU string `json:"sku"`; Qty int `json:"qty"` }
type OrderCreated struct { OrderID string `json:"orderId"`; Items []OrderItem `json:"items"` }

for {
  m, err := r.ReadMessage(ctx)
  if err != nil { /* handle */ break }
  var oc OrderCreated
  if err := json.Unmarshal(m.Value, &oc); err != nil { continue }
  for _, it := range oc.Items {
    newQty := inventory.Decrement(it.SKU, it.Qty) // in-memory or Ent-backed
    emitInventoryUpdated(it.SKU, -it.Qty, newQty, oc.OrderID)
  }
}
```

Notes
- Keep env minimal; default topics and brokers if not set
- If using Ent + SQLite, reuse the pattern from section 11 to model `Inventory` with fields: `sku` (unique), `quantity` (int)

---

## 7) Frontend (React + Vite) — minimal UI

- [ ] Scaffold app in `client/web`:
```bash
npm create vite@latest web -- --template react-ts
cd web && npm i && npm i axios
```
- [ ] Form to create order (POST to `orders-api`)
- [ ] On success, display `orderId` and open SSE connection to `notifications-api` for live status
- [ ] Show a timeline or simple list of statuses
- [ ] `.env` with API URLs (Vite `import.meta.env`)
  - Keep minimal: default to `http://localhost:8081` (orders-api) and `http://localhost:8083` (notifications-api) if env is absent
  - Optional: add a simple `Stock` page that calls `stock-service` `GET /stock` to display current quantities

Frontend flow:
1. POST `/orders` → receive `orderId`
2. Start `EventSource("/events?orderId=...")`
3. Append messages to UI as they arrive

---

## 8) Local development and run

- [ ] Start Kafka (ZooKeeper + Kafka): `docker compose up -d`
- [ ] In three terminals, run:
  - [ ] `services/orders-api`: `go run ./...` or `make dev`
  - [ ] `services/orders-processor`: `go run ./...`
  - [ ] `services/notifications-api`: `go run ./...`
  - [ ] `services/stock-service`: `go run ./...`
- [ ] Start frontend: `npm run dev` in `client/web`
- [ ] Create an order from UI → watch live status arrive
- [ ] Verify topics and messages in Kafka UI

---

## 9) End‑to‑end test checklist

- [ ] POST an order via curl:
```bash
curl -sS -X POST http://localhost:8081/orders \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u1","items":[{"sku":"S1","qty":2}],"total":25.5,"currency":"USD"}' | jq
```
- [ ] Confirm `orders.created` has a message in Kafka UI
- [ ] Confirm `orders-processor` logs consumption and produces `orders.status`
- [ ] Confirm `notifications-api` logs and forwards to SSE clients
- [ ] Confirm `stock-service` consumes `orders.created` and produces `inventory.updated` for each item
- [ ] Frontend view updates with status changes

---

## 10) Observability and reliability

- [ ] Structured logging in all services (requestId, orderId)
- [ ] Health endpoints `/healthz` and readiness `/readyz`
- [ ] Graceful shutdown on SIGTERM
- [ ] Metrics (optional): Prometheus counters for messages produced/consumed, processing latency
- [ ] Retries with backoff on producer failures; DLQ topic (optional) `orders.status.dlq`

---

## 11) Optional persistence with SQLite + Ent ORM (local only)

- [ ] Decide which service needs a DB (typical: `orders-api` for storing orders; `stock-service` for inventory)
- [ ] Add Ent to the chosen service:
```bash
go get entgo.io/ent/cmd/ent@latest
go run entgo.io/ent/cmd/ent new Order
```
- [ ] Define schema in `ent/schema/order.go` (fields: `order_id`, `user_id`, `total` (float), `currency` (string), `created_at` (time))
- [ ] Add SQLite driver: `go get github.com/mattn/go-sqlite3`
- [ ] Open DB on startup (default path `./orders.db`):
```go
client, err := ent.Open("sqlite3", "file:orders.db?_fk=1")
if err != nil { log.Fatal(err) }
defer client.Close()
ctx := context.Background()
if err := client.Schema.Create(ctx); err != nil { log.Fatal(err) }
```
- [ ] When `POST /orders` is called, insert into SQLite via Ent and still produce the Kafka event
- [ ] For `stock-service`, define `Inventory` schema and use Ent ops to decrement atomically (inside a transaction per order)
- [ ] Keep env minimal; allow override via `DB_DSN` (optional). Default to local file.

---

## 12) Production‑minded extensions (optional, great for blog “Part 2”)

- [ ] Move event schemas to Avro/Protobuf + Schema Registry
- [ ] Idempotent producer + transactional processing for exactly‑once where required
- [ ] Partitioning strategy: choose keying and partitions based on throughput and ordering guarantees
- [ ] Outbox pattern from DB → Kafka to avoid dual‑write issues
- [ ] Use k8s manifests and Helm to deploy the stack
- [ ] API Gateway + AuthN/AuthZ for services

---

## 13) Blog post outline (ready‑to‑expand)

- [ ] Hook: “From REST calls to real‑time streams: Kafka in a Go microservice”
- [ ] Primer: Kafka concepts with one diagram
- [ ] Architecture: Orders domain, topics, consumer groups
- [ ] Walkthrough: Spin up Kafka, send first event, watch on Kafka UI
- [ ] Code tour: `orders-api` producer, `orders-processor` consumer, `notifications-api` SSE
- [ ] Frontend demo: create an order and see live status
- [ ] Reliability notes: retries, DLQs, idempotency
- [ ] Closing: What to productionize next

---

## 14) Copy‑paste snippets and commands (starter)

- [ ] Env variables (example; all optional with defaults):
```bash
export KAFKA_BROKERS=localhost:9093
export ORDERS_TOPIC=orders.created
export STATUS_TOPIC=orders.status
# export INVENTORY_TOPIC=inventory.updated
# export DB_DSN="file:orders.db?_fk=1"  # if using SQLite + Ent
```

- [ ] Minimal HTTP server (Go, net/http) skeleton to adapt:
```go
http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
  w.WriteHeader(http.StatusOK)
})
log.Fatal(http.ListenAndServe(":8081", nil))
```

---

## 15) Success criteria (definition of done)

- [ ] `docker-compose.yml` runs Kafka and Kafka UI locally
- [ ] `orders-api` produces events to `orders.created`
- [ ] `orders-processor` consumes `orders.created` and produces `orders.status`
- [ ] `notifications-api` consumes `orders.status` and streams to clients via SSE
- [ ] `stock-service` consumes `orders.created` and emits `inventory.updated`; optional HTTP `GET /stock` works
- [ ] Frontend can create an order and display status transitions
- [ ] README includes quick start and screenshots/gifs

---

## 16) Timeboxes (suggested)

- [ ] Infra + Compose: 30–45 min
- [ ] `orders-api`: 45–60 min
- [ ] `orders-processor`: 45–60 min
- [ ] `notifications-api` (SSE): 45–60 min
- [ ] `stock-service`: 45–60 min (in-memory) or 60–90 min (SQLite + Ent)
- [ ] Frontend: 45–60 min
- [ ] Polish + README + Blog screenshots: 45–90 min

---

## 17) Troubleshooting quick hits

- [ ] Cannot connect to broker from host: check advertised listeners (external should be `PLAINTEXT_EXTERNAL://localhost:9093`)
- [ ] No messages visible: ensure correct topic name and partitioning; check Kafka UI
- [ ] Consumer not receiving: verify group id, topic, and that offsets are not at end; try `auto.offset.reset=earliest`
- [ ] SSE not streaming: ensure correct headers and client keeps connection open; check CORS
- [ ] Port conflicts: change service ports in Compose or local servers

---

## References (for design/code inspiration)

- Medium: `Kafka on the microservice architecture` (andhikayusup)
- Medium: `Real-time payment microservices with Apache Kafka, Spring Boot and Redis Streams` (wijayabahu)
- Dev.to: `Connecting Spring Boot microservices with Kafka` (ahmadtheswe)
- YouTube: `Kafka for Beginners` (see `sources/kafka_tutorials_for_beginners.md`)
