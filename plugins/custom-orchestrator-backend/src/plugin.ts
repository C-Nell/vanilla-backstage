import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';

export const customOrchestratorPlugin = createBackendPlugin({
  pluginId: 'custom-orchestrator',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
      },
      async init({ logger }) {
        logger.info('Custom orchestrator plugin loaded - waiting for Scaffolder to pick up the action');
      },
    });
  },
});
