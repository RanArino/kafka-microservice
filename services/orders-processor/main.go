package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
)

type OrderItem struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}
type OrderCreated struct {
	OrderID string      `json:"orderId"`
	UserID  string      `json:"userId"`
	Items   []OrderItem `json:"items"`
	Total   float64     `json:"total"`
}
type OrderStatus struct {
	OrderID   string `json:"orderId"`
	Status    string `json:"status"`
	Reason    string `json:"reason,omitempty"`
	UpdatedAt string `json:"updatedAt"`
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

func main() {
	brokers := strings.Split(getenv("KAFKA_BROKERS", "localhost:9093"), ",")
	inTopic := getenv("ORDERS_TOPIC", "orders.created")
	outTopic := getenv("STATUS_TOPIC", "orders.status")
	group := getenv("GROUP_ID", "orders-processor-cg")

	r := newReader(brokers, inTopic, group)
	defer r.Close()
	w := newWriter(brokers, outTopic)
	defer w.Close()

	ctx := context.Background()
	log.Printf("orders-processor consuming %s, producing %s", inTopic, outTopic)
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
		time.Sleep(300 * time.Millisecond)
		status := OrderStatus{OrderID: oc.OrderID, Status: "PAID", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
		payload, _ := json.Marshal(status)
		if err := w.WriteMessages(ctx, kafka.Message{Key: []byte(oc.OrderID), Value: payload}); err != nil {
			log.Printf("write error: %v", err)
		}
	}
}
