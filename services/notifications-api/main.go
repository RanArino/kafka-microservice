package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"
)

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

var (
	mu         sync.RWMutex
	subs       = map[string][]chan []byte{}
	kafkaReady int64 // 0 = not ready, 1 = ready
)

func subscribe(orderID string) chan []byte {
	ch := make(chan []byte, 8)
	mu.Lock()
	subs[orderID] = append(subs[orderID], ch)
	mu.Unlock()
	return ch
}

func unsubscribe(orderID string, ch chan []byte) {
	mu.Lock()
	arr := subs[orderID]
	for i := range arr {
		if arr[i] == ch {
			arr = append(arr[:i], arr[i+1:]...)
			break
		}
	}
	subs[orderID] = arr
	mu.Unlock()
	close(ch)
}

func broadcast(status []byte) {
	var s OrderStatus
	if err := json.Unmarshal(status, &s); err != nil {
		return
	}
	mu.RLock()
	arr := subs[s.OrderID]
	for _, ch := range arr {
		select {
		case ch <- status:
		default:
		}
	}
	mu.RUnlock()
}

func main() {
	addr := getenv("HTTP_ADDR", ":8083")
	brokers := strings.Split(getenv("KAFKA_BROKERS", "localhost:9093"), ",")
	topic := getenv("STATUS_TOPIC", "orders.status")
	group := getenv("GROUP_ID", "notifications-api-cg")

	// Create context that can be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start Kafka consumer in goroutine
	go func() {
		r := newReader(brokers, topic, group)
		defer r.Close()
		for {
			m, err := r.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					log.Println("context cancelled, stopping kafka consumer")
					return
				}
				log.Printf("read error: %v", err)
				continue
			}
			broadcast(m.Value)
		}
	}()

	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	http.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt64(&kafkaReady) == 1 {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})
	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		// CORS for local dev
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		orderID := r.URL.Query().Get("orderId")
		if orderID == "" {
			http.Error(w, "orderId required", http.StatusBadRequest)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "stream unsupported", http.StatusInternalServerError)
			return
		}
		ch := subscribe(orderID)
		defer unsubscribe(orderID, ch)
		bw := bufio.NewWriter(w)
		for msg := range ch {
			fmt.Fprintf(bw, "data: %s\n\n", string(msg))
			bw.Flush()
			flusher.Flush()
		}
	})

	srv := &http.Server{Addr: addr}

	// Mark as ready after successful initialization
	atomic.StoreInt64(&kafkaReady, 1)

	// Start server in a goroutine
	go func() {
		log.Printf("notifications-api listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down notifications-api...")

	// Cancel context to stop Kafka consumer
	cancel()

	// Shutdown HTTP server with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server forced to shutdown: %v", err)
	}

	log.Println("notifications-api shutdown complete")
}
