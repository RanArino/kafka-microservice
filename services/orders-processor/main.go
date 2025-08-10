package main

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
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
	return kafka.NewReader(kafka.ReaderConfig{
		Brokers:     brokers,
		GroupID:     group,
		Topic:       topic,
		MinBytes:    1,
		MaxBytes:    10e6,
		StartOffset: kafka.LastOffset,
	})
}
func newWriter(brokers []string, topic string) *kafka.Writer {
	return &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: topic, Balancer: &kafka.Hash{}}
}

func writeWithRetry(ctx context.Context, w *kafka.Writer, msg kafka.Message, maxRetries int) error {
	var err error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		err = w.WriteMessages(ctx, msg)
		if err == nil {
			return nil
		}

		if attempt < maxRetries {
			// Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1.6s
			backoff := time.Duration(100*math.Pow(2, float64(attempt))) * time.Millisecond
			log.Printf("write error (attempt %d/%d): %v, retrying in %v", attempt+1, maxRetries+1, err, backoff)

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				// Continue to next attempt
			}
		}
	}

	log.Printf("write failed after %d attempts: %v", maxRetries+1, err)
	return err
}

var (
	kafkaReady int64 // 0 = not ready, 1 = ready
)

func main() {
	brokers := strings.Split(getenv("KAFKA_BROKERS", "localhost:9093"), ",")
	inTopic := getenv("ORDERS_TOPIC", "orders.created")
	outTopic := getenv("STATUS_TOPIC", "orders.status")
	group := getenv("GROUP_ID", "orders-processor-cg")
	httpAddr := getenv("HTTP_ADDR", ":8082")

	r := newReader(brokers, inTopic, group)
	defer r.Close()
	w := newWriter(brokers, outTopic)
	defer w.Close()

	// Health and readiness endpoints
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	http.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt64(&kafkaReady) == 1 {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})

	// Start HTTP server for health checks
	srv := &http.Server{Addr: httpAddr}
	go func() {
		log.Printf("orders-processor health server listening on %s", httpAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("health server failed: %v", err)
		}
	}()

	// Create context that can be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Println("shutting down orders-processor...")
		cancel()

		// Shutdown HTTP server
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("health server forced to shutdown: %v", err)
		}
	}()

	log.Printf("orders-processor consuming %s, producing %s", inTopic, outTopic)

	// Mark as ready after successful initialization
	atomic.StoreInt64(&kafkaReady, 1)

	for {
		m, err := r.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Println("context cancelled, stopping consumer")
				break
			}
			log.Printf("read error: %v", err)
			continue
		}
		var oc OrderCreated
		if err := json.Unmarshal(m.Value, &oc); err != nil {
			log.Printf("json error: %v", err)
			continue
		}
		time.Sleep(300 * time.Millisecond)
		status := OrderStatus{OrderID: oc.OrderID, Status: "PAID", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
		payload, _ := json.Marshal(status)

		// Use retry logic with exponential backoff
		msg := kafka.Message{Key: []byte(oc.OrderID), Value: payload}
		if err := writeWithRetry(ctx, w, msg, 4); err != nil {
			log.Printf("failed to write status after retries: %v", err)
			// Continue processing other messages even if one fails
		}
	}

	log.Println("orders-processor shutdown complete")
}
