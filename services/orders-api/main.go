package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

type OrderItem struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}

type CreateOrderRequest struct {
	UserID   string      `json:"userId"`
	Items    []OrderItem `json:"items"`
	Total    float64     `json:"total"`
	Currency string      `json:"currency"`
}

type OrderCreated struct {
	OrderID   string      `json:"orderId"`
	UserID    string      `json:"userId"`
	Items     []OrderItem `json:"items"`
	Total     float64     `json:"total"`
	Currency  string      `json:"currency"`
	CreatedAt string      `json:"createdAt"`
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func newWriter(brokers []string, topic string) *kafka.Writer {
	return &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: topic, Balancer: &kafka.Hash{}}
}

func main() {
	addr := getenv("HTTP_ADDR", ":8081")
	brokers := strings.Split(getenv("KAFKA_BROKERS", "localhost:9093"), ",")
	ordersTopic := getenv("ORDERS_TOPIC", "orders.created")

	writer := newWriter(brokers, ordersTopic)
	defer writer.Close()

	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

    http.HandleFunc("/orders", func(w http.ResponseWriter, r *http.Request) {
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
		var req CreateOrderRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid json"})
			return
		}
		orderID := uuid.NewString()
		evt := OrderCreated{OrderID: orderID, UserID: req.UserID, Items: req.Items, Total: req.Total, Currency: req.Currency, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
		payload, _ := json.Marshal(evt)
		if err := writer.WriteMessages(context.Background(), kafka.Message{Key: []byte(orderID), Value: payload}); err != nil {
			log.Printf("write error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "produce failed"})
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{"orderId": orderID})
	})

	log.Printf("orders-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
