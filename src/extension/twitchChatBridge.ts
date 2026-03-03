import type NodeCG from 'nodecg/types';
import type { ChatBridgeMessage, TwitchAuthState } from '../types/schemas';

const DEFAULT_OUTGOING_MESSAGE_NAME = 'chat:bridge:message';
const DEDUPE_LIMIT = 1000;
const TWITCH_AUTH_REPLICANT_NAME = 'twitchAuthState';

interface BundleConfig {
	twitchChat?: TwitchChatConfig;
}

interface TwitchChatConfig {
	enabled?: boolean;
	clientId?: string;
	clientSecret?: string;
	broadcasterUserId?: string;
	broadcasterUserLogin?: string;
	readAsUserId?: string;
	messageName?: string;
	debug?: boolean;
	initialToken?: TwitchInitialTokenConfig;
}

interface TwitchInitialTokenConfig {
	accessToken?: string;
	refreshToken?: string;
	scope?: readonly string[];
	expiresIn?: number | null;
	obtainmentTimestamp?: number;
}

interface TwurpleModules {
	ApiClient: new (options: { authProvider: unknown }) => unknown;
	RefreshingAuthProvider: new (options: {
		clientId: string;
		clientSecret: string;
	}) => TwurpleRefreshingAuthProvider;
	EventSubWsListener: new (options: { apiClient: unknown }) => TwurpleEventSubWsListener;
}

interface TwurpleRefreshingAuthProvider {
	addUserForToken: (token: TwurpleAccessToken) => Promise<string>;
	onRefresh: (handler: (userId: string, token: TwurpleAccessToken) => void) => void;
	onRefreshFailure: (handler: (userId: string, error: Error) => void) => void;
}

interface TwurpleEventSubWsListener {
	start: () => void;
	onChannelChatMessage: (
		broadcasterUserId: string,
		readAsUserId: string,
		handler: (event: unknown) => void,
	) => Promise<unknown>;
	on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
}

interface TwurpleAccessToken {
	accessToken: string;
	refreshToken: string | null;
	scope: string[];
	expiresIn: number | null;
	obtainmentTimestamp: number;
}

type TokenSource = 'none' | 'config' | 'replicant' | 'refresh';

interface BootstrapToken {
	token: TwurpleAccessToken;
	source: 'config' | 'replicant';
}

