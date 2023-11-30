const {existsSync} = require('fs');
const {basename, dirname, extname, join} = require('path');
const {fileURLToPath} = require('url');

let extensions = ['mjs', 'js', 'json'], resolveDirs = false

let indexFiles = resolveDirs ? extensions.map(e => `index.${e}`) : []
let postfixes = extensions.map(e => `.${e}`).concat(indexFiles.map(p => `/${p}`))
let findPostfix = (specifier, context) => (specifier.endsWith('/') ? indexFiles : postfixes).find(p =>
  existsSync(specifier.startsWith('/') ? specifier + p : join(dirname(fileURLToPath(context.parentURL)), specifier + p))
)

let prefixes = ['/', './', '../']
module.exports.resolve = function(specifier, context, nextResolve) {
  let postfix = prefixes.some(p => specifier.startsWith(p))
    && !extname(basename(specifier))
    && findPostfix(specifier, context) || ''

  return nextResolve(specifier + postfix)
}