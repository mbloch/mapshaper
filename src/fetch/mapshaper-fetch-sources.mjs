import { stop } from '../utils/mapshaper-logging';
import { validateTileEncoding } from './mapshaper-elevation-decoding';
import { applyPlanetaryComputerYear } from './mapshaper-planetary-computer';

// Source presets for -fetch. A preset is a named bundle of adapter options;
// options given on the command line override the preset's. A preset with
// several editions lists them in "years", each with the settings that differ
// by year.

var GIBS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
var GIBS_CREDIT = 'NASA Global Imagery Browse Services (GIBS), part of NASA\'s Earth Science Data and Information System (ESDIS)';
var GIBS_INFO = 'https://nasa-gibs.github.io/gibs-api-docs/';
var PC_DATASETS = 'https://planetarycomputer.microsoft.com/dataset/';
var USGS_ELEVATION_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';
// The server reprojects with reproject= (nearest-neighbor by default, which
// stripes hillshades of lat-long DEMs); resampling= only applies to overviews
var PC_ELEVATION_TILES = 'assets=data&algorithm=terrarium&resampling=bilinear&reproject=bilinear&format=png';
var LANDSAT_TILES = 'assets=red&assets=green&assets=blue&nodata=0&format=png&color_formula=' +
  encodeURIComponent('gamma RGB 2.7, saturation 1.5, sigmoidal RGB 15 0.55');

