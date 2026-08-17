// The icon names accepted by the icon= property of the -style command.
// Kept in a module of its own so that both the renderer (svg-symbols.mjs) and
// the -style command can use it without forming an import cycle.

export var iconNames = ['circle', 'square', 'ring', 'star'];

export function isSupportedIconName(name) {
  return iconNames.indexOf(name) > -1;
}
