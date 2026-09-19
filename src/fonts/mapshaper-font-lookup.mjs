import require from '../mapshaper-require';
import { runningInBrowser } from '../mapshaper-env';

// Finding the font file a label's font-family names, among the fonts installed
// on this computer.
//
// The browser does this for us in the GUI; in Node there is nothing between
// mapshaper and the filesystem, so a family name has to be matched against the
// name tables of the files themselves. Names cannot be inferred from
// filenames: NYTFranklinLight.otf calls itself "NYTFranklin Light", and a
// label asking for NYTFranklin at weight 300 has to reach it.
//
// See docs/development/label-tool-design.md.

// Collections (.ttc/.otc) hold several faces in one file and are how macOS
// ships Helvetica, Menlo and Avenir, so a lookup that skipped them would miss
// the font mapshaper's own tool writes by default there.
var FONT_FILE_RXP = /\.(ttf|otf|ttc|otc)$/i;

// What a generic family means when there is no browser to resolve it. A guess,
// but an ordered one: the first of these that is installed is what a browser
// on this platform would almost certainly have picked.
var GENERIC_FAMILIES = {
  'sans-serif': ['Helvetica', 'Arial', 'Liberation Sans', 'DejaVu Sans', 'Roboto', 'Segoe UI'],
  serif: ['Times New Roman', 'Times', 'Liberation Serif', 'DejaVu Serif', 'Georgia'],
  monospace: ['Menlo', 'Courier New', 'Liberation Mono', 'DejaVu Sans Mono', 'Consolas'],
  'system-ui': ['Helvetica Neue', 'Segoe UI', 'Cantarell', 'Roboto'],
  cursive: [],
  fantasy: []
};

var faceCache = {};
var familyCache = {};
var fullIndex = null;
var fileList = null;

// Width classes, as OS/2 numbers them 1 to 9. A font-stretch is one of these
// keywords or a percentage of normal width.
var STRETCH_NAMES = {
  'ultra-condensed': 1, 'extra-condensed': 2, condensed: 3,
  'semi-condensed': 4, normal: 5, 'semi-expanded': 6, expanded: 7,
  'extra-expanded': 8, 'ultra-expanded': 9
};
var STRETCH_PERCENTS = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];

// The face to open for @family in (@weight, @italic, @stretch), or null if this
// computer has no such font: {path, postscriptName}.
//
// postscriptName is how a face inside a collection is named to fontkit, and is
// null for a file holding one face.
export function findFontFace(family, weight, italic, stretch) {
  var key = [family, weight, italic ? 'i' : 'n', stretch || ''].join('|');
  if (!(key in faceCache)) {
    faceCache[key] = lookupFace(family, weight, italic, stretch);
  }
  return faceCache[key];
}

// Which of a family's faces answers a request for (@weight, @italic,
// @stretch).
//
// Width first, then upright before oblique, then the nearest weight, then the
// heavier of two equally near. The first three are the order CSS matches fonts
// in, and the last is the rule the style menu uses to carry a face across a
// change of font (getNearestVariant() in gui-label-fonts.mjs), applied here to
// faces read from files rather than measured in a browser.
//
// A missing face is answered with a near one rather than refused: the browser
// would synthesize the missing weight or slant from exactly this face, so its
// widths are much closer to what is drawn than no measurement at all.
export function pickFace(faces, weight, italic, stretch) {
  var wanted = weight > 0 ? weight : 400;
  var wantedWidth = parseFontStretch(stretch);
  var best = null;
  var bestScore = null;
  (faces || []).forEach(function(face) {
    var score = [
      Math.abs((face.width || 5) - wantedWidth),
      !!face.italic === !!italic ? 0 : 1,
      Math.abs(face.weight - wanted),
      face.weight < wanted ? 1 : 0
    ];
    if (!best || compareScores(score, bestScore) < 0) {
      best = face;
      bestScore = score;
    }
  });
  return best;
}

// A font-stretch as the width class it names, or normal width for anything
// unreadable. A percentage is taken to the nearest class, the way CSS defines
// the keywords.
export function parseFontStretch(stretch) {
  var str = String(stretch === null || stretch === undefined ? '' : stretch).trim().toLowerCase();
  var pct = /^([.0-9]+)%$/.exec(str);
  var best = 5;
  if (STRETCH_NAMES[str]) return STRETCH_NAMES[str];
  if (!pct) return 5;
  STRETCH_PERCENTS.forEach(function(val, i) {
    if (Math.abs(val - Number(pct[1])) <
        Math.abs(STRETCH_PERCENTS[best - 1] - Number(pct[1]))) {
      best = i + 1;
    }
  });
  return best;
}

