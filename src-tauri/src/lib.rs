mod models;
mod services;

use models::*;
use services::*;
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

// === User Profile ===

#[tauri::command]
fn get_current_user(
    state: tauri::State<std::sync::Arc<StorageService>>,
) -> Result<Option<User>, String> {
    state.get_user_profile()
}

#[tauri::command]
fn create_user_profile(
    state: tauri::State<std::sync::Arc<StorageService>>,
    user_state: tauri::State<std::sync::Mutex<Option<User>>>,
    encryption: tauri::State<EncryptionService>,
    key_exchange: tauri::State<KeyExchangeService>,
    username: String,
    display_name: Option<String>,
) -> Result<User, String> {
    let public_key = encryption.get_public_key_hex();
    let x25519_key = key_exchange.get_public_key_hex();
    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        username,
        display_name,
        avatar_url: None,
        bio: None,
        public_key,
        last_seen: chrono::Utc::now(),
        is_online: true,
    };
    state.save_user_profile(&user)?;
    state.save_peer_key("self", &x25519_key)?;
    // Update in-memory state
    if let Ok(mut u) = user_state.lock() {
        *u = Some(user.clone());
    }
    Ok(user)
}

#[tauri::command]
fn update_user_profile(
    state: tauri::State<std::sync::Arc<StorageService>>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    bio: Option<String>,
) -> Result<User, String> {
    let mut user = state.get_user_profile()?.ok_or("Profile not found")?;
    if let Some(name) = display_name {
        user.display_name = Some(name);
    }
    if let Some(url) = avatar_url {
        user.avatar_url = Some(url);
    }
    if let Some(b) = bio {
        user.bio = Some(b);
    }
    user.last_seen = chrono::Utc::now();
    state.save_user_profile(&user)?;
    Ok(user)
}

// === Chats ===

#[tauri::command]
fn get_chats(state: tauri::State<std::sync::Arc<StorageService>>) -> Result<Vec<Chat>, String> {
    state.get_chats()
}

#[tauri::command]
fn get_chat(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
) -> Result<Option<Chat>, String> {
    state.get_chat(&chat_id)
}

#[tauri::command]
fn create_chat(
    state: tauri::State<std::sync::Arc<StorageService>>,
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_type: String,
    name: Option<String>,
    participant_ids: Vec<String>,
) -> Result<Chat, String> {
    let ct = match chat_type.as_str() {
        "group" => ChatType::Group,
        "channel" => ChatType::Channel,
        _ => ChatType::Private,
    };
    let now = chrono::Utc::now();
    let user = user.lock().map_err(|e| e.to_string())?;
    let user = user.as_ref().ok_or("User profile not created")?;

    let is_group = ct == ChatType::Group;
    let chat_id = uuid::Uuid::new_v4().to_string();

    let chat = Chat {
        id: chat_id.clone(),
        chat_type: ct,
        name,
        avatar_url: None,
        participant_ids: participant_ids.clone(),
        last_message: None,
        unread_count: 0,
        updated_at: now,
        is_pinned: false,
        is_muted: false,
        owner_id: if is_group {
            Some(user.id.clone())
        } else {
            None
        },
        group_settings: if is_group {
            Some(GroupSettings::default())
        } else {
            None
        },
    };

    if is_group {
        group_service.create_group(
            &chat_id,
            &user.id,
            &user
                .display_name
                .clone()
                .unwrap_or_else(|| user.username.clone()),
        );
        for pid in &participant_ids {
            if pid != &user.id {
                let _ = group_service.add_member(&chat_id, pid, pid);
            }
        }
    }

    state.save_chat(&chat)?;
    Ok(chat)
}

#[tauri::command]
fn update_chat(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
    name: Option<String>,
    is_pinned: Option<bool>,
    is_muted: Option<bool>,
) -> Result<Chat, String> {
    let mut chat = state.get_chat(&chat_id)?.ok_or("Chat not found")?;
    if let Some(n) = name {
        chat.name = Some(n);
    }
    if let Some(p) = is_pinned {
        chat.is_pinned = p;
    }
    if let Some(m) = is_muted {
        chat.is_muted = m;
    }
    state.save_chat(&chat)?;
    Ok(chat)
}

#[tauri::command]
fn delete_chat(
    state: tauri::State<std::sync::Arc<StorageService>>,
    group_service: tauri::State<GroupService>,
    chat_id: String,
) -> Result<(), String> {
    group_service.delete_group(&chat_id);
    state.delete_chat(&chat_id)
}

// === Group Management ===

#[tauri::command]
fn get_group_members(
    group_service: tauri::State<GroupService>,
    chat_id: String,
) -> Vec<GroupMember> {
    group_service.get_members(&chat_id)
}

#[tauri::command]
fn add_group_member(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_id: String,
    user_id: String,
    display_name: String,
) -> Result<(), String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    if !group_service.is_admin_or_above(&chat_id, &u.id) {
        return Err("Only admins can add members".to_string());
    }
    group_service.add_member(&chat_id, &user_id, &display_name)
}

#[tauri::command]
fn remove_group_member(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_id: String,
    user_id: String,
) -> Result<(), String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    if !group_service.is_admin_or_above(&chat_id, &u.id) {
        return Err("Only admins can remove members".to_string());
    }
    group_service.remove_member(&chat_id, &user_id)
}

