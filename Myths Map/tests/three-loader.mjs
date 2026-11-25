import { registerHooks } from 'node:module';

const threeUrl = new URL('../src/vendor/three-0.160.0/three.module.min.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { shortCircuit: true, url: threeUrl };
    }
    return nextResolve(specifier, context);
  },
});