export function setupTwitchChatBridge(nodecg: NodeCG.ServerAPI<BundleConfig>): void {
	const authStateReplicant = nodecg.Replicant<TwitchAuthState>(TWITCH_AUTH_REPLICANT_NAME, {
		defaultValue: createDefaultAuthState(),
	});
	const config = nodecg.bundleConfig?.twitchChat;
	if (!config || config.enabled === false) {
		setAuthState(authStateReplicant, {
			status: 'disabled',
			tokenSource: 'none',
			lastError: null,
		});
		nodecg.log.info('[twitch-chat] Disabled by configuration.');
		return;
	}

	const required = resolveRequiredConfig(config);
	if (!required) {
		setAuthState(authStateReplicant, {
			status: 'misconfigured',
			tokenSource: 'none',
			lastError: 'Missing required twitchChat settings.',
		});
		nodecg.log.warn('[twitch-chat] Missing required configuration. Bridge is disabled.');
		return;
	}

	const twurple = loadTwurpleModules(nodecg);
	if (!twurple) {
		setAuthState(authStateReplicant, {
			status: 'error',
			tokenSource: 'none',
			lastError: 'Failed to load Twurple modules.',
		});
		return;
	}

	const bootstrapToken = resolveBootstrapToken(authStateReplicant.value?.token, config.initialToken);
	if (!bootstrapToken) {
		setAuthState(authStateReplicant, {
			status: 'misconfigured',
			tokenSource: 'none',
			lastError: 'No valid token found in Replicant or twitchChat.initialToken.',
		});
		nodecg.log.warn('[twitch-chat] Missing valid initial token. Bridge is disabled.');
		return;
	}

	if (!bootstrapToken.token.refreshToken) {
		setAuthState(authStateReplicant, {
			status: 'misconfigured',
			tokenSource: bootstrapToken.source,
			token: bootstrapToken.token,
			lastError: 'Refresh token is required for automatic token renewal.',
		});
		nodecg.log.warn('[twitch-chat] Refresh token is missing. Bridge is disabled.');
		return;
	}

	const { clientId, clientSecret, broadcasterUserId, readAsUserId } = required;
	const outgoingMessageName = normalizeOptionalString(config.messageName) ?? DEFAULT_OUTGOING_MESSAGE_NAME;
	const broadcasterLogin = normalizeOptionalString(config.broadcasterUserLogin) ?? broadcasterUserId;
	const recentMessageIds = new Set<string>();
	const recentMessageOrder: string[] = [];
	const debugEnabled = config.debug === true;
	setAuthState(authStateReplicant, {
		status: 'starting',
		tokenSource: bootstrapToken.source,
		token: bootstrapToken.token,
		lastError: null,
	});

	void (async () => {
		try {
			const authProvider = new twurple.RefreshingAuthProvider({
				clientId,
				clientSecret,
			});

			authProvider.onRefresh((userId, token) => {
				const currentRefreshToken =
					authStateReplicant.value?.token && authStateReplicant.value.token !== null
						? authStateReplicant.value.token.refreshToken
						: null;
				const persistedToken: TwurpleAccessToken = {
					...token,
					refreshToken: token.refreshToken ?? currentRefreshToken,
				};

				setAuthState(authStateReplicant, {
					status: 'running',
					tokenSource: 'refresh',
					userId,
					token: persistedToken,
					lastRefreshAt: new Date().toISOString(),
					lastError: null,
				});

				if (debugEnabled) {
					nodecg.log.info('[twitch-chat] OAuth token refreshed and persisted to Replicant.');
				}
			});

			authProvider.onRefreshFailure((userId, error) => {
				setAuthState(authStateReplicant, {
					status: 'error',
					userId,
					lastError: `Token refresh failed: ${getErrorMessage(error)}`,
				});
				nodecg.log.error(`[twitch-chat] Token refresh failed for user ${userId}: ${getErrorMessage(error)}`);
			});

			const resolvedUserId = await authProvider.addUserForToken(bootstrapToken.token);
			if (resolvedUserId !== readAsUserId) {
				nodecg.log.warn(
					`[twitch-chat] readAsUserId (${readAsUserId}) does not match token user (${resolvedUserId}).`,
				);
			}
			setAuthState(authStateReplicant, {
				status: 'starting',
				userId: resolvedUserId,
				lastError: null,
			});

			const apiClient = new twurple.ApiClient({ authProvider });
			const listener = new twurple.EventSubWsListener({ apiClient });

			registerListenerLogs(nodecg, listener);
			listener.start();
			nodecg.log.info('[twitch-chat] EventSub WebSocket listener started.');

			await listener.onChannelChatMessage(broadcasterUserId, readAsUserId, (event) => {
				handleChannelChatMessage({
					nodecg,
					event,
					outgoingMessageName,
					broadcasterUserId,
					broadcasterLogin,
					debugEnabled,
					recentMessageIds,
					recentMessageOrder,
				});
			});

			setAuthState(authStateReplicant, {
				status: 'running',
				lastError: null,
			});
			nodecg.log.info('[twitch-chat] Subscribed to channel.chat.message.');
		} catch (error) {
			setAuthState(authStateReplicant, {
				status: 'error',
				lastError: `Initialization failed: ${getErrorMessage(error)}`,
			});
			nodecg.log.error(`[twitch-chat] Failed to initialize: ${getErrorMessage(error)}`);
		}
	})();
}

function resolveRequiredConfig(config: TwitchChatConfig): {
	clientId: string;
	clientSecret: string;
	broadcasterUserId: string;
	readAsUserId: string;
} | null {
	const clientId = normalizeOptionalString(config.clientId);
	const clientSecret = normalizeOptionalString(config.clientSecret);
	const broadcasterUserId = normalizeOptionalString(config.broadcasterUserId);
	const readAsUserId = normalizeOptionalString(config.readAsUserId);
	if (!clientId || !clientSecret || !broadcasterUserId || !readAsUserId) {
		return null;
	}

	return {
		clientId,
		clientSecret,
		broadcasterUserId,
		readAsUserId,
	};
}

