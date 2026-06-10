import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileIcon, Play, Pause } from 'lucide-react';
import { Message } from '@/types';
import { useFileStore } from '@/stores/fileStore';
import { convertFileSrc } from '@tauri-apps/api/core';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

interface FileMessageProps {
  message: Message;
  isOwn: boolean;
}

export function FileMessage({ message, isOwn }: FileMessageProps) {
  const { t } = useTranslation();
  const { getFileUrl, saveToDownloads } = useFileStore();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

  const meta = (message.metadata || {}) as Record<string, unknown>;
  const fileSize = (meta.fileSize as number) || 0;
  const mimeType = (meta.mimeType as string) || 'application/octet-stream';
  const fileName = message.content || 'file';

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const load = async () => {
      const path = message.mediaUrl || (await getFileUrl(message.id, fileName));
      if (path && !cancelled) {
        if (mimeType.startsWith('audio/')) {
          // WebKitGTK won't stream audio from the asset protocol —
          // hand the element a blob instead
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs');
            const data = await readFile(path);
            objectUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
            if (!cancelled) setFileUrl(objectUrl);
          } catch {
            if (!cancelled) setFileUrl(convertFileSrc(path));
          }
        } else {
          setFileUrl(convertFileSrc(path));
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.mediaUrl, fileName]);

  const handleDownload = async () => {
    try {
      await saveToDownloads(message.id, fileName);
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-2 opacity-50">
        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
        <span className="text-sm">{t('file.downloading')}</span>
      </div>
    );
  }

  // Image
  if (mimeType.startsWith('image/') && fileUrl) {
    return (
      <div className="max-w-xs">
        {viewerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setViewerOpen(false)}
          >
            <img src={fileUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <img
          src={fileUrl}
          alt={fileName}
          className="rounded-lg max-h-64 object-cover cursor-zoom-in"
          onClick={() => setViewerOpen(true)}
        />
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-xs opacity-60">{fileName}</span>
          <button onClick={handleDownload} className="p-1 hover:bg-white/10 rounded" title={t('file.download')}>
            <Download size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Video
  if (mimeType.startsWith('video/') && fileUrl) {
    return (
      <div className="max-w-xs">
        <video
          src={fileUrl}
          controls
          className="rounded-lg max-h-64"
          preload="metadata"
        />
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-xs opacity-60">{fileName}</span>
          <button onClick={handleDownload} className="p-1 hover:bg-white/10 rounded" title={t('file.download')}>
            <Download size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Audio / Voice
  if (mimeType.startsWith('audio/') && fileUrl) {
    return <VoiceMessage fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} onDownload={handleDownload} />;
  }

  // Generic file
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
        isOwn ? 'bg-blue-600/20' : 'bg-white/5'
      } hover:brightness-110 transition`}
      onClick={handleDownload}
    >
      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        <FileIcon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs opacity-60">{formatFileSize(fileSize)}</p>
      </div>
      <Download size={16} className="opacity-40 flex-shrink-0" />
    </div>
  );
}

function VoiceMessage({ fileUrl, fileName: _fileName, fileSize, onDownload: _onDownload }: {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  onDownload: () => void;
}) {
  // Web Audio instead of <audio>: MediaRecorder WebM has no duration
  // metadata, which breaks media elements (Infinity/NaN, silent playback
  // in WebKitGTK). Decoding gives the real duration and reliable output.
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(fileUrl);
        const bytes = await resp.arrayBuffer();
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(bytes);
        if (cancelled) {
          void ctx.close();
          return;
        }
        ctxRef.current = ctx;
        bufferRef.current = buffer;
        setDuration(buffer.duration);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.stop();
      void ctxRef.current?.close();
    };
  }, [fileUrl]);

  const stopPlayback = () => {
    cancelAnimationFrame(rafRef.current);
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    setPlaying(false);
    setProgress(0);
  };

  const togglePlay = async () => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    if (playing) {
      stopPlayback();
      return;
    }
    // Autoplay policy: contexts created outside a user gesture start
    // suspended and play silence
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = stopPlayback;
    source.start();
    sourceRef.current = source;
    startedAtRef.current = ctx.currentTime;
    setPlaying(true);
    const tick = () => {
      const elapsed = ctx.currentTime - startedAtRef.current;
      setProgress(Math.min(elapsed / buffer.duration, 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 p-2 min-w-[200px]">
      <button
        onClick={togglePlay}
        disabled={error || !duration}
        className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition disabled:opacity-50"
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] opacity-50">
            {duration > 0 ? formatTime(duration) : formatFileSize(fileSize)}
          </span>
          {duration > 0 && (
            <span className="text-[10px] opacity-50">{formatTime(progress * duration)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
