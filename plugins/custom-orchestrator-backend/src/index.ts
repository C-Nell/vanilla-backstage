import { customOrchestratorModule } from './module';

export { customOrchestratorModule };
export default customOrchestratorModule; // needed so backend.add(import(...)) finds { default: ... }
