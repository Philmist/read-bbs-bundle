const MESSAGE_NAME = 'chat:bridge:message';
const MAX_MESSAGES = 20;
const messageListElement = getElement('message-list');
const connectionStatusElement = getElement('connection-status');
const messageCountElement = getElement('message-count');
const messageItemTemplate = getTemplate('message-item-template');
const emptyTemplate = getTemplate('message-empty-template');
const seenMessageIds = new Set();
const messages = [];
nodecg.listenFor(MESSAGE_NAME, (payload) => {
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
function parseChatBridgeMessage(value) {
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
    return value;
}
function renderMessages() {
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
function renderEmptyState() {
    const fragment = emptyTemplate.content.cloneNode(true);
    messageListElement.replaceChildren(fragment);
}
function createMessageItem(message) {
    const fragment = messageItemTemplate.content.cloneNode(true);
    const item = getRequiredElementFromFragment(fragment, '.message-item');
    const badge = getRequiredElementFromFragment(fragment, '[data-role="source-badge"]');
    const meta = getRequiredElementFromFragment(fragment, '[data-role="message-meta"]');
    const text = getRequiredElementFromFragment(fragment, '[data-role="message-text"]');
    if (message.source === 'bbs_jpnkn') {
        badge.textContent = 'BBS';
        badge.classList.add('badge-bbs');
    }
    else {
        badge.textContent = 'TWITCH';
        badge.classList.add('badge-twitch');
    }
    meta.textContent = `${message.author} | ${formatTime(message.receivedAt)} | ${message.id}`;
    text.textContent = message.text;
    return item;
}
function formatTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return timestamp;
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: #${id}`);
    }
    return element;
}
function getTemplate(id) {
    const element = document.getElementById(id);
    if (!element || !(element instanceof HTMLTemplateElement)) {
        throw new Error(`Missing template: #${id}`);
    }
    return element;
}
function getRequiredElementFromFragment(fragment, selector) {
    if (!(fragment instanceof DocumentFragment)) {
        throw new Error(`Expected a DocumentFragment for selector: ${selector}`);
    }
    const element = fragment.querySelector(selector);
    if (!element) {
        throw new Error(`Missing template element: ${selector}`);
    }
    return element;
}
//# sourceMappingURL=index.js.map