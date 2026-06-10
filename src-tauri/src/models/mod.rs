use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// === User ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub public_key: String,
    pub last_seen: DateTime<Utc>,
    pub is_online: bool,
}

// === Message ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MessageType {
    Text,
    Image,
    File,
    Voice,
    Video,
    Sticker,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub content: Option<String>,
    pub message_type: MessageType,
    pub timestamp: DateTime<Utc>,
    pub is_read: bool,
    pub reply_to_id: Option<String>,
    pub media_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

// === Chat ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ChatType {
    Private,
    Group,
    Channel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub chat_type: ChatType,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub participant_ids: Vec<String>,
    pub last_message: Option<Message>,
    pub unread_count: i32,
    pub updated_at: DateTime<Utc>,
    pub is_pinned: bool,
    pub is_muted: bool,
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub group_settings: Option<GroupSettings>,
}

// === Settings ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub is_dark: bool,
    pub language: String,
    pub notifications_enabled: bool,
    pub sound_enabled: bool,
}

// === Contact ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub user: User,
    pub is_blocked: bool,
    pub nickname: Option<String>,
    pub added_at: DateTime<Utc>,
}

// === File Transfer ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub file_name: String,
    pub file_size: u64,
    pub mime_type: String,
    pub chunk_count: u32,
    pub thumbnail: Option<Vec<u8>>,
}

// === Group Chat ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GroupRole {
    Owner,
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupMember {
    pub user_id: String,
    pub display_name: String,
    pub role: GroupRole,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupInvite {
    pub code: String,
    pub chat_id: String,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: Option<u32>,
    pub use_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupSettings {
    pub only_admins_send: bool,
    pub only_admins_edit_info: bool,
    pub only_admins_pin: bool,
    pub slow_mode_seconds: Option<u32>,
}

impl Default for GroupSettings {
    fn default() -> Self {
        Self {
            only_admins_send: false,
            only_admins_edit_info: false,
            only_admins_pin: false,
            slow_mode_seconds: None,
        }
    }
}

// === Network Status ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum NetworkStatus {
    Offline,
    Starting,
    Online { peer_count: usize },
}
