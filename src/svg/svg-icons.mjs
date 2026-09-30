// The icon names accepted by the icon= property of the -style command.
// Kept in a module of its own so that both the renderer (svg-symbols.mjs) and
// the -style command can use it without forming an import cycle.

export var iconNames = ['circle', 'square', 'ring', 'star'];

// Icons that render everywhere but are not advertised: the GUI offers them only
// to some users (see gui-nyt.mjs), and a map made with one has to draw the same
// for anyone who opens it.
var unlistedIconNames = ['nyt-star'];

export function isSupportedIconName(name) {
  return iconNames.indexOf(name) > -1 || unlistedIconNames.indexOf(name) > -1;
}
