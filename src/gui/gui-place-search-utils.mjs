// Pure helpers for the basemap's place search, which uses the Mapbox
// Geocoding API (v6). Kept free of GUI dependencies so they can be tested
// directly.

export var GEOCODE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';

export var PLACE_TYPES = ['country', 'region', 'district', 'place', 'locality', 'neighborhood'];

// Mapbox GL zoom levels for results that come without a bounding box
var ZOOM_BY_TYPE = {
  country: 4,
  region: 6,
  district: 9,
  postcode: 12,
  place: 11,
  locality: 13,
  neighborhood: 14,
  street: 15,
  address: 16
};
var DEFAULT_ZOOM = 12;

// The basemap is not drawn beyond these latitudes
var MAX_LAT = 84;

//   opts.query: text typed by the user
//   opts.token: Mapbox access token
//   opts.proximity: optional [lon, lat] to rank nearby results first
//   opts.limit: optional maximum number of results
//   opts.language: optional language of the results (see getSearchLanguage());
//     without it, Mapbox gives English names where it has them
export function buildGeocodeUrl(opts) {
  var params = [
    'q=' + encodeURIComponent(opts.query),
    'access_token=' + encodeURIComponent(opts.token),
    'autocomplete=true',
    'limit=' + (opts.limit || 5),
    'types=' + PLACE_TYPES.join(',')
  ];
  var p = opts.proximity;
  if (p && isFinite(p[0]) && isFinite(p[1])) {
    params.push('proximity=' + round(p[0]) + ',' + round(p[1]));
  }
  if (opts.language) {
    params.push('language=' + encodeURIComponent(opts.language));
  }
  return GEOCODE_ENDPOINT + '?' + params.join('&');
}

// Scripts that are written in only one of the languages Mapbox supports.
// Kana and Hangul are checked before Han characters, which Japanese and Korean
// text can also contain.
var SCRIPT_LANGUAGES = [
  [/[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/, 'ja'],
  [/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/, 'ko'],
  [/[\u0e00-\u0e7f]/, 'th'],
  [/[\u0e80-\u0eff]/, 'lo'],
  [/[\u1780-\u17ff]/, 'km'],
  [/[\u1000-\u109f]/, 'my'],
  [/[\u10a0-\u10ff]/, 'ka'],
  [/[\u0370-\u03ff\u1f00-\u1fff]/, 'el'],
  [/[\u0590-\u05ff]/, 'he'],
  [/[\u0980-\u09ff]/, 'bn'],
  [/[\u0c00-\u0c7f]/, 'te'],
  [/[\u0900-\u097f]/, 'hi']
];
var HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
var CYRILLIC = /[\u0400-\u04ff]/;
var ARABIC = /[\u0600-\u06ff\u0750-\u077f]/;
var CYRILLIC_LANGUAGES = ['ru', 'uk', 'be', 'bg', 'sr', 'mk', 'mn', 'kk'];
var ARABIC_LANGUAGES = ['ar', 'fa', 'ur'];
// Languages not written in the Latin alphabet: a browser that prefers one of
// them gives no hint about the language of a query in Latin letters
var NON_LATIN_LANGUAGES = ['ja', 'ko', 'zh', 'th', 'lo', 'km', 'my', 'ka', 'el', 'he', 'bn',
  'te', 'hi'].concat(CYRILLIC_LANGUAGES, ARABIC_LANGUAGES);

// The language to ask for results in, from the script of the query: a script
// used by a single language gives that language; otherwise the browser's
// preferred languages decide among those written in the script, e.g. whether
// Chinese characters are Chinese or Japanese, or Latin letters French or
// English.
//   query: text typed by the user
//   browserLanguages: e.g. navigator.languages, most preferred first
// Returns a language tag
export function getSearchLanguage(query, browserLanguages) {
  var prefs = (browserLanguages || []).filter(function(tag) {
    return typeof tag == 'string' && tag.length > 0;
  });
  var match = SCRIPT_LANGUAGES.find(function(o) { return o[0].test(query); });
  var tag;
  if (match) return match[1];
  if (HAN.test(query)) {
    tag = findPreferred(prefs, ['zh', 'ja']);
    if (tag && getPrimaryLanguage(tag) == 'ja') return 'ja';
    return tag && /^zh-(hant|tw|hk|mo)\b/i.test(tag) ? 'zh-Hant' : 'zh-Hans';
  }
  if (CYRILLIC.test(query)) {
    return getPrimaryLanguage(findPreferred(prefs, CYRILLIC_LANGUAGES) || 'ru');
  }
  if (ARABIC.test(query)) {
    return getPrimaryLanguage(findPreferred(prefs, ARABIC_LANGUAGES) || 'ar');
  }
  return prefs.find(function(tag) {
    return !NON_LATIN_LANGUAGES.includes(getPrimaryLanguage(tag));
  }) || 'en';
}

function findPreferred(prefs, languages) {
  return prefs.find(function(tag) {
    return languages.includes(getPrimaryLanguage(tag));
  }) || null;
}

function getPrimaryLanguage(tag) {
  return tag.split(/[-_]/)[0].toLowerCase();
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

// Converts a Geocoding v6 response into a list of places:
//   {name, detail, type, center: [lon, lat], bbox: [xmin, ymin, xmax, ymax] or null}
export function parseGeocodeResponse(json) {
  var features = json && Array.isArray(json.features) ? json.features : [];
  return features.map(parseFeature).filter(Boolean);
}

function parseFeature(f) {
  var props = f.properties || {};
  var center = getFeatureCenter(f);
  if (!center) return null;
  var bbox = props.bbox || f.bbox || null;
  if (!isValidBBox(bbox)) bbox = null;
  return {
    name: props.name_preferred || props.name || props.full_address || '',
    detail: props.place_formatted || '',
    type: props.feature_type || '',
    center: center,
    bbox: bbox
  };
}

function getFeatureCenter(f) {
  var coords = f.properties?.coordinates;
  if (coords && isFinite(coords.longitude) && isFinite(coords.latitude)) {
    return [coords.longitude, coords.latitude];
  }
  coords = f.geometry?.coordinates;
  if (Array.isArray(coords) && isFinite(coords[0]) && isFinite(coords[1])) {
    return [coords[0], coords[1]];
  }
  return null;
}

function isValidBBox(bbox) {
  return Array.isArray(bbox) && bbox.length == 4 && bbox.every(function(n) {
    return typeof n == 'number' && isFinite(n);
  });
}

// Returns the lon/lat box to show for a place, or null if the place should
// instead be centered at the zoom level given by getPlaceZoom(). A box that
// crosses the antimeridian (xmin > xmax) is returned with xmax past 180.
export function getPlaceBBox(place) {
  var bbox = place.bbox;
  if (!bbox) return null;
  var xmin = bbox[0], xmax = bbox[2];
  if (xmin > xmax) xmax += 360;
  var ymin = clampLat(bbox[1]), ymax = clampLat(bbox[3]);
  if (xmax - xmin <= 0 || ymax - ymin <= 0) return null;
  return [xmin, ymin, xmax, ymax];
}

export function clampLat(lat) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export function getPlaceZoom(place) {
  return ZOOM_BY_TYPE[place.type] || DEFAULT_ZOOM;
}

// Web Mercator meters per pixel at a Mapbox GL zoom level (512px tiles),
// the inverse of scaleToZoom() in gui-dynamic-crs
export function zoomToMetersPerPixel(zoom) {
  return 40075017 / 512 / Math.pow(2, zoom);
}
