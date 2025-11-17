import { type ShortcutDefinition } from './types';

export type KeyboardPlatform = 'mac' | 'windows' | 'linux';

export type NormalizedChord = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  space: ' ',
  spacebar: ' ',
};

export function detectPlatform(): KeyboardPlatform {
  const platform = getNavigatorPlatform();
  if (/mac|iphone|ipad|ipod/i.test(platform)) {
    return 'mac';
  }
  if (/win/i.test(platform)) {
    return 'windows';
  }
  return 'linux';
}

function getNavigatorPlatform(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }
  const nav = navigator as NavigatorWithUAData;
  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform;
  }
  if (typeof nav.platform === 'string') {
    return nav.platform;
  }
  return '';
}

export function isTargetEditable(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  if (typeof HTMLElement === 'undefined') {
    return false;
  }

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function eventToChord(event: KeyboardEvent): NormalizedChord {
  return {
    key: normalizeEventKey(event.key),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function parseShortcut(
  chord: string,
  platform: KeyboardPlatform
): NormalizedChord {
  const tokens = chord
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  const normalized: NormalizedChord = {
    key: '',
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
  };

  tokens.forEach((token) => {
    const lower = token.toLowerCase();
    switch (lower) {
      case 'cmdorctrl':
        if (platform === 'mac') {
          normalized.meta = true;
        } else {
          normalized.ctrl = true;
        }
        break;
      case 'cmd':
      case 'command':
      case 'meta':
        normalized.meta = true;
        break;
      case 'ctrl':
      case 'control':
        normalized.ctrl = true;
        break;
      case 'alt':
      case 'option':
        normalized.alt = true;
        break;
      case 'shift':
        normalized.shift = true;
        break;
      default:
        normalized.key = normalizeEventKey(token);
        break;
    }
  });

  return normalized;
}

export function chordsMatch(a: NormalizedChord, b: NormalizedChord): boolean {
  return (
    a.key === b.key &&
    a.meta === b.meta &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift
  );
}

export function normalizeEventKey(key: string | undefined | null): string {
  if (!key) {
    return '';
  }
  const alias = KEY_ALIASES[key.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (key.length === 1) {
    return key.toLowerCase();
  }

  return key;
}

export function formatShortcutLabel(
  definition: ShortcutDefinition,
  platform: KeyboardPlatform
): string {
  const tokens = definition.chord
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens
    .map((token) => {
      switch (token.toLowerCase()) {
        case 'cmdorctrl':
          return platform === 'mac' ? '⌘' : 'Ctrl';
        case 'cmd':
        case 'command':
        case 'meta':
          return '⌘';
        case 'ctrl':
        case 'control':
          return platform === 'mac' ? '⌃' : 'Ctrl';
        case 'shift':
          return platform === 'mac' ? '⇧' : 'Shift';
        case 'alt':
          return platform === 'mac' ? '⌥' : 'Alt';
        default:
          return token.length === 1 ? token.toUpperCase() : capitalize(token);
      }
    })
    .join(platform === 'mac' ? '' : ' + ');
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
