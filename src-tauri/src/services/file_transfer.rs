use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashMap;

use crate::models::*;

const CHUNK_SIZE: usize = 64 * 1024; // 64KB

pub struct FileTransferService {
    storage_dir: PathBuf,
    /// Incoming transfers: message_id -> (metadata, received_chunks)
    incoming: Mutex<HashMap<String, (FileMetadata, Vec<Option<Vec<u8>>>)>>,
}

impl FileTransferService {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        let storage_dir = data_dir.join("files");
        let temp_dir = data_dir.join("tmp");
        std::fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

        let _ = temp_dir; // temp_dir created but unused until needed
        Ok(Self {
            storage_dir,
            incoming: Mutex::new(HashMap::new()),
        })
    }

    /// Read a file from disk and split into chunks
    pub fn chunk_file(&self, file_path: &str) -> Result<(FileMetadata, Vec<Vec<u8>>), String> {
        let path = std::path::Path::new(file_path);
        let data = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
        let file_size = data.len() as u64;
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
        let mime_type = mime_from_extension(&ext);
        let chunk_count = ((data.len() + CHUNK_SIZE - 1) / CHUNK_SIZE) as u32;

        let thumbnail = if mime_type.starts_with("image/") {
            generate_thumbnail(&data)
        } else {
            None
        };

        let chunks: Vec<Vec<u8>> = data
            .chunks(CHUNK_SIZE)
            .map(|c| c.to_vec())
            .collect();

        let metadata = FileMetadata {
            file_name,
            file_size,
            mime_type,
            chunk_count,
            thumbnail,
        };

        Ok((metadata, chunks))
    }

    /// Register an incoming file transfer
    pub fn start_incoming(&self, message_id: &str, metadata: FileMetadata) {
        let chunk_count = metadata.chunk_count as usize;
        let mut incoming = self.incoming.lock().unwrap_or_else(|e| e.into_inner());
        incoming.insert(message_id.to_string(), (metadata, vec![None; chunk_count]));
    }

    /// Store an incoming chunk
    pub fn receive_chunk(&self, message_id: &str, chunk_index: u32, data: Vec<u8>) -> Result<f32, String> {
        let mut incoming = self.incoming.lock().unwrap_or_else(|e| e.into_inner());
        let (_metadata, chunks) = incoming
            .get_mut(message_id)
            .ok_or("No incoming transfer for this message")?;

        let idx = chunk_index as usize;
        if idx >= chunks.len() {
            return Err("Chunk index out of bounds".to_string());
        }

        chunks[idx] = Some(data);

        let received = chunks.iter().filter(|c| c.is_some()).count() as f32;
        let total = chunks.len() as f32;
        Ok(received / total)
    }

    /// Reassemble the file from chunks and save to storage
    pub fn complete_transfer(&self, message_id: &str) -> Result<String, String> {
        let mut incoming = self.incoming.lock().unwrap_or_else(|e| e.into_inner());
        let (metadata, chunks) = incoming
            .remove(message_id)
            .ok_or("No incoming transfer for this message")?;

        // Verify all chunks received and reassemble
        let mut file_data = Vec::with_capacity(metadata.file_size as usize);
        for (i, chunk) in chunks.iter().enumerate() {
            let chunk = chunk.as_ref().ok_or_else(|| format!("Missing chunk {}", i))?;
            file_data.extend_from_slice(chunk);
        }

        // Save to storage
        let file_path = self.storage_dir.join(format!("{}_{}", message_id, metadata.file_name));
        std::fs::write(&file_path, &file_data)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(file_path.to_string_lossy().to_string())
    }

    /// Save a file to the storage directory and return the path
    pub fn save_file(&self, message_id: &str, file_name: &str, data: &[u8]) -> Result<String, String> {
        let file_path = self.storage_dir.join(format!("{}_{}", message_id, file_name));
        std::fs::write(&file_path, data)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(file_path.to_string_lossy().to_string())
    }

    /// Get the path to a stored file
    pub fn get_file_path(&self, message_id: &str, file_name: &str) -> Option<String> {
        let path = self.storage_dir.join(format!("{}_{}", message_id, file_name));
        if path.exists() {
            Some(path.to_string_lossy().to_string())
        } else {
            None
        }
    }

}

fn mime_from_extension(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "opus" => "audio/opus",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "pdf" => "application/pdf",
        "doc" | "docx" => "application/msword",
        "xls" | "xlsx" => "application/vnd.ms-excel",
        "zip" => "application/zip",
        "7z" => "application/x-7z-compressed",
        "tar" => "application/x-tar",
        "gz" => "application/gzip",
        "txt" => "text/plain",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn generate_thumbnail(image_data: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(image_data).ok()?;
    let thumb = img.thumbnail(128, 128);
    let mut buf = std::io::Cursor::new(Vec::new());
    thumb.write_to(&mut buf, image::ImageFormat::Jpeg).ok()?;
    Some(buf.into_inner())
}