#[tauri::command]
fn leave_group(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_id: String,
) -> Result<(), String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    group_service.leave_group(&chat_id, &u.id)
}

#[tauri::command]
fn change_member_role(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_id: String,
    target_user_id: String,
    new_role: String,
) -> Result<(), String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    let role = match new_role.as_str() {
        "admin" => GroupRole::Admin,
        "member" => GroupRole::Member,
        _ => return Err("Invalid role".to_string()),
    };
    group_service.update_role(&chat_id, &u.id, &target_user_id, role)
}

#[tauri::command]
fn create_group_invite(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    chat_id: String,
    max_uses: Option<u32>,
    expires_in_hours: Option<u32>,
) -> Result<GroupInvite, String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    if !group_service.is_admin_or_above(&chat_id, &u.id) {
        return Err("Only admins can create invites".to_string());
    }
    group_service.create_invite(&chat_id, &u.id, max_uses, expires_in_hours)
}

#[tauri::command]
fn join_group_via_invite(
    group_service: tauri::State<GroupService>,
    state: tauri::State<std::sync::Arc<StorageService>>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    invite_code: String,
) -> Result<Chat, String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    let display_name = u.display_name.clone().unwrap_or_else(|| u.username.clone());
    let chat_id = group_service.join_via_invite(&invite_code, &u.id, &display_name)?;

    // Update chat participant list
    let mut chat = state.get_chat(&chat_id)?.ok_or("Chat not found")?;
    if !chat.participant_ids.contains(&u.id) {
        chat.participant_ids.push(u.id.clone());
    }
    chat.updated_at = chrono::Utc::now();
    state.save_chat(&chat)?;
    Ok(chat)
}

#[tauri::command]
fn update_group_settings(
    group_service: tauri::State<GroupService>,
    user: tauri::State<std::sync::Mutex<Option<User>>>,
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
    settings: GroupSettings,
) -> Result<Chat, String> {
    let u = user.lock().map_err(|e| e.to_string())?;
    let u = u.as_ref().ok_or("User profile not created")?;
    if !group_service.is_admin_or_above(&chat_id, &u.id) {
        return Err("Only admins can change settings".to_string());
    }
    let mut chat = state.get_chat(&chat_id)?.ok_or("Chat not found")?;
    chat.group_settings = Some(settings);
    chat.updated_at = chrono::Utc::now();
    state.save_chat(&chat)?;
    Ok(chat)
}

// === Messages ===

#[tauri::command]
fn get_messages(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
    limit: Option<usize>,
    before: Option<String>,
) -> Result<Vec<Message>, String> {
    state.get_messages(&chat_id, limit.unwrap_or(50), before.as_deref())
}

#[tauri::command]
fn send_message(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
    content: String,
    message_type: Option<String>,
    reply_to_id: Option<String>,
) -> Result<Message, String> {
    let user = state
        .get_user_profile()?
        .ok_or("User profile not created")?;

    let mt = match message_type.as_deref().unwrap_or("text") {
        "image" => MessageType::Image,
        "file" => MessageType::File,
        "voice" => MessageType::Voice,
        "video" => MessageType::Video,
        "sticker" => MessageType::Sticker,
        "system" => MessageType::System,
        _ => MessageType::Text,
    };

    let now = chrono::Utc::now();
    let message = Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: chat_id.clone(),
        sender_id: user.id,
        content: Some(content),
        message_type: mt,
        timestamp: now,
        is_read: false,
        reply_to_id,
        media_url: None,
        metadata: None,
    };

    state.save_message(&message)?;

    if let Ok(Some(mut chat)) = state.get_chat(&chat_id) {
        chat.last_message = Some(message.clone());
        chat.updated_at = now;
        let _ = state.save_chat(&chat);
    }

    Ok(message)
}

/// Send a message through the P2P network with Ed25519 signing
#[tauri::command]
fn send_network_message(
    state: tauri::State<std::sync::Arc<StorageService>>,
    command_tx: tauri::State<std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    encryption: tauri::State<EncryptionService>,
    chat_id: String,
    to_peer: String,
    content: String,
    message_id: Option<String>,
) -> Result<Message, String> {
    let user = state
        .get_user_profile()?
        .ok_or("User profile not created")?;

    // Reusing an existing ID lets the outbox resend a locally saved message
    // without creating a duplicate (save_message is INSERT OR REPLACE)
    let message_id = message_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now();

    // Create envelope first, then sign the canonical representation
    let timestamp_ms = now.timestamp_millis();
    let canonical = format!(
        "{}|{}|{}|{}|{}",
        message_id, chat_id, user.id, content, timestamp_ms
    );
    let signature = encryption.sign_message(canonical.as_bytes())?;

    // Create protocol envelope
    let envelope = MessageEnvelope {
        version: PROTOCOL_VERSION,
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        sender_id: user.id.clone(),
        sender_name: user
            .display_name
            .clone()
            .unwrap_or_else(|| user.username.clone()),
        content: content.clone(),
        message_type: "text".to_string(),
        timestamp: timestamp_ms,
        signature,
        sender_public_key: encryption.get_public_key(),
    };

    let protocol_msg = ProtocolMessage::TextMessage(envelope);
    let data = encode_message(&protocol_msg)?;

    // Send via network
    let peer_id: libp2p::PeerId = to_peer.parse().map_err(|_| "Invalid peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    } else {
        return Err("Network not started".to_string());
    }

    // Save locally
    let message = Message {
        id: message_id,
        chat_id: chat_id.clone(),
        sender_id: user.id,
        content: Some(content),
        message_type: MessageType::Text,
        timestamp: now,
        is_read: true,
        reply_to_id: None,
        media_url: None,
        metadata: None,
    };
    state.save_message(&message)?;

    if let Ok(Some(mut chat)) = state.get_chat(&chat_id) {
        chat.last_message = Some(message.clone());
        chat.updated_at = now;
        let _ = state.save_chat(&chat);
    }

    Ok(message)
}

