import type NodeCG from 'nodecg/types';
import { setupBbsMqttBridge } from './bbsMqttBridge';

module.exports = function (nodecg: NodeCG.ServerAPI) {
	setupBbsMqttBridge(nodecg);
};
