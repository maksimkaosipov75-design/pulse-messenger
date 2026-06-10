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
