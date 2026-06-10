import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import i18n from '../i18n';

let granted = false;
let unlisteners: UnlistenFn[] = [];

export async function initNotifications() {
  try {
    let perm = await isPermissionGranted();
    if (!perm) {
      const result = await requestPermission();
      perm = result === 'granted';
    }
    granted = perm;
  } catch (e) {
    console.warn('Notification permission error:', e);
  }
}

export function notify(title: string, body: string) {
  if (!granted) return;
  try {
    sendNotification({ title, body });
  } catch (e) {
    console.warn('Notification error:', e);
  }
}

export async function setupMessageNotifications() {
  // Clean up old listeners
  unlisteners.forEach(u => u());
  unlisteners = [];

  unlisteners.push(
    await listen<{ chatId: string; senderName: string; content: string; messageType: string }>(
      'incoming-message',
      (event) => {
        const { senderName, content, messageType } = event.payload;
        if (document.hasFocus()) return;

        let body = content || '';
        if (messageType === 'image') body = `📷 ${i18n.t('chat.msgPhoto')}`;
        else if (messageType === 'file') body = `📎 ${i18n.t('chat.msgFile')}`;
        else if (messageType === 'voice') body = `🎤 ${i18n.t('chat.msgVoice')}`;
        else if (messageType === 'video') body = `🎬 ${i18n.t('chat.msgVideo')}`;

        notify(senderName || i18n.t('chat.newMessage'), body);
      }
    )
  );

  unlisteners.push(
    await listen<{ callId: string; callerName: string; callType: string }>(
      'call-offer',
      (event) => {
        const { callerName, callType } = event.payload;
        const type = callType === 'video' ? i18n.t('call.video') : i18n.t('call.audio');
        notify(type, `${callerName} — ${i18n.t('call.calling')}`);
      }
    )
  );

  unlisteners.push(
    await listen<{ contactName: string }>(
      'peer-connected',
      (event) => {
        const { contactName } = event.payload;
        if (contactName) {
          notify(contactName, i18n.t('chat.online'));
        }
      }
    )
  );

  unlisteners.push(
    await listen<{ chatId: string; fileName: string; senderName: string }>(
      'file-offer',
      (event) => {
        const { senderName, fileName } = event.payload;
        notify(senderName || i18n.t('chat.newMessage'), `${i18n.t('file.file')}: ${fileName}`);
      }
    )
  );
}

export function cleanupNotifications() {
  unlisteners.forEach(u => u());
  unlisteners = [];
}
