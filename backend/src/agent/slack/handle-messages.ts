import { MessageEvent } from '@slack/web-api';
import { client, getThread, convertSlackMessageToModelMessage } from './slack-utils';
import { AgentService } from '../AgentService';
import logger from '../../utils/logger';

/**
 * Handle assistant thread started events
 */
export async function assistantThreadMessage(event: any): Promise<void> {
    // This can be used to send an initial message when a thread starts
    // For now, we'll just log it
    logger.info('Assistant thread started', { event });
}

/**
 * Handle new direct messages or messages in threads
 */
export async function handleNewAssistantMessage(
    event: MessageEvent,
    botUserId: string
): Promise<void> {
    const eventAny = event as any;

    // Skip if message is from a bot
    if (
        eventAny.bot_id ||
        eventAny.bot_profile ||
        eventAny.user === botUserId
    ) {
        return;
    }

    // Skip if not in a thread (for DMs, we want thread context)
    if (!eventAny.thread_ts) {
        // For DMs, create a thread by replying to the message
        // We'll handle this by using the message timestamp as thread_ts
    }

    const thread_ts = eventAny.thread_ts;
    const channel = eventAny.channel;

    const updateStatusUtil = async (
        channel: string,
        threadTs: string,
    ) => {
        const initialMessage = await client.chat.postMessage({
            channel: channel,
            thread_ts: threadTs || event.ts,
            text: '🤖 Thinking...',
        });

        if (!initialMessage || !initialMessage.ts) {
            throw new Error('Failed to post initial message');
        }

        const updateMessage = async (status: string) => {
            if (status) {
                await client.chat.update({
                    channel: channel,
                    ts: initialMessage.ts as string,
                    text: status,
                });
            } else {
                // Delete the status message if status is empty
                try {
                    await client.chat.delete({
                        channel: channel,
                        ts: initialMessage.ts as string,
                    });
                } catch (error) {
                    // Ignore errors when deleting
                }
            }
        };

        return updateMessage;
    };

    const threadTimestamp = thread_ts || event.ts;
    const updateStatus = await updateStatusUtil(channel, threadTimestamp);
    updateStatus('🤖 Thinking...');

    try {
        // Get thread history
        const messages = await getThread(channel, threadTimestamp, botUserId);

        if (messages.length === 0) {
            updateStatus('❌ No message content found');
            return;
        }

        // Get auth context from Slack user ID using external_config
        const { getUserBySlackId } = await import('./slack-auth');
        const slackAuthContext = await getUserBySlackId(eventAny.user);

        if (!slackAuthContext) {
            logger.warn('No user found for Slack ID', { slackUserId: eventAny.user });
            updateStatus('❌ User not found. Please link your Slack account.');

            await client.chat.postMessage({
                channel: channel,
                thread_ts: threadTimestamp,
                text: 'Sorry, I couldn\'t find your account. Please contact your administrator to link your Slack account.',
            });
            return;
        }

        // Use AgentService to generate response
        const agentService = new AgentService();
        const latestMessage = messages[messages.length - 1];
        const previousMessages = messages.slice(0, -1);

        updateStatus('🤖 Processing...');

        const response = await agentService.handleRequest(
            latestMessage.content,
            slackAuthContext,
            previousMessages,
            { modelName: 'default' }
        );

        // Convert markdown to Slack mrkdwn format
        const slackText = formatSlackText(response.content || 'No response generated');

        // Post the response
        await client.chat.postMessage({
            channel: channel,
            thread_ts: threadTimestamp,
            text: slackText,
            unfurl_links: false,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: slackText,
                    },
                },
            ],
        });

        // Clear the status message
        updateStatus('');
    } catch (error) {
        logger.error('Error handling assistant message', error);
        updateStatus('❌ Error processing request');

        // Post error message
        await client.chat.postMessage({
            channel: channel,
            thread_ts: threadTimestamp,
            text: 'Sorry, I encountered an error processing your request.',
        });
    }
}

/**
 * Format text for Slack (convert markdown to mrkdwn)
 */
function formatSlackText(text: string): string {
    // Convert markdown links to Slack format
    let formatted = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

    // Convert **bold** to *bold*
    formatted = formatted.replace(/\*\*/g, '*');

    return formatted;
}

