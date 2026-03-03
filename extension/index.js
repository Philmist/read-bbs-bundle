"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bbsMqttBridge_1 = require("./bbsMqttBridge");
const twitchChatBridge_1 = require("./twitchChatBridge");
module.exports = function (nodecg) {
    (0, bbsMqttBridge_1.setupBbsMqttBridge)(nodecg);
    (0, twitchChatBridge_1.setupTwitchChatBridge)(nodecg);
};
//# sourceMappingURL=index.js.map