// Family names are compared without spaces, punctuation or case, so that
// "NYTFranklin" finds "NYT Franklin" and "Helvetica Neue" finds
// "HelveticaNeue". Font vendors are not consistent about any of the three.
export function normalizeFamilyName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The families a face answers to. The typographic family (name ID 16) is the
// one a stylesheet means: every weight of NYTFranklin has its own ID 1 family
// ("NYTFranklin Light", "NYTFranklin Medium") and they are one family only
// under ID 16. Both are indexed, because plenty of fonts have no ID 16.
export function getFaceFamilies(font) {
  var records = font && font.name && font.name.records || {};
  return [pickName(records.preferredFamily), pickName(records.fontFamily),
    font && font.familyName].filter(Boolean);
}

export function clearFontCache() {
  faceCache = {};
  familyCache = {};
  fullIndex = null;
  fileList = null;
}

function lookupFace(family, weight, italic, stretch) {
  var names = resolveFamilyNames(family);
  var face = findBestFace(names, weight, italic, stretch);
  // The filename guess can find a family and still miss one of its faces:
  // Segoe UI Semibold lives in seguisb.ttf, which does not begin with the
  // family's name. Anything other than the face that was asked for is worth
  // the full index -- once per session -- to be sure it is the nearest this
  // machine has.
  if (!fullIndex && !faceAnswersRequest(face, weight, italic, stretch)) {
    fullIndex = readFaces(getFontFiles());
    face = findBestFace(names, weight, italic, stretch) || face;
  }
  return face;
}

function findBestFace(names, weight, italic, stretch) {
  for (var i = 0; i < names.length; i++) {
    var faces = findFamilyFaces(names[i]);
    if (faces && faces.length > 0) return pickFace(faces, weight, italic, stretch);
  }
  return null;
}

function faceAnswersRequest(face, weight, italic, stretch) {
  return !!face && face.weight == (weight > 0 ? weight : 400) &&
    !!face.italic === !!italic && (face.width || 5) == parseFontStretch(stretch);
}

// A font-family is a list, and may end in a generic: each name is tried in
// turn, exactly as a browser would, and a generic stands for the first of its
// candidates that is installed.
function resolveFamilyNames(family) {
  var out = [];
  splitFamilyList(family).forEach(function(name) {
    var generic = GENERIC_FAMILIES[name.toLowerCase()];
    if (generic) {
      out = out.concat(generic);
    } else {
      out.push(name);
    }
  });
  return out;
}

