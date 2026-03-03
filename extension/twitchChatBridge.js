"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTwitchChatBridge = setupTwitchChatBridge;
const DEFAULT_OUTGOING_MESSAGE_NAME = 'chat:bridge:message';
const DEDUPE_LIMIT = 1000;
const TWITCH_AUTH_REPLICANT_NAME = 'twitchAuthState';
function setupTwitchChatBridge(nodecg) {
    const authStateReplicant = nodecg.Replicant(TWITCH_AUTH_REPLICANT_NAME, {
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
    const recentMessageIds = new Set();
    const recentMessageOrder = [];
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
                const currentRefreshToken = authStateReplicant.value?.token && authStateReplicant.value.token !== null
                    ? authStateReplicant.value.token.refreshToken
                    : null;
                const persistedToken = {
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
                nodecg.log.warn(`[twitch-chat] readAsUserId (${readAsUserId}) does not match token user (${resolvedUserId}).`);
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
        }
        catch (error) {
            setAuthState(authStateReplicant, {
                status: 'error',
                lastError: `Initialization failed: ${getErrorMessage(error)}`,
            });
            nodecg.log.error(`[twitch-chat] Failed to initialize: ${getErrorMessage(error)}`);
        }
    })();
}
function resolveRequiredConfig(config) {
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
function loadTwurpleModules(nodecg) {
    try {
        const { ApiClient } = require('@twurple/api');
        const { RefreshingAuthProvider } = require('@twurple/auth');
        const { EventSubWsListener } = require('@twurple/eventsub-ws');
        return {
            ApiClient,
            RefreshingAuthProvider,
            EventSubWsListener,
        };
    }
    catch (error) {
        nodecg.log.error(`[twitch-chat] Failed to load Twurple modules. Install @twurple/api @twurple/auth @twurple/eventsub-ws. ${getErrorMessage(error)}`);
        return null;
    }
}
function resolveBootstrapToken(replicantToken, initialTokenConfig) {
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
function parseInitialTokenConfig(value) {
    if (!value) {
        return null;
    }
    const accessToken = normalizeOptionalString(value.accessToken);
    const refreshToken = normalizeOptionalString(value.refreshToken) ?? null;
    const scope = normalizeStringArray(value.scope);
    const expiresIn = normalizeNonNegativeInteger(value.expiresIn);
    const obtainmentTimestamp = normalizeNonNegativeInteger(value.obtainmentTimestamp) ?? normalizeNonNegativeInteger(Date.now());
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
function parseTokenValue(value) {
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
function createDefaultAuthState() {
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
function setAuthState(replicant, patch) {
    const current = replicant.value ?? createDefaultAuthState();
    replicant.value = {
        ...current,
        ...patch,
        version: 1,
        status: (patch.status ?? current.status),
        tokenSource: (patch.tokenSource ?? current.tokenSource ?? 'none'),
        updatedAt: new Date().toISOString(),
    };
}
function registerListenerLogs(nodecg, listener) {
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
    listener.on('error', (error) => {
        nodecg.log.error(`[twitch-chat] Listener error: ${getErrorMessage(error)}`);
    });
}
function handleChannelChatMessage(input) {
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
    const normalized = {
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
function registerRecentMessageId(messageIds, messageOrder, messageId) {
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
function extractBadges(value) {
    if (isObject(value)) {
        const result = {};
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
    const result = {};
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
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizeOptionalString(entry))
        .filter((entry) => typeof entry === 'string');
}
function normalizeNonNegativeInteger(value) {
    if (typeof value !== 'number') {
        return null;
    }
    if (!Number.isInteger(value) || value < 0) {
        return null;
    }
    return value;
}
function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function getString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function getNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function getBoolean(value) {
    return typeof value === 'boolean' ? value : undefined;
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return '[unserializable-event]';
    }
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=twitchChatBridge.js.map