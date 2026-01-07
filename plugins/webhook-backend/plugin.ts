import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { Router } from 'express';
import express from 'express';

function createBasicAuthMiddleware(config: any, logger: any) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Basic ')) {
      logger.warn('Missing Authorization header');
      res.setHeader('WWW-Authenticate', 'Basic realm="Webhook"');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const expectedUsername = config.getOptionalString('webhook.auth.username');
    const expectedPassword = config.getOptionalString('webhook.auth.password');

    if (!expectedUsername || !expectedPassword) {
      logger.warn('Webhook auth not configured - allowing unauthenticated');
      return next();
    }

    if (username === expectedUsername && password === expectedPassword) {
      logger.debug('Authentication successful', { username });
      return next();
    }

    logger.warn('Authentication failed', { username });
    res.setHeader('WWW-Authenticate', 'Basic realm="Webhook"');
    return res.status(401).json({ error: 'Invalid credentials' });
  };
}

export const webhookPlugin = createBackendPlugin({
  pluginId: 'webhook',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        notifications: coreServices.notifications,
        config: coreServices.rootConfig,
      },
      async init({ logger, httpRouter, notifications, config }) {
        const router = Router();
        router.use(express.json());

        const authMiddleware = createBasicAuthMiddleware(config, logger);

        router.post('/notify', authMiddleware, async (req, res) => {
          try {
            const payload = req.body;

            logger.info('Webhook received', { payload: JSON.stringify(payload) });

            const targetUser = 
              payload.user_id || 
              payload.userId || 
              payload.user ||
              payload.backstage_user ||
              payload.username;

            if (!targetUser) {
              logger.warn('Missing user identifier');
              return res.status(400).json({
                success: false,
                error: 'Missing user identifier',
                hint: 'Include one of: user_id, userId, user, backstage_user, username'
              });
            }

            const title = payload.title || payload.subject || 'Notification';
            const message = 
              payload.message || 
              payload.description || 
              payload.body || 
              payload.text || 
              '';
            const link = payload.link || payload.url || payload.href;
            
            const validSeverities = ['low', 'normal', 'high', 'critical'];
            const severity = validSeverities.includes(payload.severity) 
              ? payload.severity 
              : 'normal';

            const topic = payload.topic || payload.category || payload.source;

            logger.info('Sending notification', { user: targetUser, title, severity });

            const userEntityRef = targetUser.includes(':') 
              ? targetUser 
              : `user:default/${targetUser}`;

            await notifications.send({
              recipients: {
                type: 'entity',
                entityRef: userEntityRef,
              },
              payload: {
                title,
                description: message,
                ...(link && { link }),
                severity,
                ...(topic && { topic }),
              },
            });

            logger.info('Notification sent successfully', { user: targetUser });

            return res.status(200).json({
              success: true,
              message: 'Notification sent',
              user: targetUser
            });

          } catch (error: any) {
            logger.error('Webhook processing failed', { 
              error: error.message,
              stack: error.stack 
            });
            
            return res.status(500).json({
              success: false,
              error: 'Internal server error',
              message: error.message
            });
          }
        });

        router.post('/notify-batch', authMiddleware, async (req, res) => {
          try {
            const { notifications: notificationList } = req.body;

            if (!Array.isArray(notificationList)) {
              return res.status(400).json({
                success: false,
                error: 'Expected "notifications" array in request body'
              });
            }

            const results = [];

            for (const notification of notificationList) {
              const targetUser = 
                notification.user_id || 
                notification.userId || 
                notification.user;
              
              if (!targetUser) {
                results.push({ success: false, error: 'Missing user identifier' });
                continue;
              }

              try {
                const userEntityRef = targetUser.includes(':') 
                  ? targetUser 
                  : `user:default/${targetUser}`;

                await notifications.send({
                  recipients: {
                    type: 'entity',
                    entityRef: userEntityRef,
                  },
                  payload: {
                    title: notification.title || 'Notification',
                    description: notification.message || notification.description || '',
                    ...(notification.link && { link: notification.link }),
                    severity: notification.severity || 'normal',
                    ...(notification.topic && { topic: notification.topic }),
                  },
                });

                results.push({ success: true, user: targetUser });
                logger.info('Batch notification sent', { user: targetUser });
              } catch (error: any) {
                results.push({ success: false, user: targetUser, error: error.message });
                logger.error('Batch notification failed', { user: targetUser, error: error.message });
              }
            }

            return res.status(200).json({
              success: true,
              results,
              total: notificationList.length,
              succeeded: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length
            });

          } catch (error: any) {
            logger.error('Batch webhook processing failed', { error: error.message });
            
            return res.status(500).json({
              success: false,
              error: 'Internal server error',
              message: error.message
            });
          }
        });

        router.get('/health', (req, res) => {
          const authConfigured = !!(
            config.getOptionalString('webhook.auth.username') && 
            config.getOptionalString('webhook.auth.password')
          );

          res.json({ 
            status: 'ok', 
            plugin: 'webhook',
            version: '0.1.0',
            authConfigured,
            endpoints: {
              notify: '/api/webhook/notify',
              batch: '/api/webhook/notify-batch',
              health: '/api/webhook/health'
            }
          });
        });

        httpRouter.use('/webhook', router);
        
        httpRouter.addAuthPolicy({
          path: '/webhook',
          allow: 'unauthenticated',
        });

        const authStatus = config.getOptionalString('webhook.auth.username') 
          ? 'enabled' 
          : 'disabled';

        logger.info('Webhook plugin initialized successfully', {
          basePath: '/api/webhook',
          authentication: authStatus,
          endpoints: ['notify', 'notify-batch', 'health']
        });
      },
    });
  },
});
