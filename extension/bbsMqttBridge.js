"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBbsMqttBridge = setupBbsMqttBridge;
const mqtt_1 = require("mqtt");
const OUTGOING_MESSAGE_NAME = 'chat:bridge:message';
const DEFAULT_BROKER_HOST = 'bbs.jpnkn.com';
const DEFAULT_BROKER_PORT = 1883;
function setupBbsMqttBridge(nodecg) {
    const config = nodecg.bundleConfig?.bbsMqtt;
    if (!config || config.enabled === false) {
        nodecg.log.info('[bbs-mqtt] Disabled by configuration.');
        return;
    }
    const boardId = normalizeOptionalString(config.boardId);
    const topic = normalizeOptionalString(config.topic) ?? (boardId ? `bbs/${boardId}` : undefined);
    if (!topic) {
        nodecg.log.warn('[bbs-mqtt] Missing "bbsMqtt.topic" or "bbsMqtt.boardId". Bridge is disabled.');
        return;
    }
    const protocol = config.protocol ?? 'mqtt';
    const host = normalizeOptionalString(config.host) ?? DEFAULT_BROKER_HOST;
    const port = Number.isInteger(config.port) ? config.port : DEFAULT_BROKER_PORT;
    const brokerUrl = `${protocol}://${host}:${port}`;
    const options = {
        username: normalizeOptionalString(config.username),
        password: normalizeOptionalString(config.password),
        reconnectPeriod: Number.isInteger(config.reconnectPeriodMs) ? config.reconnectPeriodMs : 3000,
        connectTimeout: Number.isInteger(config.connectTimeoutMs) ? config.connectTimeoutMs : 30_000,
        keepalive: Number.isInteger(config.keepaliveSec) ? config.keepaliveSec : 60,
    };
    nodecg.log.info(`[bbs-mqtt] Connecting to ${brokerUrl}, topic=${topic}`);
    const client = (0, mqtt_1.connect)(brokerUrl, options);
    registerClientEvents(nodecg, client, topic);
}
function registerClientEvents(nodecg, client, topic) {
    client.on('connect', () => {
        nodecg.log.info('[bbs-mqtt] Connected.');
        client.subscribe(topic, (error) => {
            if (error) {
                nodecg.log.error(`[bbs-mqtt] Subscribe failed: ${error.message}`);
                return;
            }
            nodecg.log.info(`[bbs-mqtt] Subscribed: ${topic}`);
        });
    });
    client.on('reconnect', () => {
        nodecg.log.warn('[bbs-mqtt] Reconnecting...');
    });
    client.on('offline', () => {
        nodecg.log.warn('[bbs-mqtt] Offline.');
    });
    client.on('close', () => {
        nodecg.log.warn('[bbs-mqtt] Connection closed.');
    });
    client.on('error', (error) => {
        nodecg.log.error(`[bbs-mqtt] Client error: ${error.message}`);
    });
    client.on('message', (receivedTopic, payloadBuffer) => {
        handleIncomingMessage(nodecg, receivedTopic, payloadBuffer.toString('utf8'));
    });
}
function handleIncomingMessage(nodecg, receivedTopic, rawPayloadText) {
    const payloadText = rawPayloadText.trim();
    if (!payloadText) {
        nodecg.log.warn('[bbs-mqtt] Ignored empty payload.');
        return;
    }
    let decoded;
    try {
        decoded = JSON.parse(payloadText);
    }
    catch (error) {
        nodecg.log.warn(`[bbs-mqtt] Payload is not valid JSON. topic=${receivedTopic}`);
        return;
    }
    const parsed = parseRawBbsPayload(decoded);
    if (!parsed) {
        nodecg.log.warn(`[bbs-mqtt] JSON payload missing required fields. topic=${receivedTopic}`);
        return;
    }
    const no = parsePositiveInteger(parsed.no);
    if (no === null) {
        nodecg.log.warn(`[bbs-mqtt] Invalid "no" field: ${parsed.no}`);
        return;
    }
    const dat = parseDatBody(parsed.body);
    const authorName = dat.name || 'anonymous';
    const messageId = parsed.no;
    const normalized = {
        schema: 'chat.bridge.message.v1',
        id: `bbs:${parsed.bbsid}:${parsed.threadkey}:${messageId}`,
        source: 'bbs_jpnkn',
        receivedAt: new Date().toISOString(),
        channel: {
            id: parsed.bbsid,
            name: parsed.bbsid,
        },
        thread: {
            id: parsed.threadkey,
        },
        author: {
            id: null,
            name: authorName,
            displayName: authorName,
        },
        message: {
            id: messageId,
            text: dat.body,
            rawText: parsed.body,
            isReply: false,
        },
        tags: dat.mail ? { mail: dat.mail } : undefined,
        sourceData: {
            kind: 'bbs_jpnkn',
            topic: receivedTopic,
            no,
            bbsid: parsed.bbsid,
            threadkey: parsed.threadkey,
            dat,
        },
        raw: {
            topic: receivedTopic,
            payload: payloadText,
        },
    };
    nodecg.sendMessage(OUTGOING_MESSAGE_NAME, normalized);
}
function parseRawBbsPayload(value) {
    if (!isObject(value)) {
        return null;
    }
    const body = normalizeOptionalString(value.body);
    const no = normalizeOptionalString(value.no);
    const bbsid = normalizeOptionalString(value.bbsid);
    const threadkey = normalizeOptionalString(value.threadkey);
    if (!body || !no || !bbsid || !threadkey) {
        return null;
    }
    return {
        body,
        no,
        bbsid,
        threadkey,
    };
}
function parseDatBody(datLine) {
    const parts = datLine.split('<>');
    return {
        name: parts[0] ?? '',
        mail: parts[1] ?? '',
        date: parts[2] ?? '',
        body: parts[3] ?? '',
        title: parts[4] ?? '',
    };
}
function parsePositiveInteger(value) {
    if (!/^\d+$/.test(value)) {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
//# sourceMappingURL=bbsMqttBridge.js.map