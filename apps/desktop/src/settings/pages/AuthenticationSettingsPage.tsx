import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';

export function AuthenticationSettingsPage() {
  const queryClient = useQueryClient();
  const authState = useAuthState();
  const [anthropicVerifier, setAnthropicVerifier] = useState<string | null>(
    null
  );
  const [anthropicAuthUrl, setAnthropicAuthUrl] = useState<string | null>(null);
  const [anthropicCode, setAnthropicCode] = useState('');

  const anthropicStatus = useQuery({
    queryKey: ['anthropic-oauth-status'] as const,
    queryFn: () => Codex.anthropicOauthStatus(),
    staleTime: Infinity,
  });

  const anthropicAuthorize = useMutation({
    mutationFn: async () => Codex.anthropicOauthAuthorize(),
    onSuccess: (result) => {
      setAnthropicVerifier(result.verifier);
      setAnthropicAuthUrl(result.url);
      setAnthropicCode('');
      toast.success('Claude Code authorization started.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to start Claude Code authorization.', {
        description,
      });
    },
  });

  const anthropicExchange = useMutation({
    mutationFn: async () => {
      if (!anthropicVerifier) {
        throw new Error('Missing verifier. Start login again.');
      }
      const code = anthropicCode.trim();
      if (!code) {
        throw new Error('Paste the code from Claude Code login.');
      }
      return Codex.anthropicOauthExchange({
        code,
        verifier: anthropicVerifier,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['anthropic-oauth-status'],
      });
      toast.success('Claude Code connected.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to complete Claude Code login.', { description });
    },
  });

  const anthropicLogout = useMutation({
    mutationFn: async () => Codex.anthropicOauthLogout(),
    onSuccess: async () => {
      setAnthropicVerifier(null);
      setAnthropicAuthUrl(null);
      setAnthropicCode('');
      await queryClient.invalidateQueries({
        queryKey: ['anthropic-oauth-status'],
      });
      toast.success('Claude Code disconnected.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to disconnect Claude Code.', { description });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Codex (OpenAI)</span>
            <span className="text-xs text-muted-foreground">
              Used for OpenAI models. Anthropic models can use Claude Code login
              below.
            </span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Status:{' '}
          {authState.isLoading
            ? 'Loading…'
            : authState.data?.isAuthenticated
              ? `Signed in${
                  authState.data.email ? ` as ${authState.data.email}` : ''
                }`
              : 'Not signed in'}
        </div>
        {authState.data?.lastError ? (
          <div className="text-xs text-error-foreground">
            {authState.data.lastError}
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60 pt-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Claude Code</span>
            <span className="text-xs text-muted-foreground">
              Connect using your Claude Code OAuth credentials. Pasture
              refreshes tokens automatically.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={anthropicAuthorize.isPending}
              onClick={() => anthropicAuthorize.mutate()}
            >
              Start login
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                anthropicLogout.isPending ||
                !(anthropicStatus.data?.isAuthenticated ?? false)
              }
              onClick={() => anthropicLogout.mutate()}
            >
              Disconnect
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Status:{' '}
          {anthropicStatus.isLoading
            ? 'Loading…'
            : anthropicStatus.data?.isAuthenticated
              ? anthropicStatus.data.isExpired
                ? 'Connected (expired; will refresh on use)'
                : 'Connected'
              : 'Not connected'}
        </div>
        {anthropicStatus.data?.lastError ? (
          <div className="text-xs text-error-foreground">
            {anthropicStatus.data.lastError}
          </div>
        ) : null}

        {anthropicAuthUrl ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              1) Open this URL in your browser and complete login.
            </div>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground"
                readOnly
                value={anthropicAuthUrl}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(anthropicAuthUrl);
                      toast.success('Copied authorization URL.');
                    } catch (error) {
                      const description =
                        error instanceof Error ? error.message : 'Copy failed.';
                      toast.error('Failed to copy URL.', {
                        description,
                      });
                    }
                  })();
                }}
              >
                Copy
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              2) Paste the code you receive here.
            </div>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground"
                placeholder="Paste code…"
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={anthropicExchange.isPending}
                onClick={() => anthropicExchange.mutate()}
              >
                Complete
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Start login to get an authorization link.
          </div>
        )}
      </div>
    </div>
  );
}
