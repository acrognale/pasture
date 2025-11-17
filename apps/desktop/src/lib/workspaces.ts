export const normalizeWorkspaceSlashes = (value: string): string =>
  value.replace(/\\/g, '/');

export const trimWorkspaceTrailingSeparators = (value: string): string => {
  let result = value;

  while (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
};

export const formatWorkspaceLabel = (workspacePath: string): string => {
  const normalized = trimWorkspaceTrailingSeparators(
    normalizeWorkspaceSlashes(workspacePath)
  );

  if (!normalized) {
    return 'Workspace';
  }

  const segments = normalized.split('/').filter(Boolean);
  const name = segments[segments.length - 1];

  return name ?? normalized;
};

const SESSION_PREVIEW_MAX_LENGTH = 24;

export const formatSessionPreview = (
  value: string | null | undefined
): string => {
  if (!value) {
    return 'Untitled session';
  }

  if (value.length <= SESSION_PREVIEW_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, SESSION_PREVIEW_MAX_LENGTH - 1)}…`;
};
