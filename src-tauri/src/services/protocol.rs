use serde::{Deserialize, Serialize};

/// Wire protocol version
pub const PROTOCOL_VERSION: u8 = 1;

/// Message envelope sent between peers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageEnvelope {
    pub version: u8,
    pub message_id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub content: String,
    pub message_type: String,
    pub timestamp: i64,
    pub signature: Vec<u8>,
    pub sender_public_key: Vec<u8>,
}

/// Wrapper for all protocol messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProtocolMessage {
    TextMessage(MessageEnvelope),
    KeyExchange {
        chat_id: String,
        sender_id: String,
        x25519_public_key: Vec<u8>,
    },
    Ack {
        message_id: String,
        status: AckStatus,
    },
    FileOffer {
        message_id: String,
        chat_id: String,
        sender_id: String,
        sender_name: String,
        file_name: String,
        file_size: u64,
        mime_type: String,
        chunk_count: u32,
        timestamp: i64,
    },
    FileChunk {
        message_id: String,
        chunk_index: u32,
        data: Vec<u8>,
    },
    FileComplete {
        message_id: String,
    },
    GroupCreate {
        chat_id: String,
        sender_id: String,
        sender_name: String,
        group_name: String,
        member_ids: Vec<String>,
        timestamp: i64,
    },
    GroupUpdate {
        chat_id: String,
        sender_id: String,
        update_type: GroupUpdateType,
        timestamp: i64,
    },
    // === Call Signaling ===
    CallOffer {
        call_id: String,
        chat_id: String,
        caller_id: String,
        caller_name: String,
        callee_id: String,
        call_type: CallType,
        sdp: String,
        timestamp: i64,
    },
    CallAnswer {
        call_id: String,
        caller_id: String,
        sdp: String,
    },
    IceCandidate {
        call_id: String,
        candidate: String,
        sdp_mid: String,
        sdp_m_line_index: u16,
    },
    CallEnd {
        call_id: String,
        reason: CallEndReason,
    },
    CallReject {
        call_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CallType {
    Audio,
    Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CallEndReason {
    HungUp,
    Declined,
    Busy,
    Failed(String),
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GroupUpdateType {
    MemberJoined { user_id: String, display_name: String },
    MemberLeft { user_id: String },
    MemberRemoved { user_id: String, removed_by: String },
    RoleChanged { user_id: String, new_role: String, changed_by: String },
    NameChanged { new_name: String },
    SettingsChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AckStatus {
    Delivered,
    Read,
    Failed(String),
}

/// Serialize a protocol message to bytes (JSON)
pub fn encode_message(msg: &ProtocolMessage) -> Result<Vec<u8>, String> {
    serde_json::to_vec(msg).map_err(|e| e.to_string())
}

/// Deserialize a protocol message from bytes (JSON)
pub fn decode_message(data: &[u8]) -> Result<ProtocolMessage, String> {
    serde_json::from_slice(data).map_err(|e| format!("Decode error: {}", e))
}
