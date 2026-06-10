use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "com.pulse.messenger";
const KEYRING_IDENTITY_KEY: &str = "identity-ed25519";

pub struct EncryptionService {
    signing_key: Mutex<SigningKey>,
    verifying_key: VerifyingKey,
}

impl EncryptionService {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

        let signing_key = Self::load_or_generate_key(&data_dir)?;
        let verifying_key = signing_key.verifying_key();

        Ok(Self {
            signing_key: Mutex::new(signing_key),
            verifying_key,
        })
    }

    fn load_or_generate_key(data_dir: &Path) -> Result<SigningKey, String> {
        // Try OS keyring first
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_IDENTITY_KEY) {
            if let Ok(hex_key) = entry.get_password() {
                if let Ok(bytes) = hex::decode(&hex_key) {
                    if bytes.len() == 32 {
                        let arr: [u8; 32] = bytes.try_into().map_err(|_| "Invalid key length")?;
                        return Ok(SigningKey::from_bytes(&arr));
                    }
                }
            }
        }

        // Fall back to file-based storage
        let key_path = data_dir.join("identity.key");
        if key_path.exists() {
            let bytes = std::fs::read(&key_path).map_err(|e| e.to_string())?;
            if bytes.len() == 32 {
                let arr: [u8; 32] = bytes.try_into().map_err(|_| "Invalid key length")?;
                let key = SigningKey::from_bytes(&arr);
                // Migrate to keyring if available
                Self::save_to_keyring(&key);
                return Ok(key);
            }
        }

        // Generate new key
        let key = SigningKey::generate(&mut OsRng);
        Self::save_key(&key, data_dir)?;
        Ok(key)
    }

    fn save_key(key: &SigningKey, data_dir: &Path) -> Result<(), String> {
        // Save to keyring
        Self::save_to_keyring(key);
        // Also save to file as backup
        let key_path = data_dir.join("identity.key");
        std::fs::write(&key_path, key.to_bytes()).map_err(|e| e.to_string())?;
        // Restrict file permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }

    fn save_to_keyring(key: &SigningKey) {
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_IDENTITY_KEY) {
            let hex_key = hex::encode(key.to_bytes());
            let _ = entry.set_password(&hex_key);
        }
    }

    /// Test-only constructor that bypasses the OS keyring and key files
    #[cfg(test)]
    pub fn from_signing_key(signing_key: SigningKey) -> Self {
        let verifying_key = signing_key.verifying_key();
        Self {
            signing_key: Mutex::new(signing_key),
            verifying_key,
        }
    }

    pub fn get_public_key(&self) -> Vec<u8> {
        self.verifying_key.to_bytes().to_vec()
    }

    pub fn get_public_key_hex(&self) -> String {
        hex::encode(self.verifying_key.to_bytes())
    }

    pub fn sign_message(&self, message: &[u8]) -> Result<Vec<u8>, String> {
        let key = self.signing_key.lock().map_err(|e| e.to_string())?;
        Ok(key.sign(message).to_bytes().to_vec())
    }

    pub fn verify_signature(
        &self,
        message: &[u8],
        signature: &[u8],
        public_key: &[u8],
    ) -> Result<bool, String> {
        let verifying_key =
            VerifyingKey::from_bytes(public_key.try_into().map_err(|_| "Invalid key length")?)
                .map_err(|e| e.to_string())?;
        let sig_arr: [u8; 64] = signature
            .try_into()
            .map_err(|_| "Invalid signature length")?;
        let signature = Signature::from_bytes(&sig_arr);
        Ok(verifying_key.verify(message, &signature).is_ok())
    }

    pub fn encrypt_message(&self, plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
        let cipher_key = Key::from_slice(key);
        let cipher = ChaCha20Poly1305::new(cipher_key);
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| e.to_string())?;
        // Prepend nonce to ciphertext so we can extract it during decryption
        let mut result = nonce_bytes.to_vec();
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    pub fn decrypt_message(&self, data: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
        if data.len() < 12 {
            return Err("Invalid ciphertext: too short".to_string());
        }
        let (nonce_bytes, ciphertext) = data.split_at(12);
        let cipher_key = Key::from_slice(key);
        let cipher = ChaCha20Poly1305::new(cipher_key);
        let nonce = Nonce::from_slice(nonce_bytes);
        cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> EncryptionService {
        EncryptionService::from_signing_key(SigningKey::generate(&mut OsRng))
    }

    #[test]
    fn sign_and_verify_roundtrip() {
        let svc = service();
        let msg = b"hello pulse";
        let sig = svc.sign_message(msg).unwrap();
        assert!(svc
            .verify_signature(msg, &sig, &svc.get_public_key())
            .unwrap());
    }

    #[test]
    fn verify_rejects_tampered_message() {
        let svc = service();
        let sig = svc.sign_message(b"original").unwrap();
        assert!(!svc
            .verify_signature(b"tampered", &sig, &svc.get_public_key())
            .unwrap());
    }

    #[test]
    fn verify_rejects_wrong_public_key() {
        let svc = service();
        let other = service();
        let msg = b"hello";
        let sig = svc.sign_message(msg).unwrap();
        assert!(!svc
            .verify_signature(msg, &sig, &other.get_public_key())
            .unwrap());
    }

    #[test]
    fn verify_rejects_malformed_inputs() {
        let svc = service();
        let sig = svc.sign_message(b"x").unwrap();
        assert!(svc
            .verify_signature(b"x", &sig[..10], &svc.get_public_key())
            .is_err());
        assert!(svc.verify_signature(b"x", &sig, &[0u8; 5]).is_err());
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let svc = service();
        let key = [7u8; 32];
        let plaintext = b"secret message \xf0\x9f\x94\x92";
        let ciphertext = svc.encrypt_message(plaintext, &key).unwrap();
        assert_ne!(&ciphertext[12..], plaintext.as_slice());
        let decrypted = svc.decrypt_message(&ciphertext, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_fails_with_wrong_key() {
        let svc = service();
        let ciphertext = svc.encrypt_message(b"data", &[1u8; 32]).unwrap();
        assert!(svc.decrypt_message(&ciphertext, &[2u8; 32]).is_err());
    }

    #[test]
    fn decrypt_fails_on_tampered_ciphertext() {
        let svc = service();
        let key = [3u8; 32];
        let mut ciphertext = svc.encrypt_message(b"data", &key).unwrap();
        let last = ciphertext.len() - 1;
        ciphertext[last] ^= 0xff;
        assert!(svc.decrypt_message(&ciphertext, &key).is_err());
    }

    #[test]
    fn decrypt_rejects_too_short_input() {
        let svc = service();
        assert!(svc.decrypt_message(&[0u8; 11], &[0u8; 32]).is_err());
    }

    #[test]
    fn encryption_uses_unique_nonces() {
        let svc = service();
        let key = [9u8; 32];
        let a = svc.encrypt_message(b"same plaintext", &key).unwrap();
        let b = svc.encrypt_message(b"same plaintext", &key).unwrap();
        assert_ne!(a[..12], b[..12], "nonces must differ between encryptions");
    }
}
