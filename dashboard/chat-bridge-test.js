const TEST_EMIT_MESSAGE_NAME = 'chat:bridge:test:emit';
const platformSelect = getElement('platform');
const textInput = getElement('text');
const authorDisplayNameInput = getElement('authorDisplayName');
const authorIdInput = getElement('authorId');
const channelIdInput = getElement('channelId');
const channelNameInput = getElement('channelName');
const threadRow = getElement('threadRow');
const threadIdInput = getElement('threadId');
const isReplySelect = getElement('isReply');
const replyParentMessageIdInput = getElement('replyParentMessageId');
const tagsJsonInput = getElement('tagsJson');
const rawPayloadInput = getElement('rawPayload');
const sendButton = getElement('send');
const loadTwitchButton = getElement('loadTwitch');
const loadBbsButton = getElement('loadBbs');
const clearButton = getElement('clear');
const statusElement = getElement('status');
const historyElement = getElement('history');
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
        const response = await sendMessage(TEST_EMIT_MESSAGE_NAME, request);
        if (!response.ok) {
            setStatus(response.error ?? 'Failed to emit test message.', 'error');
            return;
        }
        const emittedId = response.emittedId ?? '(unknown-id)';
        setStatus(`Sent test message: ${emittedId}`, 'success');
        appendHistory(`${new Date().toLocaleTimeString()} | ${request.platform} | ${emittedId}`);
    }
    catch (error) {
        setStatus(`Send failed: ${getErrorMessage(error)}`, 'error');
    }
    finally {
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
function buildRequest() {
    const text = textInput.value.trim();
    if (!text) {
        setStatus('Message text is required.', 'error');
        return null;
    }
    const request = {
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
        let tagsValue;
        try {
            tagsValue = JSON.parse(tagsJsonText);
        }
        catch {
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
function updatePlatformFields() {
    const isBbs = platformSelect.value === 'bbs_jpnkn';
    threadRow.style.display = isBbs ? 'grid' : 'none';
}
function appendHistory(value) {
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
function setStatus(text, type) {
    statusElement.textContent = text;
    statusElement.className = type ? type : '';
}
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing required element: ${id}`);
    }
    return element;
}
function sendMessage(name, request) {
    return new Promise((resolve, reject) => {
        nodecg.sendMessage(name, request, (error, response) => {
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
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function isStringRecord(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === 'string');
}
//# sourceMappingURL=chat-bridge-test.js.map