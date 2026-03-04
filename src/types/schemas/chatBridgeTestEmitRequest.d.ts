/**
 * Request payload for emitting a normalized test chat message from dashboard.
 */
export interface ChatBridgeTestEmitRequest {
  platform: 'twitch' | 'bbs_jpnkn';
  text: string;
  authorDisplayName?: string;
  authorId?: string | null;
  channelId?: string;
  channelName?: string;
  threadId?: string;
  isReply?: boolean;
  replyParentMessageId?: string | null;
  tags?: {
    [k: string]: string;
  };
  rawPayload?: string;
}
