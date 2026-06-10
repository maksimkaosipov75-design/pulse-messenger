use x25519_dalek::{PublicKey, StaticSecret};
use rand::rngs::OsRng;
use std::path::PathBuf;
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "com.pulse.messenger";
const KEYRING_X25519_KEY: &str = "x25519-static";

pub struct KeyExchangeService {
    static_secret: Mutex<StaticSecret>,
    public_key: PublicKey,
}

impl KeyExchangeService {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

        let static_secret = Self::load_or_generate_key(&data_dir)?;
        let public_key = PublicKey::from(&static_secret);

        Ok(Self {
            static_secret: Mutex::new(static_secret),
            public_key,
        })
    }

    fn load_or_generate_key(data_dir: &PathBuf) -> Result<StaticSecret, String> {
        // Try OS keyring first
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_X25519_KEY) {
            if let Ok(hex_key) = entry.get_password() {
                if let Ok(bytes) = hex::decode(&hex_key) {
                    if bytes.len() == 32 {
                        let arr: [u8; 32] = bytes.try_into().map_err(|_| "Invalid key length")?;
                        return Ok(StaticSecret::from(arr));
                    }
                }
            }
        }

        // Fall back to file-based storage
        let key_path = data_dir.join("x25519.key");
        if key_path.exists() {
            let bytes = std::fs::read(&key_path).map_err(|e| e.to_string())?;
            if bytes.len() == 32 {
                let arr: [u8; 32] = bytes.try_into().map_err(|_| "Invalid key length")?;
                let key = StaticSecret::from(arr);
                Self::save_to_keyring(&key);
                return Ok(key);
            }
        }

        // Generate new key
        let key = StaticSecret::random_from_rng(OsRng);
        Self::save_key(&key, data_dir)?;
        Ok(key)
    }

    fn save_key(key: &StaticSecret, data_dir: &PathBuf) -> Result<(), String> {
        Self::save_to_keyring(key);
        let key_path = data_dir.join("x25519.key");
        std::fs::write(&key_path, key.to_bytes()).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }

    fn save_to_keyring(key: &StaticSecret) {
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_X25519_KEY) {
            let hex_key = hex::encode(key.to_bytes());
            let _ = entry.set_password(&hex_key);
        }
    }

    /// Test-only constructor that bypasses the OS keyring and key files
    #[cfg(test)]
    pub fn from_secret(static_secret: StaticSecret) -> Self {
        let public_key = PublicKey::from(&static_secret);
        Self {
            static_secret: Mutex::new(static_secret),
            public_key,
        }
    }

    pub fn get_public_key(&self) -> [u8; 32] {
        self.public_key.to_bytes()
    }

    pub fn get_public_key_hex(&self) -> String {
        hex::encode(self.public_key.to_bytes())
    }

    pub fn compute_shared_secret(&self, peer_public_key_bytes: &[u8; 32]) -> [u8; 32] {
        let secret = self.static_secret.lock().unwrap_or_else(|e| e.into_inner());
        let peer_public_key = PublicKey::from(*peer_public_key_bytes);
        let shared_secret = secret.diffie_hellman(&peer_public_key);
        shared_secret.to_bytes()
    }

    pub fn derive_encryption_key(shared_secret: &[u8; 32], info: &[u8]) -> [u8; 32] {
        let hk = hkdf::Hkdf::<sha2::Sha256>::new(None, shared_secret);
        let mut key = [0u8; 32];
        // HKDF expand with 32-byte output from 32-byte secret cannot fail
        hk.expand(info, &mut key).expect("HKDF: info + key length is always valid");
        key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> KeyExchangeService {
        KeyExchangeService::from_secret(StaticSecret::random_from_rng(OsRng))
    }

    #[test]
    fn diffie_hellman_agreement() {
        let alice = service();
        let bob = service();
        let alice_shared = alice.compute_shared_secret(&bob.get_public_key());
        let bob_shared = bob.compute_shared_secret(&alice.get_public_key());
        assert_eq!(alice_shared, bob_shared);
        assert_ne!(alice_shared, [0u8; 32]);
    }

    #[test]
    fn different_peers_produce_different_secrets() {
        let alice = service();
        let bob = service();
        let carol = service();
        assert_ne!(
            alice.compute_shared_secret(&bob.get_public_key()),
            alice.compute_shared_secret(&carol.get_public_key())
        );
    }

    #[test]
    fn key_derivation_is_deterministic() {
        let secret = [42u8; 32];
        assert_eq!(
            KeyExchangeService::derive_encryption_key(&secret, b"chat-1"),
            KeyExchangeService::derive_encryption_key(&secret, b"chat-1")
        );
    }

    #[test]
    fn key_derivation_separates_contexts() {
        let secret = [42u8; 32];
        assert_ne!(
            KeyExchangeService::derive_encryption_key(&secret, b"chat-1"),
            KeyExchangeService::derive_encryption_key(&secret, b"chat-2")
        );
    }

    #[test]
    fn public_key_hex_is_64_chars() {
        let svc = service();
        assert_eq!(svc.get_public_key_hex().len(), 64);
    }
}