#[tauri::command]
fn delete_message(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
    message_id: String,
) -> Result<(), String> {
    state.delete_message(&chat_id, &message_id)
}

#[tauri::command]
fn search_messages(
    state: tauri::State<std::sync::Arc<StorageService>>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let results = state.search_messages(&query, limit.unwrap_or(50))?;
    Ok(results
        .into_iter()
        .map(|(msg, chat_name)| SearchResult {
            message: msg,
            chat_name,
        })
        .collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    message: Message,
    chat_name: String,
}

#[tauri::command]
fn mark_messages_read(
    state: tauri::State<std::sync::Arc<StorageService>>,
    chat_id: String,
) -> Result<(), String> {
    let messages = state.get_messages(&chat_id, 1000, None)?;
    for mut msg in messages {
        if !msg.is_read {
            msg.is_read = true;
            let _ = state.save_message(&msg);
        }
    }
    if let Ok(Some(mut chat)) = state.get_chat(&chat_id) {
        chat.unread_count = 0;
        let _ = state.save_chat(&chat);
    }
    Ok(())
}

// === Contacts ===

#[tauri::command]
fn get_contacts(
    state: tauri::State<std::sync::Arc<StorageService>>,
) -> Result<Vec<Contact>, String> {
    state.get_contacts()
}

#[tauri::command]
fn add_contact(
    state: tauri::State<std::sync::Arc<StorageService>>,
    user: User,
    nickname: Option<String>,
) -> Result<Contact, String> {
    let contact = Contact {
        user,
        is_blocked: false,
        nickname,
        added_at: chrono::Utc::now(),
    };
    state.save_contact(&contact)?;
    Ok(contact)
}

#[tauri::command]
fn remove_contact(
    state: tauri::State<std::sync::Arc<StorageService>>,
    user_id: String,
) -> Result<(), String> {
    state.delete_contact(&user_id)
}

#[tauri::command]
fn block_contact(
    state: tauri::State<std::sync::Arc<StorageService>>,
    user_id: String,
    blocked: bool,
) -> Result<(), String> {
    let contacts = state.get_contacts()?;
    if let Some(mut contact) = contacts.into_iter().find(|c| c.user.id == user_id) {
        contact.is_blocked = blocked;
        state.save_contact(&contact)?;
    }
    Ok(())
}

// === Settings ===

#[tauri::command]
fn get_settings(state: tauri::State<std::sync::Arc<StorageService>>) -> Result<Settings, String> {
    state.get_settings()
}

#[tauri::command]
fn update_settings(
    state: tauri::State<std::sync::Arc<StorageService>>,
    settings: Settings,
) -> Result<(), String> {
    state.save_settings(&settings)
}

#[tauri::command]
fn set_theme(
    state: tauri::State<std::sync::Arc<StorageService>>,
    theme_id: String,
) -> Result<(), String> {
    let mut settings = state.get_settings()?;
    settings.theme = theme_id;
    state.save_settings(&settings)
}

#[tauri::command]
fn toggle_dark_mode(state: tauri::State<std::sync::Arc<StorageService>>) -> Result<bool, String> {
    let mut settings = state.get_settings()?;
    settings.is_dark = !settings.is_dark;
    state.save_settings(&settings)?;
    Ok(settings.is_dark)
}

// === Encryption ===

#[tauri::command]
fn get_public_key(encryption: tauri::State<EncryptionService>) -> Vec<u8> {
    encryption.get_public_key()
}

#[tauri::command]
fn get_public_key_hex(encryption: tauri::State<EncryptionService>) -> String {
    encryption.get_public_key_hex()
}

#[tauri::command]
fn sign_data(
    encryption: tauri::State<EncryptionService>,
    data: Vec<u8>,
) -> Result<Vec<u8>, String> {
    encryption.sign_message(&data)
}

#[tauri::command]
fn verify_signature(
    encryption: tauri::State<EncryptionService>,
    data: Vec<u8>,
    signature: Vec<u8>,
    public_key: Vec<u8>,
) -> Result<bool, String> {
    encryption.verify_signature(&data, &signature, &public_key)
}

#[tauri::command]
fn encrypt_data(
    encryption: tauri::State<EncryptionService>,
    plaintext: Vec<u8>,
    key: Vec<u8>,
) -> Result<Vec<u8>, String> {
    encryption.encrypt_message(&plaintext, &key)
}

#[tauri::command]
fn decrypt_data(
    encryption: tauri::State<EncryptionService>,
    ciphertext: Vec<u8>,
    key: Vec<u8>,
) -> Result<Vec<u8>, String> {
    encryption.decrypt_message(&ciphertext, &key)
}

// === Key Exchange ===

#[tauri::command]
fn get_x25519_public_key(key_exchange: tauri::State<KeyExchangeService>) -> Vec<u8> {
    key_exchange.get_public_key().to_vec()
}

#[tauri::command]
fn get_x25519_public_key_hex(key_exchange: tauri::State<KeyExchangeService>) -> String {
    key_exchange.get_public_key_hex()
}

#[tauri::command]
fn derive_shared_key(
    key_exchange: tauri::State<KeyExchangeService>,
    state: tauri::State<std::sync::Arc<StorageService>>,
    peer_id: String,
    peer_x25519_pubkey_hex: String,
) -> Result<String, String> {
    let peer_bytes = hex::decode(&peer_x25519_pubkey_hex).map_err(|_| "Invalid hex")?;
    if peer_bytes.len() != 32 {
        return Err("Invalid key length".to_string());
    }
    let mut peer_key = [0u8; 32];
    peer_key.copy_from_slice(&peer_bytes);

    let shared = key_exchange.compute_shared_secret(&peer_key);
    let chat_key = KeyExchangeService::derive_encryption_key(&shared, peer_id.as_bytes());
    let chat_key_hex = hex::encode(chat_key);

    // Store the derived key for this peer
    state.save_peer_key(&peer_id, &chat_key_hex)?;

    Ok(chat_key_hex)
}

#[tauri::command]
fn encrypt_for_peer(
    encryption: tauri::State<EncryptionService>,
    state: tauri::State<std::sync::Arc<StorageService>>,
    peer_id: String,
    plaintext: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let key_hex = state
        .get_peer_key(&peer_id)?
        .ok_or("No shared key for this peer. Run key exchange first.")?;
    let key = hex::decode(&key_hex).map_err(|_| "Invalid key hex")?;
    encryption.encrypt_message(&plaintext, &key)
}

#[tauri::command]
fn decrypt_from_peer(
    encryption: tauri::State<EncryptionService>,
    state: tauri::State<std::sync::Arc<StorageService>>,
    peer_id: String,
    ciphertext: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let key_hex = state
        .get_peer_key(&peer_id)?
        .ok_or("No shared key for this peer. Run key exchange first.")?;
    let key = hex::decode(&key_hex).map_err(|_| "Invalid key hex")?;
    encryption.decrypt_message(&ciphertext, &key)
}

// === File Transfer ===

#[tauri::command]
async fn send_file_message(
    state: tauri::State<'_, StorageService>,
    file_service: tauri::State<'_, FileTransferService>,
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    _encryption: tauri::State<'_, EncryptionService>,
    chat_id: String,
    to_peer: String,
    file_path: String,
) -> Result<Message, String> {
    let user = state
        .get_user_profile()?
        .ok_or("User profile not created")?;

    let (metadata, chunks) = file_service.chunk_file(&file_path)?;
    let message_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    // Determine message type from mime
    let message_type = if metadata.mime_type.starts_with("image/") {
        MessageType::Image
    } else if metadata.mime_type.starts_with("audio/") {
        MessageType::Voice
    } else if metadata.mime_type.starts_with("video/") {
        MessageType::Video
    } else {
        MessageType::File
    };

    // Send FileOffer
    let offer = ProtocolMessage::FileOffer {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        sender_id: user.id.clone(),
        sender_name: user
            .display_name
            .clone()
            .unwrap_or_else(|| user.username.clone()),
        file_name: metadata.file_name.clone(),
        file_size: metadata.file_size,
        mime_type: metadata.mime_type.clone(),
        chunk_count: metadata.chunk_count,
        timestamp: now.timestamp_millis(),
    };
    let offer_data = encode_message(&offer)?;
    let peer_id: libp2p::PeerId = to_peer.parse().map_err(|_| "Invalid peer ID")?;

    {
        let cmd = command_tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = cmd.as_ref() {
            tx.send(NetworkCommand::SendMessage {
                peer_id,
                data: offer_data,
            })
            .map_err(|e| e.to_string())?;
        } else {
            return Err("Network not started".to_string());
        }
    }

    // Send chunks
    for (i, chunk_data) in chunks.iter().enumerate() {
        let chunk_msg = ProtocolMessage::FileChunk {
            message_id: message_id.clone(),
            chunk_index: i as u32,
            data: chunk_data.clone(),
        };
        let chunk_bytes = encode_message(&chunk_msg)?;
        let cmd = command_tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = cmd.as_ref() {
            tx.send(NetworkCommand::SendMessage {
                peer_id,
                data: chunk_bytes,
            })
            .map_err(|e| e.to_string())?;
        }
    }

    // Send FileComplete
    let complete = ProtocolMessage::FileComplete {
        message_id: message_id.clone(),
    };
    let complete_data = encode_message(&complete)?;
    {
        let cmd = command_tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = cmd.as_ref() {
            tx.send(NetworkCommand::SendMessage {
                peer_id,
                data: complete_data,
            })
            .map_err(|e| e.to_string())?;
        }
    }

    // Save locally — store the file in our file storage
    let local_path = file_service.save_file(
        &message_id,
        &metadata.file_name,
        &std::fs::read(&file_path).map_err(|e| e.to_string())?,
    )?;

    let message = Message {
        id: message_id,
        chat_id: chat_id.clone(),
        sender_id: user.id,
        content: Some(metadata.file_name),
        message_type,
        timestamp: now,
        is_read: true,
        reply_to_id: None,
        media_url: Some(local_path),
        metadata: Some(serde_json::json!({
            "fileSize": metadata.file_size,
            "mimeType": metadata.mime_type,
            "chunkCount": metadata.chunk_count,
        })),
    };
    state.save_message(&message)?;

    if let Ok(Some(mut chat)) = state.get_chat(&chat_id) {
        chat.last_message = Some(message.clone());
        chat.updated_at = now;
        let _ = state.save_chat(&chat);
    }

    Ok(message)
}

#[tauri::command]
fn get_file_path(
    file_service: tauri::State<FileTransferService>,
    message_id: String,
    file_name: String,
) -> Option<String> {
    file_service.get_file_path(&message_id, &file_name)
}

#[tauri::command]
fn save_file_to_downloads(
    file_service: tauri::State<FileTransferService>,
    message_id: String,
    file_name: String,
) -> Result<String, String> {
    let src_path = file_service
        .get_file_path(&message_id, &file_name)
        .ok_or("File not found")?;
    let downloads = dirs_next::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dest = downloads.join(&file_name);
    std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn write_temp_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| format!("Failed to write temp file: {}", e))
}

