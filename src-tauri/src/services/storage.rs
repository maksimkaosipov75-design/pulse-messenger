use crate::models::*;
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

const DB_VERSION: i32 = 2;

pub struct StorageService {
    db: Mutex<Connection>,
}

impl StorageService {
    pub fn new(path: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        std::fs::create_dir_all(&path)?;
        let db = Connection::open(path.join("pulse.db"))?;

        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        // Schema versioning
        db.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
             INSERT OR IGNORE INTO schema_version (version) VALUES ({});",
            DB_VERSION
        ))?;

        let current_version: i32 = db
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
            .unwrap_or(1);

        // Base tables (v1)
        db.execute_batch("
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                data BLOB NOT NULL,
                PRIMARY KEY (chat_id, id)
            );
            CREATE TABLE IF NOT EXISTS contacts (
                user_id TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS peer_keys (
                peer_id TEXT PRIMARY KEY,
                x25519_pubkey TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS group_members (
                chat_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                data BLOB NOT NULL,
                PRIMARY KEY (chat_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS group_invites (
                code TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
        ")?;

        // Migration v1 -> v2: add content_text column + FTS5 index
        if current_version < 2 {
            // Add content_text column if missing
            let has_column: bool = db
                .prepare("SELECT content_text FROM messages LIMIT 0")
                .is_ok();
            if !has_column {
                let _ = db.execute_batch("ALTER TABLE messages ADD COLUMN content_text TEXT;");
                // Backfill existing messages
                let mut stmt = db.prepare("SELECT id, chat_id, data FROM messages")?;
                let rows: Vec<(String, String, Vec<u8>)> = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Vec<u8>>(2)?,
                        ))
                    })?
                    .filter_map(|r| r.ok())
                    .collect();
                for (id, chat_id, data) in rows {
                    if let Ok(msg) = bincode::deserialize::<Message>(&data) {
                        if let Some(ref content) = msg.content {
                            let _ = db.execute(
                                "UPDATE messages SET content_text = ?1 WHERE chat_id = ?2 AND id = ?3",
                                params![content, chat_id, id],
                            );
                        }
                    }
                }
            }

            // Create FTS5 virtual table
            let _ = db.execute_batch("
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    content_text,
                    content='messages',
                    content_rowid='rowid',
                    tokenize='unicode61'
                );
            ");

            // Triggers to keep FTS in sync
            let _ = db.execute_batch("
                CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, content_text) VALUES (new.rowid, new.content_text);
                END;
                CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content_text) VALUES ('delete', old.rowid, old.content_text);
                END;
                CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content_text) VALUES ('delete', old.rowid, old.content_text);
                    INSERT INTO messages_fts(rowid, content_text) VALUES (new.rowid, new.content_text);
                END;
            ");

            // Populate FTS from existing data
            let _ = db.execute_batch(
                "INSERT INTO messages_fts(rowid, content_text)
                 SELECT rowid, content_text FROM messages WHERE content_text IS NOT NULL;"
            );

            db.execute("UPDATE schema_version SET version = 2", [])?;
        }

        Ok(Self {
            db: Mutex::new(db),
        })
    }

    // === User Profile ===

    pub fn get_user_profile(&self) -> Result<Option<User>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM users WHERE id = 'me'").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map([], |row| row.get::<_, Vec<u8>>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_user_profile(&self, user: &User) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(user).map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO users (id, data) VALUES ('me', ?1)", params![data])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Chats ===

    pub fn get_chats(&self) -> Result<Vec<Chat>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM chats ORDER BY rowid DESC").map_err(|e| e.to_string())?;
        let chats = stmt.query_map([], |row| {
            let data: Vec<u8> = row.get(0)?;
            Ok(data)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok().and_then(|d| bincode::deserialize::<Chat>(&d).ok()))
        .collect();
        Ok(chats)
    }

    pub fn get_chat(&self, chat_id: &str) -> Result<Option<Chat>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM chats WHERE id = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![chat_id], |row| row.get::<_, Vec<u8>>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_chat(&self, chat: &Chat) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(chat).map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO chats (id, data) VALUES (?1, ?2)", params![chat.id, data])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_chat(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM chats WHERE id = ?1", params![chat_id]).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id]).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM group_members WHERE chat_id = ?1", params![chat_id]).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM group_invites WHERE json_extract(data, '$.chatId') = ?1", params![chat_id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Messages ===

    pub fn get_messages(
        &self,
        chat_id: &str,
        limit: usize,
        before_timestamp: Option<&str>,
    ) -> Result<Vec<Message>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let (query, query_params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(before) = before_timestamp {
            ("SELECT data FROM messages WHERE chat_id = ?1 AND timestamp < ?2 ORDER BY timestamp DESC LIMIT ?3",
             vec![Box::new(chat_id.to_string()), Box::new(before.to_string()), Box::new(limit as i64)])
        } else {
            ("SELECT data FROM messages WHERE chat_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
             vec![Box::new(chat_id.to_string()), Box::new(limit as i64)])
        };

        let mut stmt = db.prepare(query).map_err(|e| e.to_string())?;
        let params_ref: Vec<&dyn rusqlite::types::ToSql> = query_params.iter().map(|p| p.as_ref()).collect();
        let messages = stmt.query_map(params_ref.as_slice(), |row| {
            let data: Vec<u8> = row.get(0)?;
            Ok(data)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok().and_then(|d| bincode::deserialize::<Message>(&d).ok()))
        .collect();
        Ok(messages)
    }

    pub fn save_message(&self, message: &Message) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(message).map_err(|e| e.to_string())?;
        let ts = message.timestamp.to_rfc3339();
        let content_text = message.content.as_deref();
        db.execute(
            "INSERT OR REPLACE INTO messages (id, chat_id, timestamp, data, content_text) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![message.id, message.chat_id, ts, data, content_text],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_message(&self, chat_id: &str, message_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM messages WHERE chat_id = ?1 AND id = ?2", params![chat_id, message_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search_messages(&self, query: &str, limit: usize) -> Result<Vec<(Message, String)>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let fts_query = query.split_whitespace().collect::<Vec<_>>().join(" OR ");

        let mut stmt = db.prepare(
            "SELECT m.data, COALESCE(c.name, m.chat_id) as chat_name \
             FROM messages_fts fts \
             JOIN messages m ON m.rowid = fts.rowid \
             LEFT JOIN chats c ON c.id = m.chat_id \
             WHERE messages_fts MATCH ?1 \
             ORDER BY rank \
             LIMIT ?2"
        ).map_err(|e| e.to_string())?;

        let results: Vec<(Message, String)> = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                let data: Vec<u8> = row.get(0)?;
                let chat_name: String = row.get(1)?;
                Ok((data, chat_name))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|(data, chat_name)| {
                bincode::deserialize::<Message>(&data).ok().map(|m| (m, chat_name))
            })
            .collect();

        Ok(results)
    }

    // === Contacts ===

    pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM contacts ORDER BY rowid").map_err(|e| e.to_string())?;
        let contacts = stmt.query_map([], |row| {
            let data: Vec<u8> = row.get(0)?;
            Ok(data)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok().and_then(|d| bincode::deserialize::<Contact>(&d).ok()))
        .collect();
        Ok(contacts)
    }

    pub fn save_contact(&self, contact: &Contact) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(contact).map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO contacts (user_id, data) VALUES (?1, ?2)", params![contact.user.id, data])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_contact(&self, user_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM contacts WHERE user_id = ?1", params![user_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Settings ===

    pub fn get_settings(&self) -> Result<Settings, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM settings WHERE key = 'settings'").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map([], |row| row.get::<_, Vec<u8>>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).unwrap_or_default()),
            _ => Ok(Settings::default()),
        }
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(settings).map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO settings (key, data) VALUES ('settings', ?1)", params![data])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Peer Keys ===

    pub fn save_peer_key(&self, peer_id: &str, x25519_pubkey: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO peer_keys (peer_id, x25519_pubkey) VALUES (?1, ?2)", params![peer_id, x25519_pubkey])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_peer_key(&self, peer_id: &str) -> Result<Option<String>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT x25519_pubkey FROM peer_keys WHERE peer_id = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![peer_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(key)) => Ok(Some(key)),
            _ => Ok(None),
        }
    }

    // === Group Members ===

    pub fn get_group_members(&self, chat_id: &str) -> Result<Vec<GroupMember>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM group_members WHERE chat_id = ?1").map_err(|e| e.to_string())?;
        let members = stmt.query_map(params![chat_id], |row| {
            let data: Vec<u8> = row.get(0)?;
            Ok(data)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok().and_then(|d| bincode::deserialize::<GroupMember>(&d).ok()))
        .collect();
        Ok(members)
    }

    pub fn save_group_member(&self, chat_id: &str, member: &GroupMember) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(member).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO group_members (chat_id, user_id, data) VALUES (?1, ?2, ?3)",
            params![chat_id, member.user_id, data],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_member(&self, chat_id: &str, user_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM group_members WHERE chat_id = ?1 AND user_id = ?2", params![chat_id, user_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_members(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM group_members WHERE chat_id = ?1", params![chat_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Group Invites ===

    pub fn get_group_invite(&self, code: &str) -> Result<Option<GroupInvite>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT data FROM group_invites WHERE code = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![code], |row| row.get::<_, Vec<u8>>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_group_invite(&self, invite: &GroupInvite) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(invite).map_err(|e| e.to_string())?;
        db.execute("INSERT OR REPLACE INTO group_invites (code, data) VALUES (?1, ?2)", params![invite.code, data])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_invites_for_chat(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM group_invites WHERE json_extract(data, '$.chatId') = ?1", params![chat_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "telegram".to_string(),
            is_dark: true,
            language: "en".to_string(),
            notifications_enabled: true,
            sound_enabled: true,
        }
    }
}
