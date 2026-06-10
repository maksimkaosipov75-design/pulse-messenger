use crate::models::*;
use rusqlite::{params, Connection};
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

        // Schema versioning: single-row table. Databases created before
        // versioning existed have a `messages` table but no version row — treat
        // those as v1. A truly fresh database is v0 so every migration runs.
        let pre_versioning_install: bool = db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'messages'",
            [],
            |row| row.get::<_, i32>(0),
        )? > 0;

        // Rebuild the legacy keyless schema_version table (it accumulated one
        // duplicate row per launch), preserving the highest recorded version.
        let legacy_version: Option<i32> = db
            .prepare("SELECT MAX(version) FROM schema_version")
            .ok()
            .filter(|_| db.prepare("SELECT id FROM schema_version LIMIT 0").is_err())
            .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)).ok());
        if legacy_version.is_some() {
            db.execute_batch("DROP TABLE schema_version;")?;
        }

        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 0),
                version INTEGER NOT NULL
            );",
        )?;

        let current_version: i32 = db
            .query_row(
                "SELECT version FROM schema_version WHERE id = 0",
                [],
                |row| row.get(0),
            )
            .ok()
            .or(legacy_version)
            .unwrap_or(if pre_versioning_install { 1 } else { 0 });

        // Base tables (v1)
        db.execute_batch(
            "
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
        ",
        )?;

        // Migration v1 -> v2: add content_text column + FTS5 index.
        // Also runs (idempotently) when messages_fts is missing — repairs
        // databases created while a bug stamped v2 without building the index.
        let fts_exists: bool = db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'",
            [],
            |row| row.get::<_, i32>(0),
        )? > 0;
        if current_version < 2 || !fts_exists {
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
            let _ = db.execute_batch(
                "
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    content_text,
                    content='messages',
                    content_rowid='rowid',
                    tokenize='unicode61'
                );
            ",
            );

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
                 SELECT rowid, content_text FROM messages WHERE content_text IS NOT NULL;",
            );
        }

        db.execute(
            "INSERT INTO schema_version (id, version) VALUES (0, ?1)
             ON CONFLICT(id) DO UPDATE SET version = ?1",
            params![DB_VERSION],
        )?;

        Ok(Self { db: Mutex::new(db) })
    }

    // === User Profile ===

    pub fn get_user_profile(&self) -> Result<Option<User>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT data FROM users WHERE id = 'me'")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map([], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_user_profile(&self, user: &User) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(user).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO users (id, data) VALUES ('me', ?1)",
            params![data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Chats ===

    pub fn get_chats(&self) -> Result<Vec<Chat>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT data FROM chats ORDER BY rowid DESC")
            .map_err(|e| e.to_string())?;
        let chats = stmt
            .query_map([], |row| {
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
        let mut stmt = db
            .prepare("SELECT data FROM chats WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![chat_id], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_chat(&self, chat: &Chat) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(chat).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO chats (id, data) VALUES (?1, ?2)",
            params![chat.id, data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_chat(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM chats WHERE id = ?1", params![chat_id])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])
            .map_err(|e| e.to_string())?;
        db.execute(
            "DELETE FROM group_members WHERE chat_id = ?1",
            params![chat_id],
        )
        .map_err(|e| e.to_string())?;
        Self::delete_invites_for_chat(&db, chat_id)?;
        Ok(())
    }

    /// Invite rows are bincode blobs, so matching by chat happens in Rust
    fn delete_invites_for_chat(db: &Connection, chat_id: &str) -> Result<(), String> {
        let mut stmt = db
            .prepare("SELECT code, data FROM group_invites")
            .map_err(|e| e.to_string())?;
        let codes: Vec<String> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|(code, data)| {
                bincode::deserialize::<GroupInvite>(&data)
                    .ok()
                    .filter(|inv| inv.chat_id == chat_id)
                    .map(|_| code)
            })
            .collect();
        for code in codes {
            db.execute("DELETE FROM group_invites WHERE code = ?1", params![code])
                .map_err(|e| e.to_string())?;
        }
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
        let (query, query_params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(
            before,
        ) =
            before_timestamp
        {
            ("SELECT data FROM messages WHERE chat_id = ?1 AND timestamp < ?2 ORDER BY timestamp DESC LIMIT ?3",
             vec![Box::new(chat_id.to_string()), Box::new(before.to_string()), Box::new(limit as i64)])
        } else {
            (
                "SELECT data FROM messages WHERE chat_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
                vec![Box::new(chat_id.to_string()), Box::new(limit as i64)],
            )
        };

        let mut stmt = db.prepare(query).map_err(|e| e.to_string())?;
        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            query_params.iter().map(|p| p.as_ref()).collect();
        let messages = stmt
            .query_map(params_ref.as_slice(), |row| {
                let data: Vec<u8> = row.get(0)?;
                Ok(data)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| {
                r.ok()
                    .and_then(|d| bincode::deserialize::<Message>(&d).ok())
            })
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
        db.execute(
            "DELETE FROM messages WHERE chat_id = ?1 AND id = ?2",
            params![chat_id, message_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search_messages(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<(Message, String)>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let fts_query = query.split_whitespace().collect::<Vec<_>>().join(" OR ");

        // Chat rows are bincode blobs, so the name is resolved in Rust
        let mut stmt = db
            .prepare(
                "SELECT m.data, m.chat_id, c.data \
             FROM messages_fts fts \
             JOIN messages m ON m.rowid = fts.rowid \
             LEFT JOIN chats c ON c.id = m.chat_id \
             WHERE messages_fts MATCH ?1 \
             ORDER BY rank \
             LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let results: Vec<(Message, String)> = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                let data: Vec<u8> = row.get(0)?;
                let chat_id: String = row.get(1)?;
                let chat_data: Option<Vec<u8>> = row.get(2)?;
                Ok((data, chat_id, chat_data))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|(data, chat_id, chat_data)| {
                let chat_name = chat_data
                    .and_then(|d| bincode::deserialize::<Chat>(&d).ok())
                    .and_then(|c| c.name)
                    .unwrap_or(chat_id);
                bincode::deserialize::<Message>(&data)
                    .ok()
                    .map(|m| (m, chat_name))
            })
            .collect();

        Ok(results)
    }

    // === Contacts ===

    pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT data FROM contacts ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let contacts = stmt
            .query_map([], |row| {
                let data: Vec<u8> = row.get(0)?;
                Ok(data)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| {
                r.ok()
                    .and_then(|d| bincode::deserialize::<Contact>(&d).ok())
            })
            .collect();
        Ok(contacts)
    }

    pub fn save_contact(&self, contact: &Contact) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(contact).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO contacts (user_id, data) VALUES (?1, ?2)",
            params![contact.user.id, data],
        )
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
        let mut stmt = db
            .prepare("SELECT data FROM settings WHERE key = 'settings'")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map([], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).unwrap_or_default()),
            _ => Ok(Settings::default()),
        }
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(settings).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO settings (key, data) VALUES ('settings', ?1)",
            params![data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Peer Keys ===

    pub fn save_peer_key(&self, peer_id: &str, x25519_pubkey: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO peer_keys (peer_id, x25519_pubkey) VALUES (?1, ?2)",
            params![peer_id, x25519_pubkey],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_peer_key(&self, peer_id: &str) -> Result<Option<String>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT x25519_pubkey FROM peer_keys WHERE peer_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![peer_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(key)) => Ok(Some(key)),
            _ => Ok(None),
        }
    }

    // === Group Members ===

    pub fn get_group_members(&self, chat_id: &str) -> Result<Vec<GroupMember>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT data FROM group_members WHERE chat_id = ?1")
            .map_err(|e| e.to_string())?;
        let members = stmt
            .query_map(params![chat_id], |row| {
                let data: Vec<u8> = row.get(0)?;
                Ok(data)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| {
                r.ok()
                    .and_then(|d| bincode::deserialize::<GroupMember>(&d).ok())
            })
            .collect();
        Ok(members)
    }

    pub fn save_group_member(&self, chat_id: &str, member: &GroupMember) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(member).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO group_members (chat_id, user_id, data) VALUES (?1, ?2, ?3)",
            params![chat_id, member.user_id, data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_member(&self, chat_id: &str, user_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "DELETE FROM group_members WHERE chat_id = ?1 AND user_id = ?2",
            params![chat_id, user_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_members(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "DELETE FROM group_members WHERE chat_id = ?1",
            params![chat_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // === Group Invites ===

    pub fn get_group_invite(&self, code: &str) -> Result<Option<GroupInvite>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT data FROM group_invites WHERE code = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![code], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(data)) => Ok(bincode::deserialize(&data).ok()),
            _ => Ok(None),
        }
    }

    pub fn save_group_invite(&self, invite: &GroupInvite) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        let data = bincode::serialize(invite).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO group_invites (code, data) VALUES (?1, ?2)",
            params![invite.code, data],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group_invites_for_chat(&self, chat_id: &str) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        Self::delete_invites_for_chat(&db, chat_id)
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn open(dir: &std::path::Path) -> StorageService {
        StorageService::new(dir.to_path_buf()).expect("storage should open")
    }

    fn message(id: &str, chat_id: &str, content: &str) -> Message {
        Message {
            id: id.to_string(),
            chat_id: chat_id.to_string(),
            sender_id: "alice".to_string(),
            content: Some(content.to_string()),
            message_type: MessageType::Text,
            timestamp: Utc::now(),
            is_read: false,
            reply_to_id: None,
            media_url: None,
            metadata: None,
        }
    }

    fn chat(id: &str, name: &str) -> Chat {
        Chat {
            id: id.to_string(),
            chat_type: ChatType::Private,
            name: Some(name.to_string()),
            avatar_url: None,
            participant_ids: vec!["alice".to_string(), "bob".to_string()],
            last_message: None,
            unread_count: 0,
            updated_at: Utc::now(),
            is_pinned: false,
            is_muted: false,
            owner_id: None,
            group_settings: None,
        }
    }

    #[test]
    fn message_crud_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        let msg = message("m1", "c1", "hello world");
        storage.save_message(&msg).unwrap();

        let loaded = storage.get_messages("c1", 10, None).unwrap();
        assert_eq!(loaded, vec![msg]);

        storage.delete_message("c1", "m1").unwrap();
        assert!(storage.get_messages("c1", 10, None).unwrap().is_empty());
    }

    #[test]
    fn fts_search_works_on_fresh_database() {
        // Regression: a fresh DB used to be stamped v2 without the FTS index
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        storage.save_chat(&chat("c1", "Test Chat")).unwrap();
        storage
            .save_message(&message("m1", "c1", "уникальное слово"))
            .unwrap();
        storage
            .save_message(&message("m2", "c1", "something else"))
            .unwrap();

        let results = storage.search_messages("уникальное", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0.id, "m1");
        assert_eq!(results[0].1, "Test Chat");
    }

    #[test]
    fn fts_index_follows_deletes() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        storage
            .save_message(&message("m1", "c1", "findme"))
            .unwrap();
        storage.delete_message("c1", "m1").unwrap();
        assert!(storage.search_messages("findme", 10).unwrap().is_empty());
    }

    #[test]
    fn legacy_keyless_schema_version_is_repaired() {
        let dir = tempfile::tempdir().unwrap();
        // Simulate a DB created by the old code: keyless version table with
        // duplicate rows, base tables present, no FTS index.
        {
            let db = Connection::open(dir.path().join("pulse.db")).unwrap();
            db.execute_batch(
                "CREATE TABLE schema_version (version INTEGER NOT NULL);
                 INSERT INTO schema_version (version) VALUES (2);
                 INSERT INTO schema_version (version) VALUES (2);
                 CREATE TABLE messages (
                    id TEXT NOT NULL,
                    chat_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    data BLOB NOT NULL,
                    PRIMARY KEY (chat_id, id)
                 );",
            )
            .unwrap();
        }

        let storage = open(dir.path());
        // FTS must have been built despite the recorded version saying v2
        storage
            .save_message(&message("m1", "c1", "needle"))
            .unwrap();
        assert_eq!(storage.search_messages("needle", 10).unwrap().len(), 1);

        // And the version table must now hold exactly one row
        let db = storage.db.lock().unwrap();
        let rows: i32 = db
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
    }

    #[test]
    fn reopening_database_is_stable() {
        let dir = tempfile::tempdir().unwrap();
        {
            let storage = open(dir.path());
            storage
                .save_message(&message("m1", "c1", "persist me"))
                .unwrap();
        }
        let storage = open(dir.path());
        assert_eq!(storage.get_messages("c1", 10, None).unwrap().len(), 1);
        assert_eq!(storage.search_messages("persist", 10).unwrap().len(), 1);

        let db = storage.db.lock().unwrap();
        let rows: i32 = db
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "schema_version must not accumulate rows");
    }

    #[test]
    fn get_messages_respects_limit_and_pagination() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        for i in 0..5 {
            let mut msg = message(&format!("m{}", i), "c1", &format!("msg {}", i));
            msg.timestamp = Utc::now() + chrono::Duration::seconds(i);
            storage.save_message(&msg).unwrap();
        }

        let page = storage.get_messages("c1", 2, None).unwrap();
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].id, "m4", "newest first");

        let before = page[1].timestamp.to_rfc3339();
        let next = storage.get_messages("c1", 2, Some(&before)).unwrap();
        assert_eq!(next[0].id, "m2");
    }

    #[test]
    fn peer_keys_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        assert!(storage.get_peer_key("bob").unwrap().is_none());
        storage.save_peer_key("bob", "abcdef").unwrap();
        assert_eq!(
            storage.get_peer_key("bob").unwrap().as_deref(),
            Some("abcdef")
        );
    }

    #[test]
    fn delete_chat_removes_related_data() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());

        storage.save_chat(&chat("c1", "Doomed")).unwrap();
        storage.save_message(&message("m1", "c1", "bye")).unwrap();
        let member = GroupMember {
            user_id: "alice".to_string(),
            display_name: "Alice".to_string(),
            role: GroupRole::Owner,
            joined_at: Utc::now(),
        };
        storage.save_group_member("c1", &member).unwrap();
        // Regression: invite rows are bincode, the old json_extract DELETE blew up
        let invite = GroupInvite {
            code: "abc12345".to_string(),
            chat_id: "c1".to_string(),
            created_by: "alice".to_string(),
            created_at: Utc::now(),
            expires_at: None,
            max_uses: None,
            use_count: 0,
        };
        storage.save_group_invite(&invite).unwrap();
        let keeper = GroupInvite {
            code: "keep0000".to_string(),
            chat_id: "c2".to_string(),
            ..invite.clone()
        };
        storage.save_group_invite(&keeper).unwrap();

        storage.delete_chat("c1").unwrap();
        assert!(storage.get_chat("c1").unwrap().is_none());
        assert!(storage.get_messages("c1", 10, None).unwrap().is_empty());
        assert!(storage.get_group_members("c1").unwrap().is_empty());
        assert!(storage.get_group_invite("abc12345").unwrap().is_none());
        assert!(
            storage.get_group_invite("keep0000").unwrap().is_some(),
            "other chats' invites survive"
        );
    }
}
