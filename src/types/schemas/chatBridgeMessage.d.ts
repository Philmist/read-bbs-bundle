/**
 * Normalized chat message payload shared across Twitch and BBS.JPNKN sources.
 */
export interface ChatBridgeMessage {
  schema: 'chat.bridge.message.v1';
  id: string;
  source: 'twitch' | 'bbs_jpnkn';
  receivedAt: string;
  channel: {
    id: string;
    name: string;
  };
  thread?: {
    id: string;
  };
  author: {
    id?: string | null;
    name: string;
    displayName: string;
  };
  message: {
    id: string;
    text: string;
    rawText?: string;
    isReply?: boolean;
  };
  tags?: {
    [k: string]: string;
  };
  sourceData:
    | {
        kind: 'bbs_jpnkn';
        topic: string;
        no: number;
        bbsid: string;
        threadkey: string;
        dat: {
          name: string;
          mail: string;
          date: string;
          body: string;
          title: string;
        };
      }
    | {
        kind: 'twitch';
        channelId: string;
        channelLogin: string;
        messageId: string;
        userId: string;
        userLogin: string;
        userDisplayName: string;
        badges?: {
          [k: string]: string;
        };
        replyParentMessageId?: string | null;
        isAction?: boolean;
        isFirst?: boolean;
        isReturningChatter?: boolean;
        bits?: number;
      };
  raw: {
    topic?: string;
    payload: string;
  };
}
