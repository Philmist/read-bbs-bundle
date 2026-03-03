/**
 * Runtime Twitch authentication state persisted in a Replicant.
 */
export interface TwitchAuthState {
  version: 1;
  status: 'disabled' | 'misconfigured' | 'starting' | 'running' | 'error';
  tokenSource: 'none' | 'config' | 'replicant' | 'refresh';
  userId: string | null;
  token: null | {
    accessToken: string;
    refreshToken: string | null;
    scope: string[];
    expiresIn: number | null;
    obtainmentTimestamp: number;
  };
  updatedAt: string;
  lastRefreshAt: string | null;
  lastError: string | null;
}
