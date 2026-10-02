// v1.0.17 hotfix: athleticsAssessmentUI.js uses `store` but the release
// omitted its import. Expose the existing store before loading that module.
import { store } from '../data/store.js?v=1.2.4';
globalThis.store = store;
await import('./athleticsAssessmentUI.js?v=1.2.4');
