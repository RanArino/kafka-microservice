package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

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
	return kafka.NewReader(kafka.ReaderConfig{Brokers: brokers, GroupID: group, Topic: topic, MinBytes: 1, MaxBytes: 10e6})
}

var (
	mu   sync.RWMutex
	subs = map[string][]chan []byte{}
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

	go func() {
		r := newReader(brokers, topic, group)
		defer r.Close()
		ctx := context.Background()
		for {
			m, err := r.ReadMessage(ctx)
			if err != nil {
				log.Printf("read error: %v", err)
				return
			}
			broadcast(m.Value)
		}
	}()

	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
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

	log.Printf("notifications-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
