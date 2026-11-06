import '../config/env-loader';
import Redis from 'ioredis';

export type MailboxEventListener = (event: {
  type: string;
  userId: string;
  folderId: string;
  uid: number;
  messageId: string;
}) => void;

export class RedisService {
  private static subscriber: Redis | null = null;
  private static listeners = new Map<string, Set<MailboxEventListener>>();

  static getSubscriber(): Redis {
    if (!this.subscriber) {
      const host = process.env.REDIS_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      const password = process.env.REDIS_PASSWORD || undefined;

      this.subscriber = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      this.subscriber.on('message', (channel, messageStr) => {
        try {
          const event = JSON.parse(messageStr);
          const userId = event.userId || channel.replace('mailbox:events:', '');
          const userListeners = this.listeners.get(userId);

          if (userListeners && userListeners.size > 0) {
            for (const listener of userListeners) {
              listener(event);
            }
          }
        } catch (err: any) {
          console.warn(`[RedisService] Error handling pubsub message: ${err.message}`);
        }
      });

      console.log('[RedisService] Redis Pub/Sub client initialized.');
    }
    return this.subscriber;
  }

  static async subscribeUser(userId: string, listener: MailboxEventListener): Promise<void> {
    const sub = this.getSubscriber();
    if (sub.status !== 'ready' && sub.status !== 'connecting') {
      await sub.connect().catch((err) => {
        console.warn(`[RedisService] Redis connect error: ${err.message}`);
      });
    }

    let userListeners = this.listeners.get(userId);
    if (!userListeners) {
      userListeners = new Set();
      this.listeners.set(userId, userListeners);
      const channel = `mailbox:events:${userId}`;
      await sub.subscribe(channel).catch((err) => {
        console.warn(`[RedisService] Failed to subscribe to channel ${channel}: ${err.message}`);
      });
    }

    userListeners.add(listener);
  }

  static async unsubscribeUser(userId: string, listener: MailboxEventListener): Promise<void> {
    const userListeners = this.listeners.get(userId);
    if (userListeners) {
      userListeners.delete(listener);
      if (userListeners.size === 0) {
        this.listeners.delete(userId);
        if (this.subscriber && this.subscriber.status === 'ready') {
          const channel = `mailbox:events:${userId}`;
          await this.subscriber.unsubscribe(channel).catch(() => {});
        }
      }
    }
  }

  static async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => {});
      this.subscriber = null;
      this.listeners.clear();
      console.log('[RedisService] Redis Pub/Sub client closed.');
    }
  }
}
