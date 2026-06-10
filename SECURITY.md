# Security

## Cryptographic architecture

| Purpose | Primitive | Where |
|---------|-----------|-------|
| Identity / message signing | Ed25519 (`ed25519-dalek`) | `services/encryption.rs` |
| Key agreement | X25519 ECDH (`x25519-dalek`) | `services/key_exchange.rs` |
| Key derivation | HKDF-SHA256 | `services/key_exchange.rs` |
| Message encryption | ChaCha20-Poly1305 (AEAD, random 96-bit nonce per message) | `services/encryption.rs` |
| Transport encryption | Noise protocol (libp2p) | `services/network.rs` |

### Key lifecycle

- An Ed25519 identity key and an X25519 static key are generated on first launch.
- Keys are stored in the **OS keyring** (Secret Service on Linux, Keystore on Android); a file copy (`identity.key`, `x25519.key`, mode `0600`) exists as fallback for systems without a keyring and is migrated into the keyring when one becomes available.
- Per-chat encryption keys are derived via X25519 ECDH with the peer's public key followed by HKDF-SHA256 with a chat-specific info string.

### Message flow

1. Outgoing messages are signed with the sender's Ed25519 key.
2. The payload is encrypted with ChaCha20-Poly1305 under the derived chat key; the random nonce is prepended to the ciphertext.
3. The libp2p transport adds Noise encryption between peers.
4. On receipt, the signature is verified against the sender's known public key; messages with invalid signatures are logged and rejected.

## Known limitations

- No forward secrecy yet: chat keys are static per peer pair (no ratcheting). A Double-Ratchet-style upgrade is on the roadmap.
- Replay protection relies on message IDs and timestamps rather than a dedicated nonce ledger.
- Group messages are encrypted per-recipient with pairwise keys; there is no group key agreement protocol.

## Reporting a vulnerability

Please report vulnerabilities privately by email to **maksimka.osipov.75@gmail.com** rather than opening a public issue. Include reproduction steps and affected versions. You can expect an acknowledgement within a week.

## Security update policy

Security fixes are released as patch versions and noted in the release changelog. Always run the latest release.
