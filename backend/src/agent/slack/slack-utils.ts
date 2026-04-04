import { WebClient } from '@slack/web-api';
import { createHmac } from 'crypto';
import type { SlackEvent, MessageEvent } from '@slack/web-api';
import type { ProcessedMessage } from '../utils/messageProcessor';

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET;

/**
 * Verify that the request is coming from Slack
 */
export async function verifyRequest({
    requestType,
    headers,
    rawBody,
}: {
    requestType: 'url_verification' | 'event_callback';
    headers: { [key: string]: string | string[] | undefined };
    rawBody: string;
}): Promise<void> {
    if (requestType === 'url_verification') {
        return; // Skip verification for URL verification requests
    }

    if (!signingSecret) {
        throw new Error('SLACK_SIGNING_SECRET is not set');
    }

    const timestamp = Array.isArray(headers['x-slack-request-timestamp'])
        ? headers['x-slack-request-timestamp'][0]
        : headers['x-slack-request-timestamp'];
    const signature = Array.isArray(headers['x-slack-signature'])
        ? headers['x-slack-signature'][0]
        : headers['x-slack-signature'];

    if (!timestamp || !signature) {
        throw new Error('Missing Slack signature headers');
    }

    // Check if timestamp is too old (replay attack protection)
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
        throw new Error('Request timestamp is too old');
    }

    // Create the signature base string
    const sigBaseString = `v0:${timestamp}:${rawBody}`;
    const mySignature = 'v0=' + createHmac('sha256', signingSecret)
        .update(sigBaseString)
        .digest('hex');

    // Compare signatures using timing-safe comparison
    if (mySignature !== signature) {
        throw new Error('Invalid Slack signature');
    }
}

/**
 * Get the bot's user ID
 */
export async function getBotId(): Promise<string> {
    const authResult = await client.auth.test();
    if (!authResult.user_id) {
        throw new Error('Failed to get bot user ID');
    }
    return authResult.user_id;
}

/**
 * Get thread history and convert to AI SDK message format
 */
export async function getThread(
    channel: string,
    threadTs: string,
    botUserId: string
): Promise<ProcessedMessage[]> {
    const messages: ProcessedMessage[] = [];
    let cursor: string | undefined;

    do {
        const result = await client.conversations.replies({
            channel,
            ts: threadTs,
            cursor,
            limit: 100,
        });

        if (!result.messages) {
            break;
        }

        for (const message of result.messages) {
            // Skip bot's own messages to avoid loops
            if (message.bot_id || message.user === botUserId) {
                continue;
            }

            // Skip messages without text
            if (!message.text) {
                continue;
            }

            // Remove bot mentions from the text
            const text = message.text.replace(/<@[^>]+>/g, '').trim();
            if (!text) {
                continue;
            }

            messages.push({
                role: 'user',
                content: text,
            });
        }

        cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return messages;
}

/**
 * Convert Slack message event to AI SDK message format
 */
export function convertSlackMessageToModelMessage(
    event: any,
    botUserId: string
): ProcessedMessage | null {
    // Skip bot messages
    if ((event as any).bot_id || (event as any).bot_profile || (event as any).user === botUserId) {
        return null;
    }

    // Skip messages without text
    if (!(event as any).text) {
        return null;
    }

    // Remove bot mentions from the text
    const text = (event as any).text.replace(/<@[^>]+>/g, '').trim();
    if (!text) {
        return null;
    }

    return {
        role: 'user',
        content: text,
    };
}

export { client };

