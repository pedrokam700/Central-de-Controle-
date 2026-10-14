import {createAmesStore} from '../ames/data/store.mjs';
import {installOperationalContextBridge} from '../ames/operational-context-bridge.mjs';
// The online shell and local workstation entry share this session instance.
export const sessionAmes = createAmesStore();
// Existing views keep their own rendering code, but line selection is one operational
// context. This avoids a second store/app while preserving the nine-view architecture.
if(typeof document!=='undefined')installOperationalContextBridge(document,sessionAmes);
