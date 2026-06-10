import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';
import i18n from '@/i18n';
import { toast } from '@/stores/toastStore';

/**
 * Check GitHub Releases for a newer version; on consent, download,
 * install and relaunch. No-ops on platforms without the updater
 * (Android) or when offline.
 */
export async function checkForUpdates(): Promise<void> {
  let update;
  try {
    update = await check();
  } catch {
    // Updater unavailable (mobile) or network down — fail silently
    return;
  }
  if (!update) return;

  const wantsUpdate = await ask(
    i18n.t('updater.available', { version: update.version }),
    { title: 'Pulse', kind: 'info' }
  );
  if (!wantsUpdate) return;

  try {
    toast.info(i18n.t('updater.downloading'));
    await update.downloadAndInstall();
    const wantsRestart = await ask(i18n.t('updater.restartPrompt'), {
      title: 'Pulse',
      kind: 'info',
    });
    if (wantsRestart) await relaunch();
  } catch (error) {
    toast.error(i18n.t('updater.failed', { error: String(error) }));
  }
}
