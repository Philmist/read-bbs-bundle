import type NodeCG from 'nodecg/types';
import type { ChatBridgeMessage, ChatBridgeTestEmitRequest } from '../types/schemas';

const TEST_EMIT_MESSAGE_NAME = 'chat:bridge:test:emit';
const OUTGOING_MESSAGE_NAME = 'chat:bridge:message';

interface BundleConfig {
	testEmitter?: {
		enabled?: boolean;
	};
}

interface EmitResponse {
	ok: boolean;
	emittedId?: string;
	error?: string;
}

export function setupTestMessageEmitter(nodecg: NodeCG.ServerAPI<BundleConfig>): void {
	if (nodecg.bundleConfig?.testEmitter?.enabled === false) {
		nodecg.log.info('[test-emitter] Disabled by configuration.');
		return;
	}

	nodecg.listenFor(TEST_EMIT_MESSAGE_NAME, (value: unknown, ack?: NodeCG.Acknowledgement) => {
		const request = parseRequest(value);
		if (!request) {
			sendAck(ack, {
				ok: false,
				error: 'Invalid request payload.',
			});
			return;
		}

		const nowIso = new Date().toISOString();
		const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const messageId = `test-${uniqueSuffix}`;
		const channelId = normalizeOptionalString(request.channelId) ?? getDefaultChannelId(request.platform);
		const channelName = normalizeOptionalString(request.channelName) ?? channelId;
		const authorDisplayName = normalizeOptionalString(request.authorDisplayName) ?? 'Test User';
		const authorId = request.authorId === null ? null : normalizeOptionalString(request.authorId) ?? null;
		const text = request.text.trim();
		const rawPayload = normalizeOptionalString(request.rawPayload) ?? text;
		const isReply = request.isReply === true;
		const tags = isStringRecord(request.tags) ? request.tags : undefined;

		const normalized: ChatBridgeMessage =
			request.platform === 'twitch'
				? {
						schema: 'chat.bridge.message.v1',
						id: `twitch:${channelId}:${messageId}`,
						source: 'twitch',
						receivedAt: nowIso,
						channel: {
							id: channelId,
							name: channelName,
						},
						author: {
							id: authorId ?? 'test-user-id',
							name: normalizeForLogin(authorDisplayName),
							displayName: authorDisplayName,
						},
						message: {
							id: messageId,
							text,
							rawText: rawPayload,
							isReply,
						},
						tags,
						sourceData: {
							kind: 'twitch',
							channelId,
							channelLogin: channelName,
							messageId,
							userId: authorId ?? 'test-user-id',
							userLogin: normalizeForLogin(authorDisplayName),
							userDisplayName: authorDisplayName,
							replyParentMessageId: isReply
								? normalizeOptionalString(request.replyParentMessageId) ?? 'test-parent-message-id'
								: null,
						},
						raw: {
							payload: rawPayload,
						},
				  }
				: {
						schema: 'chat.bridge.message.v1',
						id: `bbs:${channelId}:${normalizeOptionalString(request.threadId) ?? 'test-thread'}:${messageId}`,
						source: 'bbs_jpnkn',
						receivedAt: nowIso,
						channel: {
							id: channelId,
							name: channelName,
						},
						thread: {
							id: normalizeOptionalString(request.threadId) ?? 'test-thread',
						},
						author: {
							id: null,
							name: authorDisplayName,
							displayName: authorDisplayName,
						},
						message: {
							id: messageId,
							text,
							rawText: rawPayload,
							isReply: false,
						},
						tags,
						sourceData: {
							kind: 'bbs_jpnkn',
							topic: `bbs/${channelId}`,
							no: 1,
							bbsid: channelId,
							threadkey: normalizeOptionalString(request.threadId) ?? 'test-thread',
							dat: {
								name: authorDisplayName,
								mail: tags?.mail ?? '',
								date: nowIso,
								body: text,
								title: 'test',
							},
						},
						raw: {
							topic: `bbs/${channelId}`,
							payload: rawPayload,
						},
				  };

		nodecg.sendMessage(OUTGOING_MESSAGE_NAME, normalized);
		nodecg.log.info(`[test-emitter] Emitted ${normalized.source} test message id=${normalized.id}`);
		sendAck(ack, {
			ok: true,
			emittedId: normalized.id,
		});
	});
}

function parseRequest(value: unknown): ChatBridgeTestEmitRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const platform = normalizeOptionalString(value.platform);
	const text = normalizeOptionalString(value.text);
	if (!platform || (platform !== 'twitch' && platform !== 'bbs_jpnkn') || !text) {
		return null;
	}

	const request: ChatBridgeTestEmitRequest = {
		platform,
		text,
	};

	if (typeof value.authorDisplayName === 'string') {
		request.authorDisplayName = value.authorDisplayName;
	}
	if (typeof value.authorId === 'string' || value.authorId === null) {
		request.authorId = value.authorId;
	}
	if (typeof value.channelId === 'string') {
		request.channelId = value.channelId;
	}
	if (typeof value.channelName === 'string') {
		request.channelName = value.channelName;
	}
	if (typeof value.threadId === 'string') {
		request.threadId = value.threadId;
	}
	if (typeof value.isReply === 'boolean') {
		request.isReply = value.isReply;
	}
	if (typeof value.replyParentMessageId === 'string' || value.replyParentMessageId === null) {
		request.replyParentMessageId = value.replyParentMessageId;
	}
	if (isStringRecord(value.tags)) {
		request.tags = value.tags;
	}
	if (typeof value.rawPayload === 'string') {
		request.rawPayload = value.rawPayload;
	}

	return request;
}

function getDefaultChannelId(platform: ChatBridgeTestEmitRequest['platform']): string {
	return platform === 'twitch' ? 'test_channel' : 'test_bbs';
}

function normalizeForLogin(value: string): string {
	const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
	return normalized.length > 0 ? normalized : 'test_user';
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function sendAck(ack: NodeCG.Acknowledgement | undefined, response: EmitResponse): void {
	if (typeof ack === 'function') {
		ack(null, response);
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (!isObject(value)) {
		return false;
	}

	return Object.values(value).every((entry) => typeof entry === 'string');
}
