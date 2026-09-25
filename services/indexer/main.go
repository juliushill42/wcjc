package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/IBM/sarama"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type nostrEvent struct {
	ID        string     `json:"id"`
	PubKey    string     `json:"pubkey"`
	CreatedAt int64      `json:"created_at"`
	Kind      int        `json:"kind"`
	Tags      [][]string `json:"tags"`
	Content   string     `json:"content"`
	Sig       string     `json:"sig"`
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pg, err := pgxpool.New(ctx, env("DATABASE_URL", "postgres://wcjc:wcjc@localhost:5432/wcjc"))
	if err != nil {
		log.Fatal(err)
	}
	defer pg.Close()

	if err := migrate(ctx, pg); err != nil {
		log.Fatal(err)
	}

	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	producer, err := sarama.NewSyncProducer(strings.Split(env("KAFKA_BROKERS", "localhost:9092"), ","), cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer producer.Close()

	relays := strings.Split(env("NOSTR_RELAYS", "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net"), ",")
	for _, relay := range relays {
		relay := strings.TrimSpace(relay)
		if relay == "" {
			continue
		}
		go consume(ctx, pg, producer, relay)
	}
	<-ctx.Done()
}

func migrate(ctx context.Context, pg *pgxpool.Pool) error {
	_, err := pg.Exec(ctx, `
    create table if not exists nostr_events (
      id text primary key,
      pubkey text not null,
      created_at bigint not null,
      kind integer not null,
      content text not null,
      tags jsonb not null,
      sig text not null,
      received_at timestamptz not null default now()
    );
    create index if not exists idx_nostr_events_pubkey on nostr_events(pubkey);
    create index if not exists idx_nostr_events_kind_created on nostr_events(kind, created_at desc);
  `)
	return err
}

func consume(ctx context.Context, pg *pgxpool.Pool, producer sarama.SyncProducer, relay string) {
	backoff := time.Second
	for ctx.Err() == nil {
		if err := consumeOnce(ctx, pg, producer, relay); err != nil {
			log.Printf("relay %s: %v", relay, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
			if backoff < 30*time.Second {
				backoff *= 2
			}
		}
	}
}

func consumeOnce(ctx context.Context, pg *pgxpool.Pool, producer sarama.SyncProducer, relay string) error {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, relay, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	subID := "wcjc-indexer"
	req := []any{"REQ", subID, map[string]any{"kinds": []int{0, 1, 3}, "#t": []string{"wcjc"}, "limit": 500}}
	if err := conn.WriteJSON(req); err != nil {
		return err
	}

	for {
		if err := conn.SetReadDeadline(time.Now().Add(90 * time.Second)); err != nil {
			return err
		}
		var raw []json.RawMessage
		if err := conn.ReadJSON(&raw); err != nil {
			return err
		}
		if len(raw) < 3 {
			continue
		}
		var typ string
		if json.Unmarshal(raw[0], &typ) != nil || typ != "EVENT" {
			continue
		}
		var event nostrEvent
		if err := json.Unmarshal(raw[2], &event); err != nil {
			continue
		}
		if event.ID == "" || event.PubKey == "" {
			continue
		}
		tags, _ := json.Marshal(event.Tags)
		if _, err := pg.Exec(ctx, `insert into nostr_events(id,pubkey,created_at,kind,content,tags,sig) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing`, event.ID, event.PubKey, event.CreatedAt, event.Kind, event.Content, tags, event.Sig); err != nil {
			log.Printf("postgres: %v", err)
		}
		body, _ := json.Marshal(event)
		_, _, err = producer.SendMessage(&sarama.ProducerMessage{Topic: "wcjc.nostr.events", Key: sarama.StringEncoder(event.PubKey), Value: sarama.ByteEncoder(body)})
		if err != nil {
			log.Printf("kafka: %v", err)
		}
	}
}
