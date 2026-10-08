import require from '../mapshaper-require';
import {
  findFontFace, findMissingFontGlyphs, findFallbackFaces, getFontWeightAxis,
  splitFontFamilyList
} from './mapshaper-font-lookup';
import { getFontWeight, isItalic } from './mapshaper-text-measure';
import { warn } from '../utils/mapshaper-logging';

// Choosing the fonts resvg draws an SVG document's text with, in Node.
//
// resvg, compiled to WebAssembly, cannot see the fonts installed on the
// computer, so it is handed the files for the faces the document's text asks
// for, found the way label measurement finds them (see
// mapshaper-font-lookup.mjs). Three things a browser does for itself have to be
// done here, or the image is drawn in other fonts than the labels were
// measured and aligned in:
//
// - Family names. The lookup compares names without spaces, punctuation or
//   case, but resvg matches a family only by the exact typographic family name
//   in the font file ("NYTFranklin", not "NYT Franklin", and not the
//   per-weight "NYTFranklin Light"). Names are rewritten to the ones it
//   matches.
// - Fallback. resvg takes a character a label's fonts lack from any other
//   loaded font, but only from fonts it was given, so a font that has it is
//   found and loaded. A character that no font has is removed: resvg stops
//   looking for fallbacks at the first one in a <text> element, which turns
//   every missing character after it into an empty box.
// - Variable fonts. resvg draws one at its default instance, whatever weight
//   the text asks for. That can't be fixed here, only reported.

// Generic families that resvg resolves through its own options, which are
// set to the faces the lookup resolves the same generics to.
var RESVG_GENERICS = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'];

// Returns {svg, font}: @svg with its font families renamed for resvg, and the
// font options to render it with.
export function prepareSvgForResvg(svg) {
  var plan = planResvgFonts(getSvgTextRuns(svg));
  reportResvgFontWarnings(plan.warnings);
  return {
    svg: removeTextChars(renameFontFamilies(svg, plan.names), plan.unavailable),
    font: getResvgFontOptions(plan.faces)
  };
}

// Removes @chars from the text between the document's tags.
export function removeTextChars(svg, chars) {
  if (chars.length === 0) return svg;
  return svg.replace(/>([^<]+)</g, function(match, text) {
    return '>' + Array.from(text).filter(function(ch) {
      return !chars.includes(ch);
    }).join('') + '<';
  });
}

