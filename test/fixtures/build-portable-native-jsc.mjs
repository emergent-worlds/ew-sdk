/** Build the portable projection fixture with the existing native SDK shell. */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildNativeHeadless } from '../../scripts/build-native-headless.mjs';

const importPath = relative => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));

export function buildPortableNativeJsc(output) {
  const application = `
    import { sha256 } from '@emergentworlds/emergence-engine';
    import { connectWithRemotePlayerProjection } from ${importPath('../../dist/index.js')};
    import { startPortableCounter } from ${importPath('./portable-native-core.mjs')};
    void (async () => {
      const connection = await connectWithRemotePlayerProjection({ url: __launch.url, token: __launch.token });
      startPortableCounter(connection, sha256);
    })().catch(() => __fatal());
  `;
  return buildNativeHeadless(output, application);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('The native projection fixture requires an explicit output path.');
  console.log(JSON.stringify(await buildPortableNativeJsc(resolve(process.argv[2]))));
}
