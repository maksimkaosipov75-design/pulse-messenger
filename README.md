# Pulse Messenger

Decentralized P2P messenger with end-to-end encryption and no central server, built on **Rust + React + TypeScript** via Tauri v2.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop/Mobile | Tauri v2 |
| Backend | Rust |
| Frontend | React 18 + TypeScript |
| UI | Tailwind CSS |
| State | Zustand |
| P2P | libp2p (TCP, mDNS, Noise, Yamux) |
| E2E Encryption | X25519 + Ed25519 + ChaCha20-Poly1305 |
| Storage | SQLite (rusqlite, FTS5 full-text search) |
| Key Storage | OS keyring (Secret Service / Keystore) |
| Calls | WebRTC |
| i18n | i18next (Russian, English) |
| Build | Vite |

## Features

- **1:1 Chat** — real-time messaging via libp2p P2P network
- **Group Chats** — roles (owner/admin/member), invite links, group settings
- **E2E Encryption** — X25519 key exchange, Ed25519 message signatures, ChaCha20-Poly1305 encryption (see [SECURITY.md](SECURITY.md))
- **File Transfer** — chunked file transfer over P2P protocol with progress tracking
- **Voice Messages** — MediaRecorder-based recording, WebM/Opus format
- **Audio/Video Calls** — WebRTC signaling via P2P, STUN-based NAT traversal
- **Message Search** — SQLite FTS5 full-text search across all chats
- **Contacts** — add, remove, block/unblock contacts
- **Themes** — 5 color themes with dark mode
- **i18n** — Russian and English languages
- **Notifications** — native OS notifications via Tauri plugin

## Quick Start

### Prerequisites

- Node.js 20+
- Rust (via [rustup](https://rustup.rs/))
- Platform-specific Tauri v2 dependencies ([see docs](https://v2.tauri.app/start/prerequisites/)).
  On Debian/Ubuntu: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libdbus-1-dev`

### Install & Run

```bash
npm install        # install dependencies
npm run tauri dev  # run in dev mode
```

### Build for Linux

```bash
npx tauri build --bundles appimage,deb
```

Artifacts land in `src-tauri/target/release/bundle/`.

> **Arch Linux note:** prepend `NO_STRIP=true` (linuxdeploy's bundled `strip`
> cannot handle `.relr.dyn` sections in Arch system libraries).

### Connecting two peers

1. Run Pulse on two machines in the same LAN — mDNS discovers peers automatically.
2. Or connect manually: copy the **multiaddr** shown under *Listen* in the connection panel on one machine, then use *Connect to peer* on the other.
3. Add the peer as a contact and start chatting; the X25519 key exchange runs automatically on first contact.

## Project Structure

```
pulse-tauri/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands (50+ commands)
│   │   ├── models/         # Data models (User, Message, Chat, Group, …)
│   │   └── services/
│   │       ├── storage.rs       # SQLite persistence + FTS5 search + migrations
│   │       ├── encryption.rs    # Ed25519 signing, ChaCha20-Poly1305
│   │       ├── key_exchange.rs  # X25519 Diffie-Hellman + HKDF
│   │       ├── network.rs       # libp2p P2P networking
│   │       ├── protocol.rs      # Wire protocol (JSON messages)
│   │       ├── file_transfer.rs # Chunked file transfer
│   │       └── group_chat.rs    # Group roles and invites
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── components/         # Chat, calls, groups, search UI
│   ├── pages/              # Contacts, profile setup, settings
│   ├── stores/             # Zustand state (chat, network, calls, …)
│   ├── services/           # invoke wrapper with retry, WebRTC, notifications
│   └── locales/            # en.json, ru.json
└── .github/workflows/      # CI (fmt, clippy, tests, build) + release
```

## Architecture

Pulse uses a **P2P architecture** with no central server:

1. **Discovery** — mDNS for LAN peer discovery
2. **Transport** — TCP with Noise protocol encryption and Yamux multiplexing
3. **Messages** — signed with sender's Ed25519 key, verified on receipt
4. **Encryption** — X25519 key exchange + HKDF-SHA256 + ChaCha20-Poly1305 for E2E message encryption
5. **Storage** — all data persisted locally in SQLite; private keys live in the OS keyring
6. **Calls** — WebRTC signaling exchanged via P2P protocol, STUN for NAT traversal

## Development

```bash
# Rust checks (same as CI)
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib

# Frontend
npm run build   # tsc + vite build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) for the roadmap (next up: Android port).

## License

MIT
