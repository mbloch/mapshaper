import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const extensions = ['mjs', 'js', 'json'];
const resolveDirs = false;

const indexFiles = resolveDirs ? extensions.map(e => `index.${e}`) : [];
const postfixes = extensions.map(e => `.${e}`).concat(indexFiles.map(p => `/${p}`));
const findPostfix = (specifier, context) => (specifier.endsWith('/') ? indexFiles : postfixes).find(p =>
  existsSync(specifier.startsWith('/') ? specifier + p : join(dirname(fileURLToPath(context.parentURL)), specifier + p))
);

const prefixes = ['/', './', '../'];
export function resolve(specifier, context, nextResolve) {
  const postfix = prefixes.some(p => specifier.startsWith(p))
    && !extname(basename(specifier))
    && findPostfix(specifier, context) || '';

  return nextResolve(specifier + postfix);
}