function splitFamilyList(family) {
  return String(family || '').split(',').map(function(name) {
    return name.trim().replace(/^['"]|['"]$/g, '');
  }).filter(Boolean);
}

// Two passes, because parsing every font on the computer costs the best part
// of a second and most lookups do not need it: the file holding a family is
// usually named after it, so files whose name begins with the family's are
// parsed first. Whether that was good enough is lookupFace()'s decision.
function findFamilyFaces(family) {
  var key = normalizeFamilyName(family);
  if (!key) return null;
  if (fullIndex) return fullIndex[key] || null;
  if (!(key in familyCache)) {
    familyCache[key] = readFaces(getLikelyFiles(key))[key] || null;
  }
  return familyCache[key];
}

function getLikelyFiles(key) {
  return getFontFiles().filter(function(file) {
    return normalizeFamilyName(basename(file)).indexOf(key) === 0;
  });
}

// Faces by normalized family name. A file that cannot be parsed is skipped
// rather than reported: a font directory can hold anything, and a broken font
// is not an error in the user's data.
function readFaces(files) {
  var index = {};
  files.forEach(function(file) {
    getFileFaces(file).forEach(function(face) {
      face.families.forEach(function(name) {
        var key = normalizeFamilyName(name);
        if (!key) return;
        if (!index[key]) index[key] = [];
        index[key].push(face);
      });
    });
  });
  return index;
}

function getFileFaces(file) {
  var fontkit = getFontkit();
  var font, fonts;
  if (!fontkit) return [];
  try {
    font = fontkit.openSync(file);
    // A collection reports its members in .fonts; a single font is its own.
    fonts = font && font.fonts || [font];
    return fonts.filter(Boolean).map(function(one) {
      return {
        path: file,
        // Named rather than numbered because fontkit takes a name, and because
        // a name survives a font being reinstalled in a different order.
        postscriptName: font.fonts ? one.postscriptName : null,
        families: getFaceFamilies(one),
        weight: getFaceWeight(one),
        width: getFaceWidth(one),
        italic: isItalicFace(one)
      };
    }).filter(function(face) {
      return face.families.length > 0;
    });
  } catch (e) {
    return [];
  }
}

function getFaceWeight(font) {
  var os2 = font['OS/2'];
  var weight = os2 && os2.usWeightClass;
  return weight > 0 ? weight : 400;
}

function getFaceWidth(font) {
  var os2 = font['OS/2'];
  var width = os2 && os2.usWidthClass;
  return width >= 1 && width <= 9 ? width : 5;
}

function isItalicFace(font) {
  var os2 = font['OS/2'];
  if (os2 && os2.fsSelection && typeof os2.fsSelection.italic == 'boolean') {
    return os2.fsSelection.italic;
  }
  return !!font.italicAngle;
}

// A name record is a string, or an object of translations to pick English out
// of, depending on the font and the version of fontkit.
function pickName(rec) {
  if (!rec) return '';
  if (typeof rec == 'string') return rec;
  return rec.en || Object.keys(rec).map(function(k) { return rec[k]; })[0] || '';
}

function compareScores(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return a[i] - b[i];
  }
  return 0;
}

// Every font file on this computer, listed once. Listing is cheap -- a few
// hundred directory entries -- next to parsing them, so this is not the part
// worth avoiding.
function getFontFiles() {
  var fs = getFs();
  var files = [];
  if (fileList) return fileList;
  if (!fs) return [];
  getFontDirs().forEach(function(dir) {
    var entries;
    try {
      entries = fs.readdirSync(dir, {recursive: true});
    } catch (e) {
      return; // a directory this platform does not have
    }
    entries.forEach(function(entry) {
      var file = dir + '/' + String(entry).split('\\').join('/');
      if (FONT_FILE_RXP.test(file)) files.push(file);
    });
  });
  fileList = files;
  return files;
}

// Where each platform keeps fonts, or MAPSHAPER_FONT_PATH if it is set.
//
// It replaces the platform's directories rather than adding to them, which is
// what makes a machine's font situation something a caller can state: a
// container with its fonts somewhere of its own, a build that has to produce
// the same SVG wherever it runs, a test that needs to know there is nothing to
// find. Several directories are separated by : or ;.
function getFontDirs() {
  var home = getHomeDir();
  var platform = typeof process == 'object' && process.platform || '';
  var dirs = getEnvDirs();
  if (dirs.length > 0) return dirs;
  if (platform == 'darwin') {
    dirs = ['/System/Library/Fonts', '/Library/Fonts',
      '/Network/Library/Fonts'];
    if (home) dirs.push(home + '/Library/Fonts');
  } else if (platform == 'win32') {
    dirs = [(getEnv('WINDIR') || 'C:\\Windows') + '/Fonts'];
    if (home) dirs.push(home + '/AppData/Local/Microsoft/Windows/Fonts');
  } else {
    dirs = ['/usr/share/fonts', '/usr/local/share/fonts', '/run/host/fonts'];
    if (home) {
      dirs.push(home + '/.fonts', home + '/.local/share/fonts');
    }
  }
  return dirs;
}

function getEnvDirs() {
  var val = getEnv('MAPSHAPER_FONT_PATH');
  if (!val) return [];
  return val.split(/[:;]/).filter(Boolean);
}

function getEnv(name) {
  return typeof process == 'object' && process.env && process.env[name] || '';
}

function getHomeDir() {
  var os = safeRequire('os');
  try {
    return os && os.homedir() || '';
  } catch (e) {
    return '';
  }
}

function basename(file) {
  var parts = file.split('/');
  return parts[parts.length - 1].replace(FONT_FILE_RXP, '');
}

function getFs() {
  return safeRequire('fs');
}

// Loaded through the require shim and only when a label actually needs
// measuring, so that the browser bundle -- which is this same file -- never
// reaches for a module it does not have, and a CLI run that touches no labels
// never pays for loading it.
function getFontkit() {
  return safeRequire('fontkit');
}

function safeRequire(name) {
  if (runningInBrowser()) return null;
  try {
    return require(name) || null;
  } catch (e) {
    return null;
  }
}
