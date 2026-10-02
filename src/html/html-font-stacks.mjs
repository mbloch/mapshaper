import { normalizeFamilyName } from '../fonts/mapshaper-font-lookup';

// Font families in HTML output, which differ from the families a map's labels
// are given (and that SVG output keeps) in two ways.
//
// Web fonts: a site's own fonts may be loaded under names unlike those of the
// same fonts installed on a computer (NYTFranklin is nyt-franklin on
// nytimes.com). They are listed before the installed fonts they stand for.
// Only the two NYT fonts are mapped.
//
// Fallbacks: for pages viewed on devices that lack a map's fonts (or before
// its web fonts load). A family list that contains a generic family is the
// user's own fallback plan and is left alone. Any other list is given the
// common fonts of the category its first font belongs to, then that category's
// generic family -- the convention ai2html follows, e.g.
// nyt-franklin,arial,helvetica,sans-serif.

var GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  'math', 'emoji', 'fangsong'];

var FALLBACKS = {
  'sans-serif': ['Helvetica', 'Arial', 'sans-serif'],
  serif: ['Times New Roman', 'Times', 'serif'],
  monospace: ['Menlo', 'Consolas', 'Courier New', 'monospace']
};

// Matched anywhere in a normalized family name, so that the list covers
// variants like "Times New Roman", "Bodoni 72" and nyt-cheltenham.
var SERIF_FONTS = ['times', 'georgia', 'garamond', 'baskerville', 'palatino',
  'bookantiqua', 'cambria', 'didot', 'bodoni', 'minion', 'caslon',
  'centuryschoolbook', 'charter', 'hoefler', 'merriweather', 'playfair',
  'cheltenham', 'imperial'];

var MONOSPACE_FONTS = ['courier', 'menlo', 'monaco', 'consolas',
  'lucidaconsole', 'andalemono', 'sfmono', 'inconsolata'];

// The web fonts that HTML maps on nytimes.com use. Installed NYT fonts have a
// family for each weight ("NYTFranklin Medium") as well as one family for all
// of them, which is the name mapshaper writes.
var NYT_WEB_FONTS = [['NYTFranklin', 'nyt-franklin'], ['NYTCheltenham', 'nyt-cheltenham']];
var NYT_WEIGHTS = {
  '': null, ExtraLight: '200', Light: '300', Book: '400', Medium: '500',
  Semibold: '600', Bold: '700', ExtraBold: '800', Headline: '700'
};
var WEB_FONTS = getNytWebFonts();

// Returns a CSS font-family value for @family, a font-family list
export function addFontFallbacks(family) {
  var names = parseFamilyList(family);
  var lowerNames, category;
  if (names.length === 0) return String(family);
  lowerNames = names.map(function(name) { return name.toLowerCase(); });
  if (!lowerNames.some(isGenericFamily)) {
    category = guessFontCategory(lowerNames[0]);
    FALLBACKS[category].forEach(function(name) {
      if (!lowerNames.includes(name.toLowerCase())) names.push(name);
    });
  }
  return names.map(formatFamilyName).join(', ');
}

function getNytWebFonts() {
  var fonts = [];
  NYT_WEB_FONTS.forEach(function(pair) {
    Object.keys(NYT_WEIGHTS).forEach(function(weightName) {
      fonts.push({
        system: weightName ? pair[0] + ' ' + weightName : pair[0],
        web: pair[1],
        weight: NYT_WEIGHTS[weightName]
      });
    });
  });
  return fonts;
}

// Adds the web font that stands for each system font in @style, a text class's
// properties, just before that system font, which stays in the list for
// computers that have it installed. The weight of a system family with a weight
// in its name (like "NYTFranklin Medium") replaces the label's font-weight, if
// it is the label's first font.
export function applyWebFonts(style) {
  var names = parseFamilyList(style['font-family']);
  var out = [];
  var weight = null;
  if (names.length === 0) return style;
  names.forEach(function(name, i) {
    var font = findWebFont(WEB_FONTS, name);
    if (font && !containsName(names, font.web) && !containsName(out, font.web)) {
      out.push(font.web);
      if (i === 0) weight = font.weight;
    }
    out.push(name);
  });
  style['font-family'] = out.map(formatFamilyName).join(', ');
  if (weight) style['font-weight'] = weight;
  return style;
}

// System font names are compared as the font lookup compares them, so that
// NYTFranklin also matches "NYT Franklin"
function findWebFont(webFonts, name) {
  var key = normalizeFamilyName(name);
  return webFonts.find(function(font) {
    return normalizeFamilyName(font.system) == key;
  }) || null;
}

// Web font names are compared exactly (but for case): nyt-franklin and
// NYTFranklin normalize to the same name
function containsName(names, name) {
  return names.some(function(name2) {
    return name2.toLowerCase() == name.toLowerCase();
  });
}

export function guessFontCategory(name) {
  var key = normalizeFamilyName(name);
  name = name.toLowerCase();
  if (containsFontKey(MONOSPACE_FONTS, key) || /\b(mono|code)\b/.test(name)) {
    return 'monospace';
  }
  if (containsFontKey(SERIF_FONTS, key) || /\bslab\b/.test(name) ||
      /serif/.test(name) && !/sans/.test(name)) {
    return 'serif';
  }
  return 'sans-serif';
}

function containsFontKey(keys, key) {
  return keys.some(function(k) {
    return key.includes(k);
  });
}

function isGenericFamily(name) {
  return GENERIC_FAMILIES.includes(name);
}

function parseFamilyList(family) {
  return String(family || '').split(',').map(unquote).filter(Boolean);
}

function unquote(name) {
  return name.trim().replace(/^['"]|['"]$/g, '').trim();
}

// A name is quoted unless it is a generic family or a run of plain words, so
// that CSS cannot read it as a keyword or a malformed identifier.
function formatFamilyName(name) {
  if (isGenericFamily(name.toLowerCase())) return name;
  if (/^[a-z][a-z-]*$/i.test(name)) return name;
  return '"' + name.replace(/"/g, '') + '"';
}
