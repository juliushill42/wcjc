# WCJC

**Build. Connect. Own the relationship.**

WCJC is a free, open professional network for builders, startups, companies and people who want direct relationships without pay-to-connect walls.

## What ships in this repository

- Next.js 15 / React 19 professional network UI
- Browser-generated cryptographic identities
- AES-GCM encrypted local signing key storage using PBKDF2-SHA256
- Nostr-signed public profiles, posts and connection lists
- Multi-relay publish/read for portability and resilience
- Public profile pages
- Live WCJC-tagged feed and local search
- Go relay indexer
- PostgreSQL 16 event archive
- Apache Kafka 3.7.0 event stream
- One-command `bootstrap.sh`
- GitHub Actions build verification
- SHA-256 source manifest generation

## Why the public alpha uses an open protocol

The public site should not require a paid API, a premium inbox, or a proprietary identity provider just to let two people connect. The browser signs the identity and posts; public relays transport them. The optional self-hosted indexer provides durable Postgres/Kafka infrastructure without making the public client depend on a single central service.

## Launch

```bash
./bootstrap.sh
npm run dev
```

Open `http://localhost:3000`.

## Self-hosted event infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
DATABASE_URL=postgres://wcjc:wcjc@localhost:5432/wcjc \
KAFKA_BROKERS=localhost:9092 \
./services/indexer/wcjc-indexer
```

## Vercel

The repository root includes `vercel.json`. The web app is in `apps/web` and has no required paid backend dependency for the public alpha.

## Security boundary

- Private identity keys are generated in the browser.
- The raw private key is never sent to WCJC.
- Local storage contains only AES-GCM encrypted key material.
- The password is not persisted.
- Public Nostr events are intentionally public.

For high-value identities, use a dedicated signer/client once WCJC adds NIP-07 / remote signer support.

## License

Copyright © 2026 Titan Universal AI LLC / Julius Cameron Hill. All rights reserved pending final open-blueprint license selection.
