import type { ChatBridgeMessage } from '../types/schemas';

const MESSAGE_NAME = 'chat:bridge:message';
const MAX_MESSAGES = 20;

interface ViewMessage {
	id: string;
	source: 'bbs_jpnkn' | 'twitch';
	author: string;
	text: string;
	receivedAt: string;
}

const messageListElement = getElement<HTMLUListElement>('message-list');
const connectionStatusElement = getElement<HTMLDivElement>('connection-status');
const messageCountElement = getElement<HTMLDivElement>('message-count');
const messageItemTemplate = getTemplate('message-item-template');
const emptyTemplate = getTemplate('message-empty-template');
const seenMessageIds = new Set<string>();
const messages: ViewMessage[] = [];

nodecg.listenFor(MESSAGE_NAME, (payload: unknown) => {
	const parsed = parseChatBridgeMessage(payload);
	if (!parsed) {
		return;
	}

	if (seenMessageIds.has(parsed.id)) {
		return;
	}

	seenMessageIds.add(parsed.id);
	messages.push({
		id: parsed.id,
		source: parsed.source,
		author: parsed.author.displayName,
		text: parsed.message.text,
		receivedAt: parsed.receivedAt,
	});

	while (messages.length > MAX_MESSAGES) {
		const removed = messages.shift();
		if (removed) {
			seenMessageIds.delete(removed.id);
		}
	}

	renderMessages();
});

function parseChatBridgeMessage(value: unknown): ChatBridgeMessage | null {
	if (!isObject(value)) {
		return null;
	}

	if (value.schema !== 'chat.bridge.message.v1') {
		return null;
	}

	if (value.source !== 'bbs_jpnkn' && value.source !== 'twitch') {
		return null;
	}

	if (!isObject(value.author) || !isObject(value.message)) {
		return null;
	}

	if (typeof value.id !== 'string' || typeof value.receivedAt !== 'string') {
		return null;
	}

	if (typeof value.author.displayName !== 'string' || typeof value.message.text !== 'string') {
		return null;
	}

	return value as ChatBridgeMessage;
}

function renderMessages(): void {
	messageCountElement.textContent = `${messages.length} messages`;
	if (messages.length === 0) {
		connectionStatusElement.textContent = 'waiting for messages...';
		renderEmptyState();
		return;
	}

	const latest = messages[messages.length - 1];
	connectionStatusElement.textContent = `last message ${formatTime(latest.receivedAt)}`;
	const fragment = document.createDocumentFragment();
	for (const message of messages) {
		fragment.appendChild(createMessageItem(message));
	}

	messageListElement.replaceChildren(fragment);
}

function renderEmptyState(): void {
	const fragment = emptyTemplate.content.cloneNode(true);
	messageListElement.replaceChildren(fragment);
}

function createMessageItem(message: ViewMessage): HTMLLIElement {
	const fragment = messageItemTemplate.content.cloneNode(true);
	const item = getRequiredElementFromFragment<HTMLLIElement>(fragment, '.message-item');
	const badge = getRequiredElementFromFragment<HTMLSpanElement>(fragment, '[data-role="source-badge"]');
	const meta = getRequiredElementFromFragment<HTMLDivElement>(fragment, '[data-role="message-meta"]');
	const text = getRequiredElementFromFragment<HTMLDivElement>(fragment, '[data-role="message-text"]');

	if (message.source === 'bbs_jpnkn') {
		badge.textContent = 'BBS';
		badge.classList.add('badge-bbs');
	} else {
		badge.textContent = 'TWITCH';
		badge.classList.add('badge-twitch');
	}

	meta.textContent = `${message.author} | ${formatTime(message.receivedAt)} | ${message.id}`;
	text.textContent = message.text;

	return item;
}

function formatTime(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return timestamp;
	}

	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
}

function isObject(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null;
}

function getElement<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Missing element: #${id}`);
	}

	return element as T;
}

function getTemplate(id: string): HTMLTemplateElement {
	const element = document.getElementById(id);
	if (!element || !(element instanceof HTMLTemplateElement)) {
		throw new Error(`Missing template: #${id}`);
	}

	return element;
}

function getRequiredElementFromFragment<T extends Element>(fragment: Node, selector: string): T {
	if (!(fragment instanceof DocumentFragment)) {
		throw new Error(`Expected a DocumentFragment for selector: ${selector}`);
	}

	const element = fragment.querySelector(selector);
	if (!element) {
		throw new Error(`Missing template element: ${selector}`);
	}

	return element as T;
}
