import { stop } from '../utils/mapshaper-logging';
import { validateTileEncoding } from './mapshaper-elevation-decoding';

// Source presets for -fetch. A preset is a named bundle of adapter options;
// options given on the command line override the preset's. A preset with
// several editions lists them in "years", each with the settings that differ
// by year.

var GIBS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
var GIBS_CREDIT = 'NASA Global Imagery Browse Services (GIBS), part of NASA\'s Earth Science Data and Information System (ESDIS)';
var GIBS_INFO = 'https://nasa-gibs.github.io/gibs-api-docs/';

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
  },
  bluemarble: {
    adapter: 'xyz',
    title: 'NASA Blue Marble: Next Generation (GIBS)',
    url: GIBS_URL + 'BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 8,
    layer_name: 'bluemarble',
    credit: GIBS_CREDIT,
    license: 'NASA data, free of restrictions.',
    info: GIBS_INFO
  },
  blackmarble: {
    adapter: 'xyz',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 8,
    layer_name: 'blackmarble',
    credit: GIBS_CREDIT,
    license: 'NASA data, free of restrictions.',
    info: GIBS_INFO,
    default_year: 2016,
    years: {
      2012: getBlackMarbleYear(2012),
      2016: getBlackMarbleYear(2016)
    }
  },
  usgs: {
    adapter: 'xyz',
    title: 'USGS The National Map: Orthoimagery',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    // Imagery covers the world at low zooms and the United States at higher
    // zooms; tiles outside the coverage are missing
    max_zoom: 16,
    layer_name: 'usgs',
    credit: 'USGS The National Map: Orthoimagery',
    license: 'Public domain.',
    info: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer'
  },
  eox: {
    adapter: 'xyz',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 16,
    // Sentinel-2 imagery has 10m pixels, about the size of a zoom 14 pixel;
    // higher zooms are enlarged
    auto_max_zoom: 14,
    layer_name: 'eox',
    info: 'https://cloudless.eox.at/documentation/license',
    default_year: 2025,
    years: getEoxYears([2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
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

function getBlackMarbleYear(year) {
  return {
    title: 'NASA Black Marble ' + year + ' (GIBS)',
    url: GIBS_URL + 'VIIRS_Black_Marble/default/' + year + '-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
  };
}

function getEoxYears(years) {
  return years.reduce(function(memo, year) {
    var layer = year == 2016 ? 's2cloudless_3857' : 's2cloudless-' + year + '_3857';
    var dataYears = year == 2018 ? '2017 & 2018' : String(year);
    memo[year] = {
      title: 'EOxCloudless ' + year + ' (Sentinel-2 cloudless imagery by EOX)',
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/' + layer + '/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
      attribution: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ' + dataYears + ')',
      license: year == 2016 ? 'CC BY 4.0' : 'CC BY-NC-SA 4.0',
      non_commercial: year != 2016
    };
    return memo;
  }, {});
}

export function getFetchPresetNames() {
  return Object.keys(PRESETS);
}

// Combines a preset (or the defaults for a custom URL) with command options
export function resolveFetchSource(opts) {
  var name = opts.source;
  var preset, source, id;
  if (!name) {
    stop('Missing a source. Use a preset name (' + getFetchPresetNames().join(', ') +
      ') or a tile URL containing {z}, {x} and {y}');
  }
  if (looksLikeUrl(name)) {
    source = Object.assign({id: 'custom'}, CUSTOM_DEFAULTS, {url: name});
  } else {
    id = String(name).toLowerCase();
    preset = PRESETS[id];
    if (!preset) {
      stop('Unknown source:', name + '.', 'Available presets:', getFetchPresetNames().join(', '));
    }
    source = Object.assign({id: id}, preset);
  }
  if (source.years) {
    source = applyYear(source, opts.year);
  } else if (opts.year) {
    stop('year= is not available for this source');
  }
  if (opts.encoding) source.encoding = opts.encoding;
  if (opts.scheme) source.scheme = opts.scheme;
  validateTileEncoding(source.encoding);
  if (source.id == 'custom' && source.encoding == 'rgb') source.layer_name = 'imagery';
  if (source.scheme != 'xyz' && source.scheme != 'tms') {
    stop('Unsupported tile scheme:', source.scheme + '.', 'Use xyz or tms');
  }
  if (!/\{z\}/.test(source.url) || !/\{x\}/.test(source.url) || !/\{y\}/.test(source.url)) {
    stop('A tile URL must contain {z}, {x} and {y}');
  }
  return source;
}

function applyYear(source, yearArg) {
  var year = yearArg || source.default_year;
  var settings = source.years[year];
  var years = Object.keys(source.years);
  if (!settings) {
    stop('Year', year, 'is not available for ' + source.id + '. Available years:', years.join(', '));
  }
  source = Object.assign({}, source, settings, {year: +year});
  delete source.years;
  delete source.default_year;
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
