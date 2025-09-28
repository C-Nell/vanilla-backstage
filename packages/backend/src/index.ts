import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// 1. Core system backends
backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// 2. Scaffolder backend must load FIRST
backend.add(import('@backstage/plugin-scaffolder-backend'));

// 3. Scaffolder modules
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-notifications'));

// 4. Your custom orchestrator module must come AFTER scaffolder
backend.add(import('@internal/plugin-custom-orchestrator-backend'));

// 5. TechDocs
backend.add(import('@backstage/plugin-techdocs-backend'));

// 6. Auth
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));

// 7. Catalog
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'));
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// 8. Permissions
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(import('@backstage/plugin-permission-backend-module-allow-all-policy'));

// 9. Search
backend.add(import('@backstage/plugin-search-backend'));
backend.add(import('@backstage/plugin-search-backend-module-pg'));
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// 10. Kubernetes
backend.add(import('@backstage/plugin-kubernetes-backend'));

// 11. Notifications and Signals
backend.add(import('@backstage/plugin-notifications-backend'));
backend.add(import('@backstage/plugin-signals-backend'));

// Start backend
backend.start();