function loadTwurpleModules(nodecg: NodeCG.ServerAPI<BundleConfig>): TwurpleModules | null {
	try {
		const { ApiClient } = require('@twurple/api') as TwurpleModules;
		const { RefreshingAuthProvider } = require('@twurple/auth') as TwurpleModules;
		const { EventSubWsListener } = require('@twurple/eventsub-ws') as TwurpleModules;
		return {
			ApiClient,
			RefreshingAuthProvider,
			EventSubWsListener,
		};
	} catch (error) {
		nodecg.log.error(
			`[twitch-chat] Failed to load Twurple modules. Install @twurple/api @twurple/auth @twurple/eventsub-ws. ${getErrorMessage(
				error,
			)}`,
		);
		return null;
	}
}

function resolveBootstrapToken(
	replicantToken: TwitchAuthState['token'] | undefined,
	initialTokenConfig: TwitchInitialTokenConfig | undefined,
): BootstrapToken | null {
	const parsedReplicantToken = parseTokenValue(replicantToken);
	if (parsedReplicantToken) {
		return {
			token: parsedReplicantToken,
			source: 'replicant',
		};
	}

	const parsedConfigToken = parseInitialTokenConfig(initialTokenConfig);
	if (!parsedConfigToken) {
		return null;
	}

	return {
		token: parsedConfigToken,
		source: 'config',
	};
}

function parseInitialTokenConfig(value: TwitchInitialTokenConfig | undefined): TwurpleAccessToken | null {
	if (!value) {
		return null;
	}

	const accessToken = normalizeOptionalString(value.accessToken);
	const refreshToken = normalizeOptionalString(value.refreshToken) ?? null;
	const scope = normalizeStringArray(value.scope);
	const expiresIn = normalizeNonNegativeInteger(value.expiresIn);
	const obtainmentTimestamp =
		normalizeNonNegativeInteger(value.obtainmentTimestamp) ?? normalizeNonNegativeInteger(Date.now());
	if (!accessToken || obtainmentTimestamp === null) {
		return null;
	}

	return {
		accessToken,
		refreshToken,
		scope,
		expiresIn,
		obtainmentTimestamp,
	};
}

function parseTokenValue(value: unknown): TwurpleAccessToken | null {
	if (!isObject(value)) {
		return null;
	}

	const accessToken = normalizeOptionalString(value.accessToken);
	if (!accessToken) {
		return null;
	}

	const refreshToken = value.refreshToken === null ? null : normalizeOptionalString(value.refreshToken) ?? null;
	const scope = normalizeStringArray(value.scope);
	const expiresIn = normalizeNonNegativeInteger(value.expiresIn);
	const obtainmentTimestamp = normalizeNonNegativeInteger(value.obtainmentTimestamp);
	if (obtainmentTimestamp === null) {
		return null;
	}

	return {
		accessToken,
		refreshToken,
		scope,
		expiresIn,
		obtainmentTimestamp,
	};
}

function createDefaultAuthState(): TwitchAuthState {
	return {
		version: 1,
		status: 'disabled',
		tokenSource: 'none',
		userId: null,
		token: null,
		updatedAt: new Date(0).toISOString(),
		lastRefreshAt: null,
		lastError: null,
	};
}

function setAuthState(
	replicant: { value: TwitchAuthState | undefined },
	patch: Partial<TwitchAuthState>,
): void {
	const current = replicant.value ?? createDefaultAuthState();
	replicant.value = {
		...current,
		...patch,
		version: 1,
		status: (patch.status ?? current.status) as TwitchAuthState['status'],
		tokenSource: (patch.tokenSource ?? current.tokenSource ?? 'none') as TokenSource,
		updatedAt: new Date().toISOString(),
	};
}

function registerListenerLogs(nodecg: NodeCG.ServerAPI<BundleConfig>, listener: TwurpleEventSubWsListener): void {
	if (typeof listener.on !== 'function') {
		return;
	}

	listener.on('connect', () => {
		nodecg.log.info('[twitch-chat] EventSub WebSocket connected.');
	});

	listener.on('disconnect', () => {
		nodecg.log.warn('[twitch-chat] EventSub WebSocket disconnected.');
	});

	listener.on('reconnect', () => {
		nodecg.log.warn('[twitch-chat] EventSub WebSocket reconnecting.');
	});

	listener.on('error', (error: unknown) => {
		nodecg.log.error(`[twitch-chat] Listener error: ${getErrorMessage(error)}`);
	});
}

