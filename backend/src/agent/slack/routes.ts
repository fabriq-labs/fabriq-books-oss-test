import { Router, Request, Response } from 'express';
import { raw } from 'express';
import type { SlackEvent } from '@slack/web-api';
import { verifyRequest, getBotId } from './slack-utils';
import { handleNewAppMention } from './handle-app-mention';
import { assistantThreadMessage, handleNewAssistantMessage } from './handle-messages';
import logger from '../../utils/logger';

/**
 * Create Slack event router
 * Note: This router should be mounted with express.raw() middleware for request verification
 */
export function createSlackRouter() {
    const router = Router();

    // Slack events endpoint - uses raw body for signature verification
    // Note: This route must be mounted BEFORE the JSON middleware in index.ts
    router.post('/events', raw({ type: 'application/json' }), async (req: Request, res: Response) => {
        try {
            // Get raw body as string (req.body is a Buffer when using raw middleware)
            const rawBody = Buffer.isBuffer(req.body)
                ? req.body.toString('utf-8')
                : typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body);

            const payload = JSON.parse(rawBody);
            const requestType = payload.type as 'url_verification' | 'event_callback';

            // Handle URL verification (required by Slack)
            if (requestType === 'url_verification') {
                return res.status(200).send(payload.challenge);
            }

            // Verify the request is from Slack
            if (process.env.SLACK_SIGNING_SECRET) {
                try {
                    await verifyRequest({
                        requestType,
                        headers: req.headers,
                        rawBody,
                    });
                } catch (error) {
                    logger.warn('Could not verify Slack request', error);
                    // In production, you might want to reject unverified requests
                    // return res.status(401).json({ error: 'Invalid Slack signature' });
                }
            }

            // Get bot user ID
            const botUserId = await getBotId();

            // Handle the event
            const event = payload.event as SlackEvent;

            // Handle app mentions
            if (event.type === 'app_mention') {
                // Use setImmediate to respond quickly to Slack
                setImmediate(() => {
                    handleNewAppMention(event as any, botUserId).catch((error) => {
                        logger.error('Error handling app mention', error);
                    });
                });
                return res.status(200).send('OK');
            }

            // Handle assistant thread started
            if (event.type === 'assistant_thread_started') {
                setImmediate(() => {
                    assistantThreadMessage(event).catch((error) => {
                        logger.error('Error handling assistant thread', error);
                    });
                });
                return res.status(200).send('OK');
            }

            // Handle direct messages
            if (
                event.type === 'message' &&
                !(event as any).subtype &&
                (event as any).channel_type === 'im' &&
                !(event as any).bot_id &&
                !(event as any).bot_profile &&
                (event as any).bot_id !== botUserId
            ) {
                setImmediate(() => {
                    handleNewAssistantMessage(event as any, botUserId).catch((error) => {
                        logger.error('Error handling assistant message', error);
                    });
                });
                return res.status(200).send('OK');
            }

            // Acknowledge other events
            return res.status(200).send('OK');
        } catch (error) {
            logger.error('Error processing Slack event', error);
            return res.status(500).json({
                error: 'Error processing Slack event',
                message: (error as Error).message,
            });
        }
    });

    return router;
}

