// The stage's one timer scope (PR-10, docs/scheduling.md). Every timer the stage and its parts start goes through it, so none is bare: a timer
// is owned, counted and can be ended in one place. It lives as long as the stage does (the figure is one instance); a later pass can give each
// view or gesture a scope of its own and dispose it where the thing ends. Delays are the ones the code always had.
import { createScope } from './scope.js';

export const stageScope = createScope();