// The faces to load, the family names to rewrite and the warnings to give, for
// the text runs of a document (see getSvgTextRuns()).
export function planResvgFonts(runs) {
  var faces = [];
  var names = {};
  var warnings = {missingFonts: {}, fallbacks: {}, variable: {}};
  var uncovered = [];
  var unavailable = [];
  runs.forEach(function(run) {
    var rec = {'font-weight': run.weight, 'font-style': run.style};
    var weight = getFontWeight(rec);
    var italic = isItalic(rec);
    var families = splitFontFamilyList(run.family);
    var used = null;
    var missing = null;
    if (families.length === 0) families = ['sans-serif'];
    families.forEach(function(family) {
      var face = findFontFace(family, weight, italic, run.stretch);
      if (!face) return;
      if (!RESVG_GENERICS.includes(family.toLowerCase())) {
        names[family] = face.families[0];
      }
      useFace(family, face);
    });
    if (!used) {
      // resvg draws text in none of its families in the default family
      useFace('sans-serif', findFontFace('sans-serif', weight, italic, run.stretch));
    }
    if (!used || used.family != families[0]) {
      warnings.missingFonts[families[0]] = used ? used.face.families[0] : null;
    }
    missing = filterDrawnChars(missing || Array.from(run.text));
    if (missing.length > 0) {
      uncovered.push({family: used ? used.face.families[0] : families[0],
        chars: missing, weight: weight, italic: italic, stretch: run.stretch});
    }

    // Characters the preferred font lacks are drawn from the next one in the
    // list that has them, as in a browser.
    function useFace(family, face) {
      if (!face) return;
      addFace(face);
      missing = (missing || Array.from(run.text)).filter(function(ch) {
        return (findMissingFontGlyphs(face, ch) || [ch]).length > 0;
      });
      if (!used) {
        used = {family: family, face: face};
        checkVariableWeight(face, weight);
      }
    }
  });
  uncovered.forEach(function(o) {
    var found = findFallbackFaces(o.chars, o.weight, o.italic, o.stretch);
    o.chars.forEach(function(ch) {
      var face = found[ch];
      var key = o.family + '|' + (face ? face.families[0] : '');
      if (face) {
        addFace(face);
      } else if (!unavailable.includes(ch)) {
        unavailable.push(ch);
      }
      if (!warnings.fallbacks[key]) {
        warnings.fallbacks[key] = {family: o.family,
          fallback: face ? face.families[0] : null, chars: []};
      }
      if (!warnings.fallbacks[key].chars.includes(ch)) {
        warnings.fallbacks[key].chars.push(ch);
      }
    });
  });
  // the faces resvg resolves the generic families to
  ['sans-serif', 'serif', 'monospace'].forEach(function(family) {
    addFace(findFontFace(family, 400, false));
  });
  return {faces: faces, names: names, unavailable: unavailable,
    warnings: warnings};

  function addFace(face) {
    if (face && !faces.includes(face)) faces.push(face);
  }

  // A browser sets the weight axis to the CSS weight, clamped to the axis.
  // Some older fonts (Apple's Skia) have an axis on a scale of their own, and
  // its default is not a CSS weight to report.
  function checkVariableWeight(face, weight) {
    var axis = getFontWeightAxis(face);
    var cssScale = axis && axis.min >= 1 && axis.max <= 1000;
    if (axis && Math.max(axis.min, Math.min(axis.max, weight)) != axis.default) {
      warnings.variable[face.families[0] + '|' + weight] = {
        family: face.families[0], weight: weight,
        drawn: cssScale ? axis.default : null};
    }
  }
}

function filterDrawnChars(chars) {
  var seen = {};
  return chars.filter(function(ch) {
    var cp = ch.codePointAt(0);
    // Layout controls and variation selectors do not need glyphs of their own.
    if (cp <= 0x20 || cp == 0x200c || cp == 0x200d ||
        cp >= 0xfe00 && cp <= 0xfe0f || cp >= 0xe0100 && cp <= 0xe01ef) {
      return false;
    }
    if (seen[ch]) return false;
    seen[ch] = true;
    return true;
  });
}

function reportResvgFontWarnings(warnings) {
  Object.keys(warnings.missingFonts).forEach(function(family) {
    var used = warnings.missingFonts[family];
    warn('[image] Font "' + family + '" is not installed; ' +
      (used ? 'text in it is drawn in "' + used + '".' :
        'text in it may not be drawn.'));
  });
  Object.keys(warnings.fallbacks).forEach(function(key) {
    var o = warnings.fallbacks[key];
    var chars = JSON.stringify(o.chars.slice(0, 6).join('') +
      (o.chars.length > 6 ? '…' : ''));
    warn('[image] Font "' + o.family + '" has no glyphs for ' + chars + '; ' +
      (o.fallback ? 'they are drawn in "' + o.fallback + '".' :
        'no installed font that images can use has them, so they are ' +
        'left out.'));
  });
  Object.keys(warnings.variable).forEach(function(key) {
    var o = warnings.variable[key];
    warn('[image] "' + o.family + '" is a variable font, which images are ' +
      'drawn in at its default weight' +
      (o.drawn ? ' (' + o.drawn + ')' : '') + ', so text set at weight ' +
      o.weight + ' may be lighter or heavier than in a browser, and misaligned.');
  });
}

function getResvgFontOptions(faces) {
  var opts = {};
  var paths = [];
  var generics = {
    sansSerifFamily: 'sans-serif',
    serifFamily: 'serif',
    monospaceFamily: 'monospace'
  };
  Object.keys(generics).forEach(function(key) {
    var face = findFontFace(generics[key], 400, false);
    if (face) opts[key] = face.families[0];
  });
  opts.defaultFontFamily = opts.sansSerifFamily;
  faces.forEach(function(face) {
    if (!paths.includes(face.path)) paths.push(face.path);
  });
  opts.fontBuffers = paths.map(function(path) {
    return require('fs').readFileSync(path);
  });
  return opts;
}