function handleChannelChatMessage(input: {
	nodecg: NodeCG.ServerAPI<BundleConfig>;
	event: unknown;
	outgoingMessageName: string;
	broadcasterUserId: string;
	broadcasterLogin: string;
	debugEnabled: boolean;
	recentMessageIds: Set<string>;
	recentMessageOrder: string[];
}): void {
	const { nodecg, event, outgoingMessageName, broadcasterUserId, broadcasterLogin, debugEnabled } = input;
	if (!isObject(event)) {
		nodecg.log.warn('[twitch-chat] Ignored non-object chat message event.');
		return;
	}

	const eventMessageId = getString(event.messageId);
	const messageId = eventMessageId || `generated-${Date.now()}`;
	if (input.recentMessageIds.has(messageId)) {
		return;
	}

	const messageText = getString(event.messageText) ?? '';
	const authorId = getString(event.chatterId) ?? 'unknown-user-id';
	const authorLogin = getString(event.chatterName) ?? 'unknown-user-login';
	const authorDisplayName = getString(event.chatterDisplayName) ?? authorLogin;
	const channelId = getString(event.broadcasterId) ?? broadcasterUserId;
	const channelLogin = getString(event.broadcasterName) ?? broadcasterLogin;
	const replyParentMessageId = getString(event.parentMessageId) ?? null;
	const isReply = replyParentMessageId !== null;
	const normalized: ChatBridgeMessage = {
		schema: 'chat.bridge.message.v1',
		id: `twitch:${channelId}:${messageId}`,
		source: 'twitch',
		receivedAt: new Date().toISOString(),
		channel: {
			id: channelId,
			name: channelLogin,
		},
		author: {
			id: authorId,
			name: authorLogin,
			displayName: authorDisplayName,
		},
		message: {
			id: messageId,
			text: messageText,
			rawText: messageText,
			isReply,
		},
		sourceData: {
			kind: 'twitch',
			channelId,
			channelLogin,
			messageId,
			userId: authorId,
			userLogin: authorLogin,
			userDisplayName: authorDisplayName,
			badges: extractBadges(event.badges),
			replyParentMessageId,
			isAction: getBoolean(event.isAction),
			isFirst: getBoolean(event.isFirst),
			isReturningChatter: getBoolean(event.isReturningChatter),
			bits: getNumber(event.bits) ?? getNumber(event.cheerBits),
		},
		raw: {
			payload: safeStringify(event),
		},
	};

	registerRecentMessageId(input.recentMessageIds, input.recentMessageOrder, messageId);
	if (debugEnabled) {
		nodecg.log.info(`[twitch-chat] message ${messageId} from ${authorDisplayName}: ${messageText}`);
	}

	nodecg.sendMessage(outgoingMessageName, normalized);
}

function registerRecentMessageId(messageIds: Set<string>, messageOrder: string[], messageId: string): void {
	messageIds.add(messageId);
	messageOrder.push(messageId);
	if (messageOrder.length <= DEDUPE_LIMIT) {
		return;
	}

	const removed = messageOrder.shift();
	if (!removed) {
		return;
	}

	messageIds.delete(removed);
}

function extractBadges(value: unknown): Record<string, string> | undefined {
	if (isObject(value)) {
		const result: Record<string, string> = {};
		for (const [key, entry] of Object.entries(value)) {
			const normalizedKey = normalizeOptionalString(key);
			const normalizedValue = normalizeOptionalString(entry);
			if (!normalizedKey || !normalizedValue) {
				continue;
			}

			result[normalizedKey] = normalizedValue;
		}

		return Object.keys(result).length > 0 ? result : undefined;
	}

	if (!Array.isArray(value)) {
		return undefined;
	}

	const result: Record<string, string> = {};
	for (const badge of value) {
		if (!isObject(badge)) {
			continue;
		}

		const badgeSetId = getString(badge.setId);
		const badgeVersion = getString(badge.version);
		if (!badgeSetId || !badgeVersion) {
			continue;
		}

		result[badgeSetId] = badgeVersion;
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => normalizeOptionalString(entry))
		.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeNonNegativeInteger(value: unknown): number | null {
	if (typeof value !== 'number') {
		return null;
	}

	if (!Number.isInteger(value) || value < 0) {
		return null;
	}

	return value;
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function getString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '[unserializable-event]';
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
