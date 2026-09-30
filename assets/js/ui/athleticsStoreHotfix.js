// v1.0.17 hotfix: athleticsAssessmentUI.js uses `store` but the release
// omitted its import. Expose the existing store before loading that module.
import { store } from '../data/store.js';
globalThis.store = store;
await import('./athleticsAssessmentUI.js');
