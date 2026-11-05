import { message, stop, warn } from '../utils/mapshaper-logging';

// Sources served by the Microsoft Planetary Computer data API. A mosaic is
// registered from a search of a collection's items (filtered by year, season
// and cloud cover); its tiles are then fetched like any XYZ tiles. A second
// search lists the items, to report the dates of the imagery.

var API = 'https://planetarycomputer.microsoft.com/api';
var MAX_CLOUD_COVER = 10; // percent
var TROPIC = 23.44;
var PAGE_SIZE = 1000;
var MAX_PAGES = 10;
var TIMEOUT = 30000; // ms

export function getCurrentYear() {
  return new Date().getFullYear();
}

// Checks year= against the preset's range, and applies the default year
export function applyPlanetaryComputerYear(source, yearArg) {
  var range = source.year_range;
  var last = range ? Math.min(range[1] || Infinity, getCurrentYear()) : 0;
  var year = yearArg || (source.default_year == 'last' ? getCurrentYear() - 1 : null);
  if (yearArg && !range) {
    stop('year= is not available for this source');
  }
  if (yearArg && (yearArg < range[0] || yearArg > last)) {
    stop('Year', yearArg, 'is not available for ' + source.id + '. Available years:', range[0] + '-' + last);
  }
  source = Object.assign({}, source, {year: year || null});
  if (source.attribution && year) {
    source.attribution = source.attribution.replace('{year}', year);
  }
  return source;
}

// The months searched for a year: the summer at the area's latitude (ending
// in that year, in the southern hemisphere), or the whole year in the tropics
export function getSeason(year, lat) {
  if (lat >= TROPIC) {
    return {label: 'June-September ' + year, interval: [year + '-06-01T00:00:00Z', year + '-09-30T23:59:59Z']};
  }
  if (lat <= -TROPIC) {
    return {label: 'December ' + (year - 1) + '-March ' + year,
      interval: [(year - 1) + '-12-01T00:00:00Z', year + '-03-31T23:59:59Z']};
  }
  return {label: String(year), interval: [year + '-01-01T00:00:00Z', year + '-12-31T23:59:59Z']};
}

// Returns the search that selects a mosaic's items, in drawing order
export function getMosaicSearch(source, lonLatBbox) {
  var filters = [];
  var sortby = [{field: 'datetime', direction: 'desc'}];
  var season;
  if (source.item_filter) filters.push(source.item_filter);
  if (source.year_property && source.year) {
    filters.push({op: '=', args: [{property: source.year_property}, String(source.year)]});
  }
  if (source.seasonal) {
    season = getSeason(source.year, (lonLatBbox[1] + lonLatBbox[3]) / 2);
    filters.push({op: 'anyinteracts', args: [{property: 'datetime'}, {interval: season.interval}]});
    filters.push({op: '<=', args: [{property: 'eo:cloud_cover'}, MAX_CLOUD_COVER]});
    sortby = [{field: 'eo:cloud_cover', direction: 'asc'}];
  }
  return addFilters({collections: [source.collection], sortby: sortby}, filters);
}

function addFilters(search, filters) {
  if (filters.length > 0) {
    search['filter-lang'] = 'cql2-json';
    search.filter = filters.length == 1 ? filters[0] : {op: 'and', args: filters};
  }
  return search;
}

export function getMosaicTileUrl(source, searchId) {
  return API + '/data/v1/mosaic/' + searchId + '/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?collection=' +
    source.collection + '&' + source.tile_params;
}

// Registers the mosaic and returns the source with its tile URL; also reports
// the dates of the imagery, and stops if none covers the area.
// Returns {source, acquisitions}
export async function preparePlanetaryComputerSource(source, lonLatBbox) {
  var search = getMosaicSearch(source, lonLatBbox);
  var acquisitions = null;
  var season, json;
  source = Object.assign({}, source);
  if (source.seasonal) {
    season = getSeason(source.year, (lonLatBbox[1] + lonLatBbox[3]) / 2);
    source.title = source.title.replace('{season}', season.label);
  } else if (source.title.includes('{year}')) {
    source.title = source.title.replace('{year}', source.year ? source.year + ' ' : '');
  }
  if (source.summary) {
    acquisitions = await findAcquisitions(source, search, lonLatBbox, season);
  }
  try {
    json = await requestJSON(API + '/data/v1/mosaic/register', search);
    if (!json.searchid) throw new Error(json.detail || 'unexpected response');
  } catch(e) {
    stop('Unable to set up the Planetary Computer mosaic (' + (e.message || e) + ')');
  }
  source.url = getMosaicTileUrl(source, json.searchid);
  return {source: source, acquisitions: acquisitions};
}

// Returns a summary of the items that the mosaic draws, or null if the
// search failed
async function findAcquisitions(source, mosaicSearch, lonLatBbox, season) {
  var search = Object.assign({}, mosaicSearch);
  var result, items, years;
  delete search.sortby;
  if (source.summary == 'states') {
    // all years, to list the years available when year= has none
    search = addFilters({collections: search.collections}, source.item_filter ? [source.item_filter] : []);
  }
  try {
    result = await searchItems(search, lonLatBbox);
  } catch(e) {
    warn('Unable to look up the dates of the imagery (' + (e.message || e) + ')');
    return null;
  }
  items = result.items;
  if (source.summary == 'states') {
    years = getUniqueValues(items, 'naip:year').sort();
    items = source.year ? items.filter(function(o) { return o['naip:year'] == source.year; }) :
      getNewestByState(items);
    if (items.length === 0) {
      stop(years.length === 0 ? 'No ' + source.short_name + ' imagery covers this area (coverage: ' + source.coverage + ')' :
        'No ' + source.short_name + ' imagery from ' + source.year + ' covers this area. Years available here: ' + years.join(', '));
    }
    return summarizeByState(items, result.complete);
  }
  if (items.length === 0) {
    stop('No ' + source.short_name + ' scenes with ' + MAX_CLOUD_COVER + '% cloud cover or less were found for this area in ' +
      season.label + '. Try another year with year=');
  }
  return summarizeScenes(items, result.complete);
}

