import type { ChatBridgeTestEmitRequest } from '../types/schemas';

interface EmitResponse {
	ok: boolean;
	emittedId?: string;
	error?: string;
}

const TEST_EMIT_MESSAGE_NAME = 'chat:bridge:test:emit';

const platformSelect = getElement<HTMLSelectElement>('platform');
const textInput = getElement<HTMLTextAreaElement>('text');
const authorDisplayNameInput = getElement<HTMLInputElement>('authorDisplayName');
const authorIdInput = getElement<HTMLInputElement>('authorId');
const channelIdInput = getElement<HTMLInputElement>('channelId');
const channelNameInput = getElement<HTMLInputElement>('channelName');
const threadRow = getElement<HTMLDivElement>('threadRow');
const threadIdInput = getElement<HTMLInputElement>('threadId');
const isReplySelect = getElement<HTMLSelectElement>('isReply');
const replyParentMessageIdInput = getElement<HTMLInputElement>('replyParentMessageId');
const tagsJsonInput = getElement<HTMLTextAreaElement>('tagsJson');
const rawPayloadInput = getElement<HTMLTextAreaElement>('rawPayload');
const sendButton = getElement<HTMLButtonElement>('send');
const loadTwitchButton = getElement<HTMLButtonElement>('loadTwitch');
const loadBbsButton = getElement<HTMLButtonElement>('loadBbs');
const clearButton = getElement<HTMLButtonElement>('clear');
const statusElement = getElement<HTMLDivElement>('status');
const historyElement = getElement<HTMLUListElement>('history');

platformSelect.addEventListener('change', () => {
	updatePlatformFields();
});

sendButton.addEventListener('click', async () => {
	const request = buildRequest();
	if (!request) {
		return;
	}

	setStatus('Sending...', undefined);
	sendButton.disabled = true;

	try {
		const response = await sendMessage<ChatBridgeTestEmitRequest, EmitResponse>(TEST_EMIT_MESSAGE_NAME, request);
		if (!response.ok) {
			setStatus(response.error ?? 'Failed to emit test message.', 'error');
			return;
		}

		const emittedId = response.emittedId ?? '(unknown-id)';
		setStatus(`Sent test message: ${emittedId}`, 'success');
		appendHistory(`${new Date().toLocaleTimeString()} | ${request.platform} | ${emittedId}`);
	} catch (error) {
		setStatus(`Send failed: ${getErrorMessage(error)}`, 'error');
	} finally {
		sendButton.disabled = false;
	}
});

loadTwitchButton.addEventListener('click', () => {
	platformSelect.value = 'twitch';
	textInput.value = 'This is a Twitch test message';
	authorDisplayNameInput.value = 'Test Twitch User';
	authorIdInput.value = 'test-user-id';
	channelIdInput.value = 'test_channel';
	channelNameInput.value = 'test_channel';
	threadIdInput.value = 'test-thread';
	isReplySelect.value = 'false';
	replyParentMessageIdInput.value = '';
	tagsJsonInput.value = '{"badge":"subscriber/1"}';
	rawPayloadInput.value = '';
	updatePlatformFields();
	setStatus('Loaded Twitch example.', undefined);
});

loadBbsButton.addEventListener('click', () => {
	platformSelect.value = 'bbs_jpnkn';
	textInput.value = 'This is a BBS test message';
	authorDisplayNameInput.value = 'Test BBS User';
	authorIdInput.value = '';
	channelIdInput.value = 'test_bbs';
	channelNameInput.value = 'test_bbs';
	threadIdInput.value = 'test-thread';
	isReplySelect.value = 'false';
	replyParentMessageIdInput.value = '';
	tagsJsonInput.value = '{"mail":"sage"}';
	rawPayloadInput.value = '';
	updatePlatformFields();
	setStatus('Loaded BBS example.', undefined);
});

clearButton.addEventListener('click', () => {
	textInput.value = '';
	authorIdInput.value = '';
	replyParentMessageIdInput.value = '';
	tagsJsonInput.value = '';
	rawPayloadInput.value = '';
	setStatus('Cleared optional fields.', undefined);
});

updatePlatformFields();

function buildRequest(): ChatBridgeTestEmitRequest | null {
	const text = textInput.value.trim();
	if (!text) {
		setStatus('Message text is required.', 'error');
		return null;
	}

	const request: ChatBridgeTestEmitRequest = {
		platform: platformSelect.value === 'bbs_jpnkn' ? 'bbs_jpnkn' : 'twitch',
		text,
	};

	const authorDisplayName = authorDisplayNameInput.value.trim();
	if (authorDisplayName.length > 0) {
		request.authorDisplayName = authorDisplayName;
	}

	const authorId = authorIdInput.value.trim();
	if (authorId.length > 0) {
		request.authorId = authorId;
	}

	const channelId = channelIdInput.value.trim();
	if (channelId.length > 0) {
		request.channelId = channelId;
	}

	const channelName = channelNameInput.value.trim();
	if (channelName.length > 0) {
		request.channelName = channelName;
	}

	const threadId = threadIdInput.value.trim();
	if (threadId.length > 0) {
		request.threadId = threadId;
	}

	request.isReply = isReplySelect.value === 'true';

	const replyParentMessageId = replyParentMessageIdInput.value.trim();
	if (replyParentMessageId.length > 0) {
		request.replyParentMessageId = replyParentMessageId;
	}

	const tagsJsonText = tagsJsonInput.value.trim();
	if (tagsJsonText.length > 0) {
		let tagsValue: unknown;
		try {
			tagsValue = JSON.parse(tagsJsonText);
		} catch {
			setStatus('Tags JSON is invalid.', 'error');
			return null;
		}

		if (!isStringRecord(tagsValue)) {
			setStatus('Tags JSON must be an object of string values.', 'error');
			return null;
		}

		request.tags = tagsValue;
	}

	const rawPayload = rawPayloadInput.value.trim();
	if (rawPayload.length > 0) {
		request.rawPayload = rawPayload;
	}

	return request;
}

function updatePlatformFields(): void {
	const isBbs = platformSelect.value === 'bbs_jpnkn';
	threadRow.style.display = isBbs ? 'grid' : 'none';
}

function appendHistory(value: string): void {
	const item = document.createElement('li');
	item.textContent = value;
	historyElement.prepend(item);

	while (historyElement.childElementCount > 5) {
		const last = historyElement.lastElementChild;
		if (!last) {
			break;
		}

		historyElement.removeChild(last);
	}
}

function setStatus(text: string, type: 'success' | 'error' | undefined): void {
	statusElement.textContent = text;
	statusElement.className = type ? type : '';
}

function getElement<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Missing required element: ${id}`);
	}

	return element as T;
}

function sendMessage<TRequest, TResponse>(name: string, request: TRequest): Promise<TResponse> {
	return new Promise<TResponse>((resolve, reject) => {
		nodecg.sendMessage(name, request, (error: unknown, response: TResponse | undefined) => {
			if (error) {
				reject(error);
				return;
			}

			if (typeof response === 'undefined') {
				reject(new Error('No response returned from extension.'));
				return;
			}

			resolve(response);
		});
	});
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	return Object.values(value).every((entry) => typeof entry === 'string');
}
