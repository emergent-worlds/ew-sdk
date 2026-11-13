import { connect } from '../../src/index.js';
import { createYard } from './core.js';

// EW_SDK_CHECK deliberately selects no alternate game or state implementation.
await createYard(await connect());