// Follows the search's "next" links; returns {items: [properties], complete}
async function searchItems(search, lonLatBbox) {
  var body = Object.assign({}, search, {
    bbox: getSearchBBox(lonLatBbox),
    limit: PAGE_SIZE,
    fields: {
      include: ['properties.datetime', 'properties.gsd', 'properties.naip:year', 'properties.naip:state'],
      exclude: ['assets', 'links', 'geometry', 'bbox']
    }
  });
  var items = [];
  var json, next;
  for (var i = 0; i < MAX_PAGES; i++) {
    json = await requestJSON(API + '/stac/v1/search', body);
    if (!json || !Array.isArray(json.features)) {
      throw new Error(json && (json.description || json.detail) || 'unexpected response');
    }
    json.features.forEach(function(feat) { items.push(feat.properties || {}); });
    next = (json.links || []).find(function(link) { return link.rel == 'next'; });
    if (!next || !next.body) return {items: items, complete: true};
    body = next.body;
  }
  return {items: items, complete: false};
}

// STAC bboxes cross the antimeridian with west > east
function getSearchBBox(bbox) {
  return bbox[2] > 180 ? [bbox[0], bbox[1], bbox[2] - 360, bbox[3]] : bbox.concat();
}

function getUniqueValues(items, key) {
  return items.reduce(function(memo, o) {
    if (o[key] && !memo.includes(o[key])) memo.push(o[key]);
    return memo;
  }, []);
}

// Each state is flown in one year, so the newest year of each state is what a
// mosaic that draws the newest items first shows
function getNewestByState(items) {
  var newest = {};
  items.forEach(function(o) {
    var state = o['naip:state'];
    if (!newest[state] || o['naip:year'] > newest[state]) newest[state] = o['naip:year'];
  });
  return items.filter(function(o) { return o['naip:year'] == newest[o['naip:state']]; });
}

// [{state, year, start, end, images, resolution}]
export function summarizeByState(items, complete) {
  var groups = [];
  items.forEach(function(o) {
    var state = String(o['naip:state'] || '').toUpperCase();
    var year = +o['naip:year'];
    var date = formatDate(o.datetime);
    var group = groups.find(function(g) { return g.state == state && g.year == year; });
    if (!group) groups.push(group = {state: state, year: year, start: date, end: date, images: 0, resolution: o.gsd});
    group.images++;
    if (date && (!group.start || date < group.start)) group.start = date;
    if (date && (!group.end || date > group.end)) group.end = date;
    if (o.gsd < group.resolution) group.resolution = o.gsd;
  });
  groups.sort(function(a, b) {
    return a.year - b.year || (a.state < b.state ? -1 : a.state > b.state ? 1 : 0);
  });
  return {type: 'states', groups: groups, complete: complete};
}

// {type, scenes, start, end, complete}
export function summarizeScenes(items, complete) {
  var dates = items.map(function(o) { return formatDate(o.datetime); }).filter(Boolean).sort();
  return {type: 'scenes', scenes: items.length, start: dates[0] || null, end: dates[dates.length - 1] || null,
    max_cloud_cover: MAX_CLOUD_COVER, complete: complete};
}

// NAIP: one line per year, e.g. "2023 (CO, 0.3 m): 2023-09-25"
export function formatAcquisitions(summary) {
  var years = [];
  var more = summary.complete ? '' : ' (or more)';
  if (summary.type == 'scenes') {
    return [summary.scenes + more + ' scenes with ' + summary.max_cloud_cover + '% cloud cover or less, acquired ' +
      formatDateRange(summary.start, summary.end) + '; the least cloudy are drawn first'];
  }
  summary.groups.forEach(function(o) {
    var y = years.find(function(y) { return y.year == o.year; });
    if (!y) years.push(y = {year: o.year, states: [], start: o.start, end: o.end, resolutions: []});
    y.states.push(o.state);
    if (!y.resolutions.includes(o.resolution)) y.resolutions.push(o.resolution);
    if (o.start && (!y.start || o.start < y.start)) y.start = o.start;
    if (o.end && (!y.end || o.end > y.end)) y.end = o.end;
  });
  return years.map(function(y) {
    var res = y.resolutions.sort().map(function(r) { return r + ' m'; }).join(', ');
    return y.year + ' (' + y.states.join(', ') + ', ' + res + '): ' + formatDateRange(y.start, y.end) + more;
  });
}

export function reportAcquisitions(summary) {
  var lines = formatAcquisitions(summary);
  if (lines.length == 1) {
    message('Imagery: ' + lines[0]);
  } else if (lines.length > 1) {
    message('Imagery:\n  ' + lines.join('\n  '));
  }
}

function formatDateRange(start, end) {
  if (!start) return 'dates unknown';
  return start == end ? start : start + ' to ' + end;
}

function formatDate(str) {
  return str ? String(str).slice(0, 10) : null;
}

async function requestJSON(url, body) {
  var controller = typeof AbortController == 'function' ? new AbortController() : null;
  var timer = controller ? setTimeout(function() { controller.abort(); }, TIMEOUT) : null;
  var resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    if (!resp.ok) throw new Error('HTTP status ' + resp.status);
    return await resp.json();
  } catch(e) {
    if (controller && controller.signal.aborted) throw new Error('no response after ' + TIMEOUT / 1000 + ' seconds');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