#[tauri::command]
fn get_temp_dir() -> Result<String, String> {
    let dir = std::env::temp_dir();
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to get temp dir".to_string())
}

// === Call Signaling ===

#[tauri::command]
#[allow(clippy::too_many_arguments)] // mirrors the CallOffer protocol message fields
fn send_call_offer(
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    call_id: String,
    chat_id: String,
    caller_id: String,
    caller_name: String,
    callee_id: String,
    call_type: String,
    sdp: String,
) -> Result<(), String> {
    let ct = match call_type.as_str() {
        "video" => CallType::Video,
        _ => CallType::Audio,
    };
    let msg = ProtocolMessage::CallOffer {
        call_id,
        chat_id,
        caller_id,
        caller_name,
        callee_id: callee_id.clone(),
        call_type: ct,
        sdp,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };
    let data = encode_message(&msg)?;
    let peer_id: libp2p::PeerId = callee_id.parse().map_err(|_| "Invalid callee peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn send_call_answer(
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    call_id: String,
    caller_id: String,
    sdp: String,
) -> Result<(), String> {
    let msg = ProtocolMessage::CallAnswer {
        call_id,
        caller_id: caller_id.clone(),
        sdp,
    };
    let data = encode_message(&msg)?;
    let peer_id: libp2p::PeerId = caller_id.parse().map_err(|_| "Invalid caller peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn send_ice_candidate(
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    call_id: String,
    to_peer: String,
    candidate: String,
    sdp_mid: String,
    sdp_m_line_index: u16,
) -> Result<(), String> {
    let msg = ProtocolMessage::IceCandidate {
        call_id,
        candidate,
        sdp_mid,
        sdp_m_line_index,
    };
    let data = encode_message(&msg)?;
    let peer_id: libp2p::PeerId = to_peer.parse().map_err(|_| "Invalid peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn send_call_end(
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    call_id: String,
    to_peer: String,
    reason: String,
) -> Result<(), String> {
    let r = match reason.as_str() {
        "declined" => CallEndReason::Declined,
        "busy" => CallEndReason::Busy,
        "timeout" => CallEndReason::Timeout,
        "failed" => CallEndReason::Failed("unknown".to_string()),
        _ => CallEndReason::HungUp,
    };
    let msg = ProtocolMessage::CallEnd { call_id, reason: r };
    let data = encode_message(&msg)?;
    let peer_id: libp2p::PeerId = to_peer.parse().map_err(|_| "Invalid peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn send_call_reject(
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    call_id: String,
    to_peer: String,
) -> Result<(), String> {
    let msg = ProtocolMessage::CallReject { call_id };
    let data = encode_message(&msg)?;
    let peer_id: libp2p::PeerId = to_peer.parse().map_err(|_| "Invalid peer ID")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::SendMessage { peer_id, data })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// === Network ===

#[tauri::command]
async fn start_network(
    network: tauri::State<'_, std::sync::Mutex<NetworkService>>,
    command_tx: tauri::State<'_, std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    _state: tauri::State<'_, StorageService>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Clone shared state, drop lock, then start network (no lock held across await)
    let (peers, is_running, local_peer_id) = {
        let net = network.lock().map_err(|e| e.to_string())?;
        net.clone_state()
    };
    let (tx, mut event_rx) =
        services::start_network(peers, is_running, local_peer_id, None).await?;
    let peer_id = {
        let net = network.lock().map_err(|e| e.to_string())?;
        net.get_peer_id()
    };

    {
        let mut cmd = command_tx.lock().map_err(|e| e.to_string())?;
        *cmd = Some(tx);
    }

    // Spawn handler for incoming network events
    let app_handle = app.clone();
    tokio::spawn(async move {
        // Replay protection: remember recently seen message IDs (bounded)
        const SEEN_CAP: usize = 1024;
        let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut seen_order: std::collections::VecDeque<String> = std::collections::VecDeque::new();
        while let Some(event) = event_rx.recv().await {
            if let NetworkEvent::MessageReceived { from_peer, data } = &event {
                // Decode the protocol message
                match decode_message(data) {
                    Ok(ProtocolMessage::TextMessage(envelope)) => {
                        log::info!(
                            "Received text message from {} ({}): {}",
                            from_peer,
                            envelope.sender_name,
                            envelope.content
                        );

                        // Replay protection: reject messages older than 5 minutes
                        let now_ms = chrono::Utc::now().timestamp_millis();
                        if (now_ms - envelope.timestamp).unsigned_abs() > 5 * 60 * 1000 {
                            log::warn!(
                                "Rejected stale message from {} (timestamp drift: {}ms)",
                                envelope.sender_id,
                                (now_ms - envelope.timestamp).unsigned_abs()
                            );
                            continue;
                        }

                        // Replay protection: drop duplicate message IDs
                        if seen_ids.contains(&envelope.message_id) {
                            log::warn!(
                                "Rejected replayed message {} from {}",
                                envelope.message_id,
                                envelope.sender_id
                            );
                            continue;
                        }
                        seen_ids.insert(envelope.message_id.clone());
                        seen_order.push_back(envelope.message_id.clone());
                        if seen_order.len() > SEEN_CAP {
                            if let Some(old) = seen_order.pop_front() {
                                seen_ids.remove(&old);
                            }
                        }

                        // Key pinning: the envelope key must match the key we
                        // have on record for this contact, otherwise anyone
                        // could sign with their own key and claim a known
                        // sender_id (TOFU for unknown senders)
                        if let Some(storage) =
                            app_handle.try_state::<std::sync::Arc<StorageService>>()
                        {
                            let pinned = storage.get_contacts().ok().and_then(|contacts| {
                                contacts
                                    .into_iter()
                                    .find(|c| c.user.id == envelope.sender_id)
                                    .map(|c| c.user.public_key)
                            });
                            if let Some(pinned_key) = pinned {
                                if !pinned_key.is_empty()
                                    && pinned_key != hex::encode(&envelope.sender_public_key)
                                {
                                    log::warn!(
                                        "Sender key mismatch for {} — dropping message (possible impersonation)",
                                        envelope.sender_id
                                    );
                                    continue;
                                }
                            }
                        }

                        // Verify signature over canonical representation
                        if !envelope.sender_public_key.is_empty() && !envelope.signature.is_empty()
                        {
                            use ed25519_dalek::{Signature, Verifier, VerifyingKey};
                            let pk_bytes: [u8; 32] =
                                match envelope.sender_public_key.clone().try_into() {
                                    Ok(b) => b,
                                    Err(_) => {
                                        log::warn!(
                                        "Invalid public key length from {}, skipping verification",
                                        envelope.sender_id
                                    );
                                        continue;
                                    }
                                };
                            let sig_bytes: [u8; 64] = match envelope.signature.clone().try_into() {
                                Ok(b) => b,
                                Err(_) => {
                                    log::warn!(
                                        "Invalid signature length from {}, skipping verification",
                                        envelope.sender_id
                                    );
                                    continue;
                                }
                            };

                            let canonical = format!(
                                "{}|{}|{}|{}|{}",
                                envelope.message_id,
                                envelope.chat_id,
                                envelope.sender_id,
                                envelope.content,
                                envelope.timestamp
                            );

                            match VerifyingKey::from_bytes(&pk_bytes) {
                                Ok(vk) => {
                                    let sig = Signature::from_bytes(&sig_bytes);
                                    if vk.verify(canonical.as_bytes(), &sig).is_err() {
                                        log::warn!(
                                            "Invalid signature from {}, dropping message",
                                            envelope.sender_id
                                        );
                                        continue;
                                    }
                                    log::info!("Signature verified for {}", envelope.sender_id);
                                }
                                Err(_) => {
                                    log::warn!(
                                        "Invalid public key from {}, skipping verification",
                                        envelope.sender_id
                                    );
                                    continue;
                                }
                            }
                        } else {
                            log::warn!(
                                "Missing signature from {}, dropping message",
                                envelope.sender_id
                            );
                            continue;
                        }

                        // Save to local storage
                        let msg = Message {
                            id: envelope.message_id.clone(),
                            chat_id: envelope.chat_id.clone(),
                            sender_id: envelope.sender_id.clone(),
                            content: Some(envelope.content.clone()),
                            message_type: MessageType::Text,
                            timestamp: chrono::DateTime::from_timestamp_millis(envelope.timestamp)
                                .unwrap_or_else(chrono::Utc::now),
                            is_read: false,
                            reply_to_id: None,
                            media_url: None,
                            metadata: None,
                        };

                        // Save message via a Tauri event that the frontend handles
                        let _ = app_handle.emit("incoming-message", &msg);
                    }
                    Ok(ProtocolMessage::KeyExchange {
                        chat_id,
                        sender_id,
                        x25519_public_key,
                    }) => {
                        log::info!("Key exchange from {} for chat {}", sender_id, chat_id);
                        let _ = app_handle.emit(
                            "key-exchange",
                            &serde_json::json!({
                                "chatId": chat_id,
                                "senderId": sender_id,
                                "x25519PublicKey": hex::encode(&x25519_public_key),
                            }),
                        );
                    }
                    Ok(ProtocolMessage::Ack { message_id, status }) => {
                        log::info!("Ack for {}: {:?}", message_id, status);
                        let _ = app_handle.emit(
                            "message-ack",
                            &serde_json::json!({
                                "messageId": message_id,
                                "status": format!("{:?}", status),
                            }),
                        );
                    }
                    Ok(ProtocolMessage::FileOffer {
                        message_id,
                        chat_id,
                        sender_id,
                        sender_name,
                        file_name,
                        file_size,
                        mime_type,
                        chunk_count,
                        timestamp,
                    }) => {
                        log::info!(
                            "File offer from {}: {} ({} bytes, {} chunks)",
                            sender_name,
                            file_name,
                            file_size,
                            chunk_count
                        );
                        // Register the incoming transfer
                        if let Some(ft) = app_handle.try_state::<FileTransferService>() {
                            ft.start_incoming(
                                &message_id,
                                FileMetadata {
                                    file_name: file_name.clone(),
                                    file_size,
                                    mime_type: mime_type.clone(),
                                    chunk_count,
                                    thumbnail: None,
                                },
                            );
                        }
                        let _ = app_handle.emit(
                            "file-offer",
                            &serde_json::json!({
                                "messageId": message_id,
                                "chatId": chat_id,
                                "senderId": sender_id,
                                "senderName": sender_name,
                                "fileName": file_name,
                                "fileSize": file_size,
                                "mimeType": mime_type,
                                "chunkCount": chunk_count,
                                "timestamp": timestamp,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::FileChunk {
                        message_id,
                        chunk_index,
                        data,
                    }) => {
                        log::info!(
                            "File chunk {} for message {} ({} bytes)",
                            chunk_index,
                            message_id,
                            data.len()
                        );
                        // Store chunk and get progress
                        if let Some(ft) = app_handle.try_state::<FileTransferService>() {
                            match ft.receive_chunk(&message_id, chunk_index, data.clone()) {
                                Ok(progress) => {
                                    let _ = app_handle.emit(
                                        "file-progress",
                                        &serde_json::json!({
                                            "messageId": message_id,
                                            "progress": progress,
                                        }),
                                    );
                                }
                                Err(e) => log::error!("Failed to receive chunk: {}", e),
                            }
                        }
                    }
                    Ok(ProtocolMessage::FileComplete { message_id }) => {
                        log::info!("File transfer complete: {}", message_id);
                        // Reassemble the file from chunks
                        if let Some(ft) = app_handle.try_state::<FileTransferService>() {
                            match ft.complete_transfer(&message_id) {
                                Ok(path) => log::info!("File saved to: {}", path),
                                Err(e) => log::error!("Failed to complete transfer: {}", e),
                            }
                        }
                        let _ = app_handle.emit(
                            "file-complete",
                            &serde_json::json!({
                                "messageId": message_id,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::GroupCreate {
                        chat_id,
                        sender_id,
                        sender_name,
                        group_name,
                        member_ids,
                        timestamp,
                    }) => {
                        log::info!(
                            "Group '{}' created by {} ({})",
                            group_name,
                            sender_name,
                            sender_id
                        );
                        if let Some(gs) = app_handle.try_state::<GroupService>() {
                            gs.create_group(&chat_id, &sender_id, &sender_name);
                            for mid in &member_ids {
                                if mid != &sender_id {
                                    let _ = gs.add_member(&chat_id, mid, mid);
                                }
                            }
                        }
                        let _ = app_handle.emit(
                            "group-created",
                            &serde_json::json!({
                                "chatId": chat_id,
                                "groupName": group_name,
                                "senderId": sender_id,
                                "timestamp": timestamp,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::GroupUpdate {
                        chat_id,
                        sender_id,
                        update_type,
                        timestamp,
                    }) => {
                        log::info!("Group update for {}: {:?}", chat_id, update_type);
                        if let Some(gs) = app_handle.try_state::<GroupService>() {
                            match &update_type {
                                GroupUpdateType::MemberJoined {
                                    user_id,
                                    display_name,
                                } => {
                                    let _ = gs.add_member(&chat_id, user_id, display_name);
                                }
                                GroupUpdateType::MemberLeft { user_id } => {
                                    let _ = gs.leave_group(&chat_id, user_id);
                                }
                                GroupUpdateType::MemberRemoved { user_id, .. } => {
                                    let _ = gs.remove_member(&chat_id, user_id);
                                }
                                GroupUpdateType::RoleChanged {
                                    user_id,
                                    new_role,
                                    changed_by,
                                } => {
                                    let role = match new_role.as_str() {
                                        "admin" => GroupRole::Admin,
                                        _ => GroupRole::Member,
                                    };
                                    let _ = gs.update_role(&chat_id, changed_by, user_id, role);
                                }
                                _ => {}
                            }
                        }
                        let _ = app_handle.emit("group-updated", &serde_json::json!({
                            "chatId": chat_id,
                            "senderId": sender_id,
                            "updateType": serde_json::to_value(&update_type).unwrap_or_default(),
                            "timestamp": timestamp,
                        }));
                    }
                    Ok(ProtocolMessage::CallOffer {
                        call_id,
                        chat_id,
                        caller_id,
                        caller_name,
                        callee_id,
                        call_type,
                        sdp,
                        timestamp,
                    }) => {
                        log::info!("Call offer from {} ({})", caller_name, call_id);
                        let _ = app_handle.emit(
                            "call-offer",
                            &serde_json::json!({
                                "callId": call_id,
                                "chatId": chat_id,
                                "callerId": caller_id,
                                "callerName": caller_name,
                                "calleeId": callee_id,
                                "callType": serde_json::to_value(&call_type).unwrap_or_default(),
                                "sdp": sdp,
                                "timestamp": timestamp,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::CallAnswer {
                        call_id,
                        caller_id: _,
                        sdp,
                    }) => {
                        log::info!("Call answer for {}", call_id);
                        let _ = app_handle.emit(
                            "call-answer",
                            &serde_json::json!({
                                "callId": call_id,
                                "sdp": sdp,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::IceCandidate {
                        call_id,
                        candidate,
                        sdp_mid,
                        sdp_m_line_index,
                    }) => {
                        log::debug!("ICE candidate for {}", call_id);
                        let _ = app_handle.emit(
                            "ice-candidate",
                            &serde_json::json!({
                                "callId": call_id,
                                "candidate": candidate,
                                "sdpMid": sdp_mid,
                                "sdpMLineIndex": sdp_m_line_index,
                            }),
                        );
                    }
                    Ok(ProtocolMessage::CallEnd { call_id, reason }) => {
                        log::info!("Call ended: {} ({:?})", call_id, reason);
                        let _ = app_handle.emit(
                            "call-end",
                            &serde_json::json!({
                                "callId": call_id,
                                "reason": serde_json::to_value(&reason).unwrap_or_default(),
                            }),
                        );
                    }
                    Ok(ProtocolMessage::CallReject { call_id }) => {
                        log::info!("Call rejected: {}", call_id);
                        let _ = app_handle.emit(
                            "call-reject",
                            &serde_json::json!({
                                "callId": call_id,
                            }),
                        );
                    }
                    Err(e) => {
                        log::error!("Failed to decode message from {}: {}", from_peer, e);
                    }
                }
            }
            // Also emit raw event for the networkStore
            let _ = app_handle.emit("network-event", &event);
        }
    });

    Ok(peer_id)
}

#[tauri::command]
fn connect_peer(
    command_tx: tauri::State<std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
    addr: String,
) -> Result<(), String> {
    let multiaddr: libp2p::Multiaddr = addr.parse().map_err(|_| "Invalid multiaddr")?;
    let cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.as_ref() {
        tx.send(NetworkCommand::AddPeer { addr: multiaddr })
            .map_err(|e| e.to_string())
    } else {
        Err("Network not started".to_string())
    }
}

#[tauri::command]
fn get_peers(
    network: tauri::State<std::sync::Mutex<NetworkService>>,
) -> Result<Vec<String>, String> {
    let net = network.lock().map_err(|e| e.to_string())?;
    Ok(net.get_peers())
}

#[tauri::command]
fn get_network_status(
    network: tauri::State<std::sync::Mutex<NetworkService>>,
) -> Result<NetworkStatus, String> {
    let net = network.lock().map_err(|e| e.to_string())?;
    if net.is_running() {
        Ok(NetworkStatus::Online {
            peer_count: net.get_peers().len(),
        })
    } else {
        Ok(NetworkStatus::Offline)
    }
}

#[tauri::command]
fn get_local_peer_id(
    network: tauri::State<std::sync::Mutex<NetworkService>>,
) -> Result<String, String> {
    let net = network.lock().map_err(|e| e.to_string())?;
    Ok(net.get_peer_id())
}

#[tauri::command]
fn stop_network(
    command_tx: tauri::State<std::sync::Mutex<Option<mpsc::UnboundedSender<NetworkCommand>>>>,
) -> Result<(), String> {
    let mut cmd = command_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = cmd.take() {
        tx.send(NetworkCommand::Stop).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

// === App Entry ===

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());

    // Self-updates only make sense for desktop bundles; Android uses stores/APK
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let data_dir = app.handle().path().app_data_dir()?;
            let storage = std::sync::Arc::new(StorageService::new(data_dir.clone())?);
            let encryption = EncryptionService::new(data_dir.clone())?;
            let key_exchange = KeyExchangeService::new(data_dir.clone())?;
            let file_service = FileTransferService::new(data_dir.clone())?;
            let group_service = GroupService::new(storage.clone());
            let network = NetworkService::new();

            // Load user profile from storage for in-memory state
            let initial_user = storage.get_user_profile().ok().flatten();

            app.manage(storage);
            app.manage(encryption);
            app.manage(key_exchange);
            app.manage(file_service);
            app.manage(group_service);
            app.manage(std::sync::Mutex::new(network));
            app.manage(std::sync::Mutex::new(
                None::<mpsc::UnboundedSender<NetworkCommand>>,
            ));
            app.manage(std::sync::Mutex::new(initial_user));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_current_user,
            create_user_profile,
            update_user_profile,
            get_chats,
            get_chat,
            create_chat,
            update_chat,
            delete_chat,
            get_messages,
            send_message,
            send_network_message,
            delete_message,
            search_messages,
            mark_messages_read,
            get_contacts,
            add_contact,
            remove_contact,
            block_contact,
            get_settings,
            update_settings,
            set_theme,
            toggle_dark_mode,
            get_public_key,
            get_public_key_hex,
            sign_data,
            verify_signature,
            encrypt_data,
            decrypt_data,
            get_x25519_public_key,
            get_x25519_public_key_hex,
            derive_shared_key,
            encrypt_for_peer,
            decrypt_from_peer,
            start_network,
            connect_peer,
            get_peers,
            get_network_status,
            get_local_peer_id,
            stop_network,
            send_file_message,
            get_file_path,
            save_file_to_downloads,
            write_temp_file,
            get_group_members,
            add_group_member,
            remove_group_member,
            leave_group,
            change_member_role,
            create_group_invite,
            join_group_via_invite,
            update_group_settings,
            send_call_offer,
            send_call_answer,
            send_ice_candidate,
            send_call_end,
            send_call_reject,
            get_temp_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
