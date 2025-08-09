package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

type OrderItem struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}
type OrderCreated struct {
	OrderID string      `json:"orderId"`
	Items   []OrderItem `json:"items"`
}
type InventoryUpdated struct {
	SKU         string `json:"sku"`
	Delta       int    `json:"delta"`
	NewQuantity int    `json:"newQuantity"`
	OrderID     string `json:"orderId"`
	UpdatedAt   string `json:"updatedAt"`
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
func newReader(brokers []string, topic, group string) *kafka.Reader {
	return kafka.NewReader(kafka.ReaderConfig{Brokers: brokers, GroupID: group, Topic: topic, MinBytes: 1, MaxBytes: 10e6})
}
func newWriter(brokers []string, topic string) *kafka.Writer {
	return &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: topic, Balancer: &kafka.Hash{}}
}

var (
	mu        sync.RWMutex
	inventory = map[string]int{"S1": 10, "S2": 5}
)

func decrement(sku string, qty int) int {
	mu.Lock()
	defer mu.Unlock()
	inventory[sku] = inventory[sku] - qty
	return inventory[sku]
}

func main() {
	addr := getenv("HTTP_ADDR", ":8084")
	brokers := strings.Split(getenv("KAFKA_BROKERS", "localhost:9093"), ",")
	inTopic := getenv("ORDERS_TOPIC", "orders.created")
	outTopic := getenv("INVENTORY_TOPIC", "inventory.updated")
	group := getenv("GROUP_ID", "stock-service-cg")

    http.HandleFunc("/stock", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
		mu.RLock()
		defer mu.RUnlock()
		_ = json.NewEncoder(w).Encode(inventory)
	})
    http.HandleFunc("/seed", func(w http.ResponseWriter, r *http.Request) {
        // CORS for local dev
        if r.Method == http.MethodOptions {
            w.Header().Set("Access-Control-Allow-Origin", "*")
            w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
            w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
            w.WriteHeader(http.StatusNoContent)
            return
        }
        w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var in map[string]int
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		mu.Lock()
		for k, v := range in {
			inventory[k] = v
		}
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})

	w := newWriter(brokers, outTopic)
	defer w.Close()
	go func() {
		r := newReader(brokers, inTopic, group)
		defer r.Close()
		ctx := context.Background()
		log.Printf("stock-service consuming %s, producing %s", inTopic, outTopic)
		for {
			m, err := r.ReadMessage(ctx)
			if err != nil {
				log.Printf("read error: %v", err)
				return
			}
			var oc OrderCreated
			if err := json.Unmarshal(m.Value, &oc); err != nil {
				log.Printf("json error: %v", err)
				continue
			}
			for _, it := range oc.Items {
				newQty := decrement(it.SKU, it.Qty)
				upd := InventoryUpdated{SKU: it.SKU, Delta: -it.Qty, NewQuantity: newQty, OrderID: oc.OrderID, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
				payload, _ := json.Marshal(upd)
				if err := w.WriteMessages(ctx, kafka.Message{Key: []byte(it.SKU), Value: payload}); err != nil {
					log.Printf("write error: %v", err)
				}
			}
		}
	}()

	log.Printf("stock-service listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
