# Pulse Messenger

Decentralized P2P messenger with E2E encryption, built on **Rust + React + TypeScript** via Tauri v2.

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
| Storage | sled (embedded DB) |
| Calls | WebRTC |
| i18n | i18next (Russian, English) |
| Build | Vite |

## Features

- **1:1 Chat** — real-time messaging via libp2p P2P network
- **Group Chats** — roles (owner/admin/member), invite links, group settings
- **E2E Encryption** — X25519 key exchange, Ed25519 message signatures, ChaCha20-Poly1305 encryption
- **File Transfer** — chunked file transfer over P2P protocol with progress tracking
- **Voice Messages** — MediaRecorder-based recording, WebM/Opus format
- **Audio/Video Calls** — WebRTC signaling via P2P, STUN-based NAT traversal
- **Message Search** — full-text search across all chats
- **Contacts** — add, remove, block/unblock contacts
- **Themes** — 5 color themes (Telegram, Green, Purple, Orange, Red) with dark mode
- **i18n** — Russian and English languages
- **Notifications** — native OS notifications via Tauri plugin

## Project Structure

```
pulse-tauri/
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── lib.rs                  # Tauri commands (50+ commands)
│   │   ├── main.rs                 # Desktop entry point
│   │   ├── models/
│   │   │   └── mod.rs              # Data models (User, Message, Chat, Group, etc.)
│   │   └── services/
│   │       ├── mod.rs
│   │       ├── storage.rs          # Persistent storage (sled)
│   │       ├── encryption.rs       # Ed25519 signing, ChaCha20-Poly1305
│   │       ├── key_exchange.rs     # X25519 Diffie-Hellman
│   │       ├── network.rs          # libp2p P2P networking
│   │       ├── protocol.rs         # Wire protocol (JSON messages)
│   │       ├── file_transfer.rs    # Chunked file transfer
│   │       └── group_chat.rs       # Group management (sled-backed)
│   ├── capabilities/
│   │   └── default.json            # Tauri v2 plugin permissions
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                            # React frontend
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatList.tsx        # Chat list with search
│   │   │   ├── ChatView.tsx        # Message view + input
│   │   │   └── FileMessage.tsx     # File/image/video/voice renderer
│   │   ├── call/
│   │   │   ├── IncomingCallDialog.tsx
│   │   │   ├── OutgoingCallView.tsx
│   │   │   └── ActiveCallView.tsx
│   │   ├── group/
│   │   │   ├── CreateGroupDialog.tsx
│   │   │   └── GroupSettingsPanel.tsx
│   │   ├── search/
│   │   │   └── SearchPanel.tsx
│   │   ├── ConnectionStatus.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Sidebar.tsx
│   │   └── ThemeProvider.tsx
│   ├── pages/
│   │   ├── ContactsPage.tsx
│   │   ├── ProfileSetupPage.tsx
│   │   └── SettingsPage.tsx
│   ├── services/
│   │   ├── notifications.ts
│   │   └── webrtc.ts
│   ├── stores/                     # Zustand state management
│   │   ├── callStore.ts
│   │   ├── chatStore.ts
│   │   ├── contactsStore.ts
│   │   ├── fileStore.ts
│   │   ├── groupStore.ts
│   │   ├── networkStore.ts
│   │   ├── searchStore.ts
│   │   ├── settingsStore.ts
│   │   └── userStore.ts
│   ├── locales/
│   │   ├── en.json
│   │   └── ru.json
│   ├── types/
│   │   └── index.ts
│   ├── styles/
│   │   └── globals.css
│   ├── i18n.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## Quick Start

### Prerequisites

- Node.js 18+
- Rust (via [rustup](https://rustup.rs/))
- Platform-specific Tauri v2 dependencies ([see docs](https://v2.tauri.app/start/prerequisites/))

### Install & Run

```bash
# Install dependencies
npm install

# Run in dev mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Build Targets

```bash
# ARM64 Linux (AppImage)
npm run tauri build -- --target aarch64-unknown-linux-gnu

# x86-64 Linux
npm run tauri build -- --target x86_64-unknown-linux-gnu

# Android APK (requires Android SDK + NDK)
npm run tauri android init
npm run tauri android build
```

## Roadmap

- [x] Phase 1 — MVP: project setup, contacts, basic 1:1 chat
- [x] Phase 2 — E2E encryption: X25519 key exchange, AES-256-GCM, Ed25519 signatures
- [x] Phase 3 — Group chats: roles, permissions, invite links, settings panel
- [x] Phase 4 — Advanced features: replies, file transfer, voice messages, WebRTC calls, search
- [x] Phase 5 — Production polish: capabilities, call signaling, i18n, themes, group persistence, signature verification
- [x] Phase 6A — Final polish: error boundary, thumbnail generation, dead code cleanup, notification cleanup
- [ ] Phase 6B — ARM64 Linux AppImage build
- [ ] Phase 6C — Android porting (SQLite migration, mobile UI, APK build)

## Architecture

Pulse uses a **P2P architecture** with no central server:

1. **Discovery** — mDNS for LAN peer discovery
2. **Transport** — TCP with Noise protocol encryption and Yamux multiplexing
3. **Messages** — signed with sender's Ed25519 key, verified on receipt
4. **Encryption** — X25519 key exchange + ChaCha20-Poly1305 for E2E message encryption
5. **Storage** — all data persisted locally in sled embedded database
6. **Calls** — WebRTC signaling exchanged via P2P protocol, STUN for NAT traversal

## License

MIT
