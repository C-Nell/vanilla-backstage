import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import { githubWorkflowAction } from './actions/githubWorkflowAction';

export const customOrchestratorModule = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'custom-orchestrator',
  register(env) {
    env.registerInit({
      deps: {
        actions: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ actions, config, logger }) { 
        actions.addActions(githubWorkflowAction({ config }));
        logger.info('✅ Custom Orchestrator Action Registered');
      },
    });
  },
});
