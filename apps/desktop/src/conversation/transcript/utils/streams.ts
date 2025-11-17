export const decodeBase64ToUint8Array = (input: string): Uint8Array => {
  const nodeBuffer = (globalThis as Record<string, unknown>).Buffer as
    | {
        from(data: string, encoding: 'base64'): Uint8Array;
      }
    | undefined;

  if (nodeBuffer) {
    return Uint8Array.from(nodeBuffer.from(input, 'base64'));
  }

  const decoder =
    typeof globalThis.atob === 'function' ? globalThis.atob : null;

  if (!decoder) {
    throw new Error('Base64 decoding is unavailable in this environment.');
  }

  const binary = decoder(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