// Replaces each family in the document's font-family attributes and
// font-family style declarations with the name in @names.
export function renameFontFamilies(svg, names) {
  return svg.replace(/(\sfont-family=")([^"]*)(")/g, renameMatch)
    .replace(/(\sstyle="[^"]*?font-family:\s*)((?:&#?\w+;|[^;"])*)()/g, renameMatch);

  function renameMatch(match, before, value, after) {
    var families = splitFontFamilyList(decodeXml(value));
    var renamed = families.map(function(family) {
      return names[family] || family;
    });
    if (renamed.join() == families.join()) return match;
    return before + escapeXmlAttribute(renamed.map(formatFamilyName).join(', ')) +
      after;
  }
}

function escapeXmlAttribute(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function formatFamilyName(name) {
  if (RESVG_GENERICS.includes(name.toLowerCase())) return name;
  return /^[a-z_][a-z0-9_-]*$/i.test(name) ? name :
    "'" + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

// Text runs with their inherited font properties. Mapshaper generates this
// SVG itself, so a small tokenizer is sufficient and avoids adding an XML DOM
// implementation to the browser bundle.
export function getSvgTextRuns(svg) {
  var initial = {
    family: 'sans-serif',
    weight: 'normal',
    style: 'normal',
    stretch: 'normal'
  };
  var stack = [{font: initial, text: false}];
  var runs = [];
  var tokens = String(svg || '').match(/<[^>]*>|[^<]+/g) || [];
  tokens.forEach(function(token) {
    var current = stack[stack.length - 1];
    var match, tag, font, isText;
    if (token[0] != '<') {
      if (current.text) {
        runs.push(Object.assign({text: decodeXml(token)}, current.font));
      }
      return;
    }
    if (/^<\//.test(token)) {
      if (stack.length > 1) stack.pop();
      return;
    }
    if (/^<[?!]/.test(token)) return;
    match = /^<\s*([^\s/>]+)/.exec(token);
    if (!match) return;
    tag = match[1];
    font = applyFontProperties(current.font, parseSvgAttributes(token));
    isText = current.text || tag == 'text' || tag == 'tspan' || tag == 'textPath';
    if (!/\/\s*>$/.test(token)) {
      stack.push({font: font, text: isText});
    }
  });
  return combineTextRuns(runs);
}

function parseSvgAttributes(tag) {
  var attrs = {};
  var rxp = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  var match;
  while ((match = rxp.exec(tag)) !== null) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function applyFontProperties(parent, attrs) {
  var font = Object.assign({}, parent);
  var names = {
    'font-family': 'family',
    'font-weight': 'weight',
    'font-style': 'style',
    'font-stretch': 'stretch'
  };
  Object.keys(names).forEach(function(name) {
    if (attrs[name]) font[names[name]] = attrs[name];
  });
  parseInlineStyle(attrs.style).forEach(function(decl) {
    if (names[decl.name]) font[names[decl.name]] = decl.value;
  });
  return font;
}

function parseInlineStyle(style) {
  return String(style || '').split(';').map(function(part) {
    var i = part.indexOf(':');
    if (i < 0) return null;
    return {
      name: part.slice(0, i).trim().toLowerCase(),
      value: part.slice(i + 1).replace(/\s*!important\s*$/, '').trim()
    };
  }).filter(Boolean);
}

function combineTextRuns(runs) {
  return runs.reduce(function(out, run) {
    var prev = out[out.length - 1];
    if (prev && prev.family == run.family && prev.weight == run.weight &&
        prev.style == run.style && prev.stretch == run.stretch) {
      prev.text += run.text;
    } else {
      out.push(run);
    }
    return out;
  }, []);
}

function decodeXml(str) {
  return String(str).replace(/&(amp|lt|gt|quot|apos);/g, function(_, name) {
    return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[name];
  }).replace(/&#(x[0-9a-f]+|[0-9]+);/gi, function(_, code) {
    var value = code[0].toLowerCase() == 'x' ?
      parseInt(code.slice(1), 16) : parseInt(code, 10);
    return String.fromCodePoint(value);
  });
}
