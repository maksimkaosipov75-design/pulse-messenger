# Changelog

## v1.0.0 — 2026-06-10

First production release for x86-64 Linux (AppImage + deb).

### Features
- 1:1 P2P chats over libp2p (TCP, mDNS discovery, Noise transport encryption)
- End-to-end encryption: X25519 key exchange + HKDF-SHA256, ChaCha20-Poly1305, Ed25519 message signatures
- Group chats with roles (owner/admin/member) and invite links
- Chunked P2P file transfer with progress, voice messages, WebRTC audio/video calls
- Full-text message search (SQLite FTS5)
- Offline outbox: messages queued while a peer is unreachable are sent automatically on reconnect
- Auto-updates from GitHub Releases (signed with minisign)
- Russian and English UI, 5 themes with dark mode

### Security
- Private keys stored in the OS keyring (Secret Service / Android Keystore) with 0600 file fallback
- Incoming messages: signature verification, sender key pinning against known contacts, replay protection (timestamp freshness + duplicate ID rejection)

### Fixed
- Message search was broken on fresh installs (FTS index was never built) and errored on every query (nonexistent `chats.name` column)
- `schema_version` table no longer accumulates a duplicate row per launch
- Deleting a chat with active group invites no longer fails
- Text messages are now actually delivered over the network (previously only saved locally)
