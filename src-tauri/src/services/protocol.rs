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
    /// Native call media: 16kHz mono PCM16, 20ms frames
    CallAudio {
        call_id: String,
        seq: u32,
        data: Vec<u8>,
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
    MemberJoined {
        user_id: String,
        display_name: String,
    },
    MemberLeft {
        user_id: String,
    },
    MemberRemoved {
        user_id: String,
        removed_by: String,
    },
    RoleChanged {
        user_id: String,
        new_role: String,
        changed_by: String,
    },
    NameChanged {
        new_name: String,
    },
    SettingsChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AckStatus {
    Delivered,
    Read,
    Failed(String),
}

/// Serialize a protocol message to bytes (bincode: binary chunks must
/// not inflate 4-5x the way JSON number arrays do)
pub fn encode_message(msg: &ProtocolMessage) -> Result<Vec<u8>, String> {
    bincode::serialize(msg).map_err(|e| e.to_string())
}

/// Deserialize a protocol message from bytes
pub fn decode_message(data: &[u8]) -> Result<ProtocolMessage, String> {
    bincode::deserialize(data).map_err(|e| format!("Decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(msg: &ProtocolMessage) -> ProtocolMessage {
        decode_message(&encode_message(msg).unwrap()).unwrap()
    }

    #[test]
    fn text_message_roundtrip() {
        let msg = ProtocolMessage::TextMessage(MessageEnvelope {
            version: PROTOCOL_VERSION,
            message_id: "m1".into(),
            chat_id: "c1".into(),
            sender_id: "alice".into(),
            sender_name: "Алиса".into(),
            content: "привет 👋".into(),
            message_type: "text".into(),
            timestamp: 1718000000,
            signature: vec![1, 2, 3],
            sender_public_key: vec![4, 5, 6],
        });
        match roundtrip(&msg) {
            ProtocolMessage::TextMessage(env) => {
                assert_eq!(env.content, "привет 👋");
                assert_eq!(env.signature, vec![1, 2, 3]);
                assert_eq!(env.version, PROTOCOL_VERSION);
            }
            other => panic!("wrong variant: {:?}", other),
        }
    }

    #[test]
    fn file_chunk_preserves_binary_data() {
        let data: Vec<u8> = (0..=255).collect();
        let msg = ProtocolMessage::FileChunk {
            message_id: "m2".into(),
            chunk_index: 7,
            data: data.clone(),
        };
        match roundtrip(&msg) {
            ProtocolMessage::FileChunk {
                chunk_index,
                data: d,
                ..
            } => {
                assert_eq!(chunk_index, 7);
                assert_eq!(d, data);
            }
            other => panic!("wrong variant: {:?}", other),
        }
    }

    #[test]
    fn group_update_variants_roundtrip() {
        let msg = ProtocolMessage::GroupUpdate {
            chat_id: "g1".into(),
            sender_id: "alice".into(),
            update_type: GroupUpdateType::RoleChanged {
                user_id: "bob".into(),
                new_role: "admin".into(),
                changed_by: "alice".into(),
            },
            timestamp: 1,
        };
        match roundtrip(&msg) {
            ProtocolMessage::GroupUpdate {
                update_type: GroupUpdateType::RoleChanged { new_role, .. },
                ..
            } => {
                assert_eq!(new_role, "admin");
            }
            other => panic!("wrong variant: {:?}", other),
        }
    }

    #[test]
    fn ack_failure_reason_roundtrip() {
        let msg = ProtocolMessage::Ack {
            message_id: "m3".into(),
            status: AckStatus::Failed("peer offline".into()),
        };
        match roundtrip(&msg) {
            ProtocolMessage::Ack {
                status: AckStatus::Failed(reason),
                ..
            } => {
                assert_eq!(reason, "peer offline");
            }
            other => panic!("wrong variant: {:?}", other),
        }
    }

    #[test]
    fn decode_rejects_garbage() {
        assert!(decode_message(b"not json at all").is_err());
        assert!(decode_message(br#"{"UnknownVariant":{}}"#).is_err());
        assert!(decode_message(b"").is_err());
    }
}
