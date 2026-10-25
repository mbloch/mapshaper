import { stop } from '../utils/mapshaper-logging';
import { validateElevationEncoding } from './mapshaper-elevation-decoding';

// Source presets for -fetch. A preset is a named bundle of adapter options;
// options given on the command line override the preset's.

var PRESETS = {
  tilezen: {
    adapter: 'xyz',
    title: 'Tilezen terrain tiles (Amazon Open Data)',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 15,
    layer_name: 'elevation',
    // Each tile lists the datasets it was made from in this response header
    sources_header: 'x-amz-meta-x-imagery-sources',
    license: 'Mixed. Public domain in most of the world; some national datasets require attribution.',
    info: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'
  },
  mapterhorn: {
    adapter: 'xyz',
    title: 'Mapterhorn terrain tiles',
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    encoding: 'terrarium',
    scheme: 'xyz',
    tile_size: 512,
    min_zoom: 0,
    max_zoom: 17,
    // Zooms 13-17 only cover areas with high-resolution national data;
    // elsewhere they are missing, so they are only used if requested with zoom=
    auto_max_zoom: 12,
    layer_name: 'elevation',
    attribution: '© Mapterhorn',
    license: 'Open data from various sources, most of which require attribution.',
    info: 'https://mapterhorn.com/attribution'
  }
};

// Dataset names (the first part of each entry in a Tilezen tile's sources
// header) that are public domain or carry no attribution requirement
var TILEZEN_UNRESTRICTED = ['srtm', 'gmted', 'etopo1', 'ned', 'ned13', 'ned_topobathy', 'arcticdem'];

var CUSTOM_DEFAULTS = {
  adapter: 'xyz',
  encoding: 'terrarium',
  scheme: 'xyz',
  tile_size: 256,
  min_zoom: 0,
  max_zoom: 22,
  layer_name: 'elevation'
};

export function getFetchPresetNames() {
  return Object.keys(PRESETS);
}

// Combines a preset (or the defaults for a custom URL) with command options
export function resolveFetchSource(opts) {
  var name = opts.source;
  var preset, source;
  if (!name) {
    stop('Missing a source. Use a preset name (' + getFetchPresetNames().join(', ') +
      ') or a tile URL containing {z}, {x} and {y}');
  }
  if (looksLikeUrl(name)) {
    source = Object.assign({id: 'custom'}, CUSTOM_DEFAULTS, {url: name});
  } else {
    preset = PRESETS[String(name).toLowerCase()];
    if (!preset) {
      stop('Unknown source:', name + '.', 'Available presets:', getFetchPresetNames().join(', '));
    }
    source = Object.assign({id: String(name).toLowerCase()}, preset);
  }
  if (opts.encoding) source.encoding = opts.encoding;
  if (opts.scheme) source.scheme = opts.scheme;
  validateElevationEncoding(source.encoding);
  if (source.scheme != 'xyz' && source.scheme != 'tms') {
    stop('Unsupported tile scheme:', source.scheme + '.', 'Use xyz or tms');
  }
  if (!/\{z\}/.test(source.url) || !/\{x\}/.test(source.url) || !/\{y\}/.test(source.url)) {
    stop('A tile URL must contain {z}, {x} and {y}');
  }
  return source;
}

// Names of datasets in a Tilezen sources header that require attribution
export function findRestrictedTilezenSources(names) {
  return names.filter(function(name) {
    return !TILEZEN_UNRESTRICTED.includes(name);
  });
}

// "srtm/N47W123.tif, gmted/..., etopo1/..." -> ['srtm', 'gmted', 'etopo1']
export function parseTilezenSourcesHeader(str) {
  if (!str) return [];
  return String(str).split(',').map(function(entry) {
    return entry.trim().split('/')[0];
  }).filter(Boolean);
}

function looksLikeUrl(str) {
  return /^https?:\/\//i.test(String(str));
}
