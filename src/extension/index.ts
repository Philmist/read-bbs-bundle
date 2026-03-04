import type NodeCG from 'nodecg/types';
import { setupBbsMqttBridge } from './bbsMqttBridge';
import { setupTwitchChatBridge } from './twitchChatBridge';
import { setupTestMessageEmitter } from './testMessageEmitter';

module.exports = function (nodecg: NodeCG.ServerAPI) {
	setupBbsMqttBridge(nodecg);
	setupTwitchChatBridge(nodecg);
	setupTestMessageEmitter(nodecg);
};
