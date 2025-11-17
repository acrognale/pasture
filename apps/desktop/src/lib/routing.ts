/**
 * Utilities for encoding/decoding workspace paths in URLs.
 * Workspace paths can contain special characters, so we use base64url encoding.
 */

export const encodeWorkspaceId = (workspacePath: string): string => {
  // Convert to base64url (URL-safe base64)
  const base64 = btoa(unescape(encodeURIComponent(workspacePath)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export const decodeWorkspaceId = (encoded: string): string => {
  try {
    // Convert from base64url to base64
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    // Fallback: try treating as plain path (for backwards compatibility)
    return encoded;
  }
};
