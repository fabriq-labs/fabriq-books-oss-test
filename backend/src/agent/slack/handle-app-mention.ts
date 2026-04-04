import { AppMentionEvent } from '@slack/web-api';
import { client, getThread } from './slack-utils';
import { AgentService } from '../AgentService';
import logger from '../../utils/logger';

/**
 * Handle app mention events (when bot is mentioned in a channel)
 */
export async function handleNewAppMention(
    event: AppMentionEvent,
    botUserId: string
): Promise<void> {
    // Skip if message is from a bot
    if (event.bot_id || event.bot_profile) {
        return;
    }

    const updateStatusUtil = async (
        initialStatus: string,
        event: AppMentionEvent,
    ) => {
        const initialMessage = await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.thread_ts ?? event.ts,
            text: initialStatus,
        });

        if (!initialMessage || !initialMessage.ts) {
            throw new Error('Failed to post initial message');
        }

        const updateMessage = async (status: string) => {
            if (status) {
                await client.chat.update({
                    channel: event.channel,
                    ts: initialMessage.ts as string,
                    text: status,
                });
            } else {
                // Delete the status message if status is empty
                try {
                    await client.chat.delete({
                        channel: event.channel,
                        ts: initialMessage.ts as string,
                    });
                } catch (error) {
                    // Ignore errors when deleting
                }
            }
        };

        return updateMessage;
    };

    const updateStatus = await updateStatusUtil('🤖 Thinking...', event);
    updateStatus('🤖 Thinking...');

    try {
        // Get thread history if in a thread, otherwise use just the current message
        let messages: any[] = [];

        if (event.thread_ts) {
            // Get all messages in the thread
            const threadMessages = await getThread(event.channel, event.thread_ts, botUserId);
            messages = threadMessages;
        } else {
            // Just use the current mention
            const text = event.text.replace(/<@[^>]+>/g, '').trim();
            if (text) {
                messages = [{ role: 'user', content: text }];
            }
        }

        if (messages.length === 0) {
            updateStatus('❌ No message content found');
            return;
        }

        // Get auth context from Slack user ID using external_config
        const { getUserBySlackId } = await import('./slack-auth');
        const slackAuthContext = await getUserBySlackId(event.user || '');

        if (!slackAuthContext) {
            logger.warn('No user found for Slack ID', { slackUserId: event.user });
            updateStatus('❌ User not found. Please link your Slack account.');

            await client.chat.postMessage({
                channel: event.channel,
                thread_ts: event.thread_ts ?? event.ts,
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
            channel: event.channel,
            thread_ts: event.thread_ts ?? event.ts,
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
        logger.error('Error handling app mention', error);
        updateStatus('❌ Error processing request');

        // Post error message
        await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.thread_ts ?? event.ts,
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

    // Convert `code` to `code` (Slack supports this)
    // Keep code blocks as-is for now

    return formatted;
}

