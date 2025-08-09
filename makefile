
SHELL := /bin/bash

.PHONY: up down logs ps
up:
	docker compose up -d

ps:
	docker compose ps

logs:
	docker compose logs -f | cat

down:
	docker compose down -v

.PHONY: orders-api orders-processor notifications-api stock-service
orders-api:
	cd services/orders-api && go run ./...

orders-processor:
	cd services/orders-processor && go run ./...

notifications-api:
	cd services/notifications-api && go run ./...

stock-service:
	cd services/stock-service && go run ./...


