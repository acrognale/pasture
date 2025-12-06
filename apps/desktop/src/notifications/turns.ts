import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

import { isTauriEnvironment } from '~/codex/events';

const UNTITLED = 'Untitled thread';

let permissionGranted: boolean | null = null;
let permissionRequestInFlight: Promise<boolean> | null = null;

const formatTitle = (prefix: string, threadTitle?: string | null): string =>
  `${prefix}: ${threadTitle?.trim() ? threadTitle.trim() : UNTITLED}`;

const normalizeBody = (body?: string | null): string | undefined => {
  if (!body) return undefined;
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const ensurePermission = async (): Promise<boolean> => {
  if (permissionGranted !== null) return permissionGranted;

  if (permissionRequestInFlight) {
    return permissionRequestInFlight;
  }

  permissionRequestInFlight = (async () => {
    const granted = (await isPermissionGranted())
      ? true
      : (await requestPermission()) === 'granted';
    permissionGranted = granted;
    return granted;
  })();

  try {
    return await permissionRequestInFlight;
  } finally {
    permissionRequestInFlight = null;
  }
};

const appWindowNotFocused = async (): Promise<boolean> => {
  try {
    const window = getCurrentWindow();
    return !(await window.isFocused());
  } catch (error) {
    console.warn('Failed to determine window focus state; defaulting to notify', error);
    return true;
  }
};

const shouldNotify = async (): Promise<boolean> => {
  if (!isTauriEnvironment()) return false;
  if (!(await appWindowNotFocused())) return false;
  return ensurePermission();
};

type TurnNotificationPayload = {
  threadTitle?: string | null;
  body?: string | null;
};

export const notifyTurnFinished = async (
  payload: TurnNotificationPayload
): Promise<void> => {
  if (!(await shouldNotify())) return;

  sendNotification({
    title: formatTitle('Turn finished', payload.threadTitle),
    body: normalizeBody(payload.body),
  });
};

export const notifyTurnError = async (
  payload: TurnNotificationPayload
): Promise<void> => {
  if (!(await shouldNotify())) return;

  sendNotification({
    title: formatTitle('Turn failed', payload.threadTitle),
    body: normalizeBody(payload.body) ?? 'Check the turn for details.',
  });
};

/**
 * Prompt for notification permission early in app startup (no-op outside Tauri).
 * Safe to call multiple times; permission requests are deduped.
 */
export const warmUpNotificationPermission = async (): Promise<boolean> => {
  if (!isTauriEnvironment()) return false;
  try {
    return await ensurePermission();
  } catch (error) {
    console.warn('Failed to preflight notification permission', error);
    return false;
  }
};