var PRESETS = {
  tilezen: {
    coverage: 'World',
    resolution: 'about 10 m in the US, 30-90 m elsewhere',
    terms: 'mostly public domain, some sources require attribution',
    adapter: 'xyz',
    title: 'Tilezen terrain tiles (Amazon Open Data)',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 15,
    // Each tile lists the datasets it was made from in this response header
    sources_header: 'x-amz-meta-x-imagery-sources',
    license: 'Mixed. Public domain in most of the world; some national datasets require attribution.',
    info: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'
  },
  mapterhorn: {
    coverage: 'World',
    resolution: '30 m, finer where national lidar is available (zoom= 13-17)',
    terms: 'attribution required',
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
    attribution: '© Mapterhorn',
    license: 'Open data from various sources, most of which require attribution.',
    info: 'https://mapterhorn.com/attribution'
  },
  copernicus: {
    coverage: 'World',
    resolution: '30 m',
    terms: 'free, attribution required',
    adapter: 'planetary-computer',
    title: 'Copernicus DEM GLO-30 (Microsoft Planetary Computer)',
    collection: 'cop-dem-glo-30',
    tile_params: PC_ELEVATION_TILES,
    encoding: 'terrarium',
    min_zoom: 8,
    max_zoom: 14,
    // 30 m cells
    auto_max_zoom: 12,
    attribution: '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
    license: 'Copernicus DEM license: free, including commercial use, with attribution.',
    info: PC_DATASETS + 'cop-dem-glo-30'
  },
  '3dep': {
    coverage: 'United States',
    resolution: '10 m',
    terms: 'public domain',
    adapter: 'planetary-computer',
    title: 'USGS 3DEP seamless DEM, 1/3 arc-second (Microsoft Planetary Computer)',
    collection: '3dep-seamless',
    item_filter: {op: '=', args: [{property: 'gsd'}, 10]},
    tile_params: PC_ELEVATION_TILES,
    encoding: 'terrarium',
    min_zoom: 8,
    max_zoom: 16,
    // 10 m cells
    auto_max_zoom: 13,
    credit: 'USGS 3D Elevation Program',
    license: 'Public domain.',
    info: PC_DATASETS + '3dep-seamless'
  },
  '3dep-1m': {
    coverage: 'United States',
    resolution: '1 m where there is lidar, 10 m or coarser elsewhere',
    terms: 'public domain',
    adapter: 'xyz',
    title: 'USGS 3DEP best available elevation (The National Map)',
    // the server resamples the best available DEM to each tile's bounds
    url: USGS_ELEVATION_URL + '/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857' +
      '&size=512,512&format=bsq&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image',
    encoding: 'bsq',
    scheme: 'xyz',
    tile_size: 512,
    min_zoom: 0,
    max_zoom: 18,
    // about 1 m pixels
    auto_max_zoom: 16,
    // the server answers 502 for spells of 10-15 seconds
    retries: 5,
    credit: 'USGS 3D Elevation Program',
    license: 'Public domain.',
    info: USGS_ELEVATION_URL
  },
  bluemarble: {
    coverage: 'World',
    resolution: '500 m',
    terms: 'no restrictions',
    adapter: 'xyz',
    title: 'NASA Blue Marble: Next Generation (GIBS)',
    url: GIBS_URL + 'BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 8,
    credit: GIBS_CREDIT,
    license: 'NASA data, free of restrictions.',
    info: GIBS_INFO
  },
  blackmarble: {
    description: 'NASA Black Marble night lights (NASA GIBS)',
    coverage: 'World, night lights',
    resolution: '500 m',
    terms: 'no restrictions',
    adapter: 'xyz',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 8,
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
    coverage: 'United States (world at small scales)',
    resolution: 'about 1 m (NAIP 2017-2021)',
    terms: 'public domain',
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
    credit: 'USGS The National Map: Orthoimagery',
    license: 'Public domain.',
    info: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer'
  },
  naip: getNaipPreset('NAIP {year}aerial imagery', 'NAIP aerial imagery', '1,2,3'),
  'naip-cir': getNaipPreset('NAIP {year}color-infrared imagery', 'NAIP color-infrared imagery', '4,1,2'),
  sentinel2: {
    description: 'Sentinel-2 imagery, least cloudy scenes of a summer (Microsoft Planetary Computer)',
    coverage: 'World',
    resolution: '10 m',
    terms: 'free, attribution required',
    adapter: 'planetary-computer',
    title: 'Sentinel-2 imagery, {season} (Microsoft Planetary Computer)',
    short_name: 'Sentinel-2',
    collection: 'sentinel-2-l2a',
    tile_params: 'assets=visual&asset_bidx=' + encodeURIComponent('visual|1,2,3') + '&nodata=0&format=png',
    seasonal: true,
    summary: 'scenes',
    year_range: [2016, null],
    default_year: 'last',
    encoding: 'rgb',
    // lower zooms are blank: a tile would need too many scenes
    min_zoom: 9,
    max_zoom: 16,
    // 10 m pixels
    auto_max_zoom: 13,
    attribution: 'Contains modified Copernicus Sentinel data {year}',
    license: 'Copernicus Sentinel data terms: free, including commercial use, with attribution.',
    info: PC_DATASETS + 'sentinel-2-l2a'
  },
  landsat: {
    description: 'Landsat imagery, least cloudy scenes of a summer (Microsoft Planetary Computer)',
    coverage: 'World',
    resolution: '30 m',
    terms: 'public domain',
    adapter: 'planetary-computer',
    title: 'Landsat imagery, {season} (Microsoft Planetary Computer)',
    short_name: 'Landsat',
    collection: 'landsat-c2-l2',
    // Landsat 7 images since 2003 have gaps in stripes (its scan line corrector failed)
    item_filter: {op: 'in', args: [{property: 'platform'}, ['landsat-4', 'landsat-5', 'landsat-8', 'landsat-9']]},
    tile_params: LANDSAT_TILES,
    seasonal: true,
    summary: 'scenes',
    year_range: [1982, null],
    default_year: 'last',
    encoding: 'rgb',
    min_zoom: 8,
    max_zoom: 14,
    // 30 m pixels
    auto_max_zoom: 11,
    credit: 'Landsat imagery courtesy of the U.S. Geological Survey',
    license: 'Public domain.',
    info: PC_DATASETS + 'landsat-c2-l2'
  },
  eox: {
    description: 'EOxCloudless cloud-free Sentinel-2 mosaics (EOX)',
    coverage: 'World',
    resolution: '10 m',
    terms: '2016 CC BY 4.0, 2018 and later non-commercial (CC BY-NC-SA 4.0)',
    adapter: 'xyz',
    encoding: 'rgb',
    scheme: 'xyz',
    tile_size: 256,
    min_zoom: 0,
    max_zoom: 16,
    // Sentinel-2 imagery has 10m pixels, about the size of a zoom 14 pixel;
    // higher zooms are enlarged
    auto_max_zoom: 14,
    info: 'https://cloudless.eox.at/documentation/license',
    default_year: 2025,
    years: getEoxYears([2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
  }
};

// Dataset names (the first part of each entry in a Tilezen tile's sources
// header) that are public domain or carry no attribution requirement
var TILEZEN_UNRESTRICTED = ['srtm', 'gmted', 'etopo1', 'ned', 'ned13', 'ned_topobathy', 'arcticdem'];

var PLANETARY_COMPUTER_DEFAULTS = {
  scheme: 'xyz',
  tile_size: 512
};

var CUSTOM_DEFAULTS = {
  adapter: 'xyz',
  encoding: 'terrarium',
  scheme: 'xyz',
  tile_size: 256,
  min_zoom: 0,
  max_zoom: 22
};

function getBlackMarbleYear(year) {
  return {
    title: 'NASA Black Marble ' + year + ' (GIBS)',
    url: GIBS_URL + 'VIIRS_Black_Marble/default/' + year + '-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
  };
}

// Without year=, the newest imagery of each state. PNG rather than JPEG
// tiles, so areas outside the coverage are transparent.
function getNaipPreset(title, description, bands) {
  return {
    adapter: 'planetary-computer',
    title: title + ' (Microsoft Planetary Computer)',
    description: description + ' (Microsoft Planetary Computer)',
    short_name: 'NAIP',
    coverage: 'Conterminous United States',
    resolution: '0.3-1 m',
    terms: 'public domain',
    collection: 'naip',
    tile_params: 'assets=image&asset_bidx=' + encodeURIComponent('image|' + bands) + '&format=png',
    year_property: 'naip:year',
    summary: 'states',
    year_range: [2010, null],
    encoding: 'rgb',
    min_zoom: 11,
    // 0.3-1 m pixels
    max_zoom: 18,
    credit: 'USDA Farm Production and Conservation Business Center (NAIP)',
    license: 'Public domain.',
    info: PC_DATASETS + 'naip'
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

// The presets for "-fetch sources", as help lines: a string is a line of
// text, and [name, text] is a row of a two-column table (see -help)
export function getFetchSourceList() {
  var names = getFetchPresetNames();
  var lines = [];
  [['ELEVATION', false], ['IMAGERY', true]].forEach(function(group, i) {
    if (i > 0) lines.push('');
    lines.push(group[0]);
    names.forEach(function(name) {
      var preset = PRESETS[name];
      if ((preset.encoding == 'rgb') != group[1]) return;
      lines.push([name, preset.description || preset.title]);
      lines.push(['', getPresetDetails(preset).join('; ')]);
    });
  });
  lines.push('', 'Use -fetch <name>, or a URL template with {z}, {x} and {y}');
  return lines;
}

export function formatFetchSourceList(lines) {
  var width = lines.reduce(function(memo, line) {
    return Array.isArray(line) ? Math.max(memo, line[0].length) : memo;
  }, 0);
  return lines.map(function(line) {
    return Array.isArray(line) ? line[0].padEnd(width + 2) + line[1] : line;
  }).join('\n');
}

function getPresetDetails(preset) {
  var details = [preset.coverage + ', ' + preset.resolution];
  var years;
  if (preset.years) {
    years = Object.keys(preset.years).map(Number);
    details.push('year= ' + formatYearList(years) + ' (default: ' + preset.default_year + ')');
  } else if (preset.year_range) {
    details.push('year= ' + preset.year_range[0] + ' and later (default: ' +
      (preset.default_year == 'last' ? 'last year' : 'newest') + ')');
  }
  if (preset.min_zoom > 0) {
    details.push('zoom ' + preset.min_zoom + ' and up');
  }
  details.push(preset.terms);
  return details;
}

// [2016, 2018, 2019, 2020] -> "2016, 2018-2020"
function formatYearList(years) {
  var parts = [];
  years.sort().forEach(function(year, i) {
    var last = parts[parts.length - 1];
    if (last && year == years[i - 1] + 1) {
      last[1] = year;
    } else {
      parts.push([year, year]);
    }
  });
  return parts.map(function(p) { return p[0] == p[1] ? p[0] : p[0] + '-' + p[1]; }).join(', ');
}

// Combines a preset (or the defaults for a custom URL) with command options
export function resolveFetchSource(opts) {
  var name = opts.source;
  var preset, source, id;
  if (!name) {
    stop('Missing a source. Use a preset name (' + getFetchPresetNames().join(', ') +
      ') or a tile URL containing {z}, {x} and {y} (or {bbox-epsg-3857}). Run -fetch sources for a list');
  }
  if (looksLikeUrl(name)) {
    source = Object.assign({id: 'custom'}, CUSTOM_DEFAULTS, {url: name});
  } else {
    id = String(name).toLowerCase();
    preset = PRESETS[id];
    if (!preset) {
      stop('Unknown source:', name + '.', 'Available presets:', getFetchPresetNames().join(', ') +
        '. Run -fetch sources for details');
    }
    source = Object.assign({id: id}, preset.adapter == 'planetary-computer' ? PLANETARY_COMPUTER_DEFAULTS : null, preset);
  }
  if (source.adapter == 'planetary-computer') {
    source = applyPlanetaryComputerYear(source, opts.year);
  } else if (source.years) {
    source = applyYear(source, opts.year);
  } else if (opts.year) {
    stop('year= is not available for this source');
  }
  if (opts.encoding) source.encoding = opts.encoding;
  if (opts.scheme) source.scheme = opts.scheme;
  validateTileEncoding(source.encoding);
  // layers are named after their preset, or for a URL, after their contents
  source.layer_name = source.id != 'custom' ? source.id : source.encoding == 'rgb' ? 'imagery' : 'elevation';
  if (source.scheme != 'xyz' && source.scheme != 'tms') {
    stop('Unsupported tile scheme:', source.scheme + '.', 'Use xyz or tms');
  }
  // the tile URL of a Planetary Computer mosaic is known after registering it
  if (source.adapter != 'planetary-computer' && !usesBBoxToken(source.url) &&
      (!/\{z\}/.test(source.url) || !/\{x\}/.test(source.url) || !/\{y\}/.test(source.url))) {
    stop('A tile URL must contain {z}, {x} and {y}, or {bbox-epsg-3857}');
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

// {bbox-epsg-3857} is replaced by a tile's Web Mercator bounds, as in
// Mapbox GL and MapLibre; it lets WMS and ArcGIS export URLs act as tiles
export function usesBBoxToken(url) {
  return /\{bbox-epsg-3857\}/.test(url);
}

function looksLikeUrl(str) {
  return /^https?:\/\//i.test(String(str));
}
