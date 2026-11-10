import { createHash } from 'node:crypto';
import { connectWithRemotePlayerProjection } from '../../dist/index.js';
import { startPortableCounter } from './portable-native-core.mjs';

startPortableCounter(await connectWithRemotePlayerProjection(), bytes => createHash('sha256').update(bytes).digest('hex'));
