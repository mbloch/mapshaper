import cmd from '../mapshaper-cmd';
import {
  getDatasetCrsInfo,
  getProjTransform2,
  isLatLngCRS,
  parseCrsString,
  setDatasetCrsInfo
} from '../crs/mapshaper-projections';
import { Bounds } from '../geom/mapshaper-bounds';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { getFrameRef } from '../dataset/mapshaper-frame-membership';
import {
  getDefaultFrame,
  getFrameById,
  getFrameMemberLayers,
  getFrameMembers,
  inheritFrameRef,
  resolveFrameForDataset
} from '../furniture/mapshaper-frame-resolver';
import { getFrameCrsInfo } from '../furniture/mapshaper-frame-members';
import {
  findFrameLayerInDataset,
  getFrameLayerData,
  getMapFrameMetersPerPixel,
  isFrameComponentLayer
} from '../furniture/mapshaper-frame-utils';
import { moveLayersInStack } from '../dataset/mapshaper-layer-stacking';
import { projectRasterGridForward } from '../rasters/mapshaper-raster-reprojection';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterViewRecipe } from '../rasters/mapshaper-raster-utils';
import {
  findRestrictedTilezenSources,
  parseTilezenSourcesHeader,
  resolveFetchSource
} from '../fetch/mapshaper-fetch-sources';
import { fetchElevationMosaic } from '../fetch/mapshaper-tile-fetch';
import {
  chooseTileZoom,
  countTiles,
  getCircularLonRange,
  getTileRange,
  WEB_MERCATOR_MAX_LAT
} from '../fetch/mapshaper-tile-math';
import { runningInBrowser } from '../mapshaper-env';
import { message, stop, warn } from '../utils/mapshaper-logging';

var DEFAULT_MARGIN = 10; // frame pixels
var DEFAULT_WIDTH = 800; // nominal width of a map without a frame
// The GUI on high-density screens and PNG output draw two device pixels per
// frame pixel; a coarser raster would be blurred by upsampling.
var DEFAULT_RASTER_RES = 2;
// tiles are reprojected to a grid this many times finer, then averaged
var SUPERSAMPLING = 2;
var DEFAULT_MAX_TILES = 500;
var MAX_OUTPUT_PIXELS = 12e6; // the supersampled grid is 4x larger
var EXTENT_SAMPLES = 20; // samples along each side of the extent, minus one
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;

// Fetches data for the target frame and returns a new dataset; the caller
// adds it to the catalog (see addFetchedDataset()).
cmd.fetch = async function(catalog, targets, opts) {
  var source = resolveFetchSource(opts);
  var extent = getFetchExtent(catalog, targets, opts);
  var dataset = await fetchElevationDataset(source, extent, opts);
  return {dataset: dataset, extent: extent};
};

// The area, coordinate system and resolution to fetch: from the target's
// frame, else from the target layers, else from bbox=.
// Returns {bbox, crsInfo, width, height, metersPerPixel, frame, targetDataset}
export function getFetchExtent(catalog, targets, opts) {
  var target = targets && targets[0] || null;
  var targetDataset = target ? target.dataset : null;
  var frame = targetDataset ? resolveFrameForDataset(catalog, targetDataset) : getDefaultFrame(catalog);
  var res = opts.raster_res > 0 ? opts.raster_res : DEFAULT_RASTER_RES;
  var margin = opts.margin >= 0 ? opts.margin : DEFAULT_MARGIN;
  var crsInfo, bbox, widthPx, frameData, unitsPerPx, expanded, width, height;
  if (frame && !opts.bbox) {
    crsInfo = getFrameCrsInfo(catalog, frame) || getDatasetCrsInfo(frame.dataset);
    frameData = getFrameLayerData(frame.layer, frame.dataset.arcs, crsInfo.crs);
    bbox = frameData.bbox;
    widthPx = frameData.width;
  } else if (targetDataset) {
    crsInfo = getDatasetCrsInfo(targetDataset);
    bbox = opts.bbox || getTargetBounds(target);
    widthPx = DEFAULT_WIDTH;
  } else if (opts.bbox) {
    crsInfo = {crs: parseCrsString('wgs84'), crs_string: 'wgs84'};
    bbox = opts.bbox;
    widthPx = DEFAULT_WIDTH;
  } else {
    stop('Unable to determine the area to fetch. Create a map frame, target a layer, or use bbox=');
  }
  if (!crsInfo || !crsInfo.crs) {
    stop('Unable to fetch data: the coordinate system of the map is unknown');
  }
  if (!bbox || !(bbox[2] > bbox[0]) || !(bbox[3] > bbox[1])) {
    stop('Unable to fetch data: the area to fetch is empty');
  }
  unitsPerPx = (bbox[2] - bbox[0]) / widthPx;
  expanded = [
    bbox[0] - margin * unitsPerPx,
    bbox[1] - margin * unitsPerPx,
    bbox[2] + margin * unitsPerPx,
    bbox[3] + margin * unitsPerPx
  ];
  width = Math.max(1, Math.round((expanded[2] - expanded[0]) / unitsPerPx * res));
  height = Math.max(1, Math.round((expanded[3] - expanded[1]) / unitsPerPx * res));
  if (width * height > MAX_OUTPUT_PIXELS) {
    stop('The requested raster is too large (' + width + 'x' + height + ' pixels). Use a smaller raster-res= value');
  }
  return {
    bbox: expanded,
    crsInfo: crsInfo,
    width: width,
    height: height,
    metersPerPixel: getGroundMetersPerPixel(bbox, widthPx, crsInfo.crs) / res,
    rasterRes: res,
    frame: frame && !opts.bbox ? frame : null,
    targetDataset: targetDataset
  };
}

function getTargetBounds(target) {
  var bounds = new Bounds();
  target.layers.forEach(function(lyr) {
    var b = getLayerBounds(lyr, target.dataset.arcs);
    if (b && b.hasBounds()) bounds.mergeBounds(b);
  });
  return bounds.hasBounds() ? bounds.toArray() : null;
}

function getGroundMetersPerPixel(bbox, widthPx, crs) {
  var centerLat;
  if (isLatLngCRS(crs)) {
    centerLat = (bbox[1] + bbox[3]) / 2;
    return (bbox[2] - bbox[0]) / widthPx * METERS_PER_DEGREE * Math.cos(centerLat * Math.PI / 180);
  }
  return getMapFrameMetersPerPixel({bbox: bbox, width: widthPx, crs: crs});
}

// Lon-lat bounds of a projected extent, found by inverse-projecting a grid of
// points. Returns [west, south, east, north]; east may exceed 180 when the
// extent crosses the antimeridian.
export function getExtentLonLatBounds(bbox, crs) {
  var toLonLat = isLatLngCRS(crs) ? null : getProjTransform2(crs, parseCrsString('wgs84'));
  var lons = [], lats = [];
  var i, j, x, y, p, lonRange;
  for (i = 0; i <= EXTENT_SAMPLES; i++) {
    for (j = 0; j <= EXTENT_SAMPLES; j++) {
      x = bbox[0] + (bbox[2] - bbox[0]) * i / EXTENT_SAMPLES;
      y = bbox[1] + (bbox[3] - bbox[1]) * j / EXTENT_SAMPLES;
      p = toLonLat ? toLonLat(x, y) : [x, y];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      lons.push(p[0]);
      lats.push(p[1]);
    }
  }
  if (lons.length === 0) {
    stop('Unable to find the geographic extent of the area to fetch');
  }
  lonRange = getCircularLonRange(lons);
  return [
    lonRange[0],
    Math.max(-WEB_MERCATOR_MAX_LAT, Math.min.apply(null, lats)),
    lonRange[1],
    Math.min(WEB_MERCATOR_MAX_LAT, Math.max.apply(null, lats))
  ];
}

async function fetchElevationDataset(source, extent, opts) {
  var lonLatBbox = getExtentLonLatBounds(extent.bbox, extent.crsInfo.crs);
  var centerLat = (lonLatBbox[1] + lonLatBbox[3]) / 2;
  var maxTiles = opts.max_tiles > 0 ? opts.max_tiles : DEFAULT_MAX_TILES;
  var z, range, tileCount, mosaic, grid, raster, dataset, lyr;
  if (!(lonLatBbox[3] > lonLatBbox[1])) {
    stop('The area to fetch is outside the latitude range of the tiles');
  }
  z = opts.zoom >= 0 ? opts.zoom :
    chooseTileZoom(extent.metersPerPixel, centerLat, source.tile_size, source.min_zoom,
      source.auto_max_zoom || source.max_zoom);
  if (z < source.min_zoom || z > source.max_zoom) {
    stop('Zoom level', z, 'is not available. Use a zoom from', source.min_zoom, 'to', source.max_zoom);
  }
  range = getTileRange(lonLatBbox, z);
  tileCount = countTiles(range);
  if (tileCount > maxTiles) {
    stop('This would fetch ' + tileCount + ' tiles at zoom ' + z + ', more than the limit of ' + maxTiles +
      '. Use a lower raster-res= or zoom= value, or raise max-tiles=');
  }
  message('Fetching ' + tileCount + ' tile' + (tileCount == 1 ? '' : 's') + ' at zoom ' + z +
    ' from ' + (source.title || source.url));
  mosaic = await fetchElevationMosaic(source, range);
  if (mosaic.missing == tileCount) {
    stop('No tiles were found for this area');
  }
  if (mosaic.missing > 0) {
    message(mosaic.missing + ' of ' + tileCount + ' tiles were not available; those areas have no data');
  }
  checkTileLicensing(source, mosaic.headerValues);
  grid = averageGridPixels(projectRasterGridForward({grid: mosaic.grid, interpretation: 'continuous'},
    parseCrsString('webmercator'), extent.crsInfo.crs, {
      output_bbox: extent.bbox,
      output_width: extent.width * SUPERSAMPLING,
      output_height: extent.height * SUPERSAMPLING,
      sample_method: 'bilinear'
    }), SUPERSAMPLING);
  raster = {
    sourceId: source.id,
    interpretation: 'continuous',
    grid: grid,
    derivation: {type: 'gray', sourceId: source.id, bands: [0]},
    view: {recipe: {type: 'gray', bands: [0]}}
  };
  raster.view.recipe = getRasterViewRecipe(grid, raster.view.recipe, {});
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  lyr = {
    name: opts.name || source.layer_name,
    raster_type: 'grid',
    raster: raster
  };
  dataset = {
    info: {
      raster_sources: [{
        id: source.id,
        type: 'xyz',
        storage: 'remote',
        url: source.url,
        encoding: source.encoding,
        scheme: source.scheme,
        zoom: z,
        tiles: tileCount,
        bbox: extent.bbox.concat(),
        width: extent.width,
        height: extent.height,
        raster_res: extent.rasterRes,
        margin: opts.margin >= 0 ? opts.margin : DEFAULT_MARGIN
      }]
    },
    layers: [lyr]
  };
  setDatasetCrsInfo(dataset, extent.crsInfo);
  return dataset;
}

// Averages blocks of @f x @f pixels of a one-band grid, skipping invalid
// pixels. Used after reprojecting to a finer grid: the source can have up to
// twice the output resolution, and sampling at the output resolution would
// skip source pixels (aliasing), while blurring first (anti-aliasing) loses
// detail that hillshading needs.
export function averageGridPixels(grid, f) {
  var sw = grid.width;
  var w = Math.floor(sw / f), h = Math.floor(grid.height / f);
  var valid = getRasterValidityMask(grid);
  var src = grid.samples;
  var nodata = grid.nodata;
  var samples = new Float32Array(w * h);
  var coverage = new Uint8Array(w * h);
  var x, y, i, j, k, sum, count;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      sum = 0;
      count = 0;
      for (j = 0; j < f; j++) {
        for (i = 0; i < f; i++) {
          k = (y * f + j) * sw + x * f + i;
          if (valid && !valid[k]) continue;
          sum += src[k];
          count++;
        }
      }
      if (count > 0) {
        samples[y * w + x] = sum / count;
        coverage[y * w + x] = 1;
      } else {
        samples[y * w + x] = nodata;
      }
    }
  }
  return Object.assign({}, grid, {
    width: w,
    height: h,
    samples: samples,
    pixelType: 'float32',
    coverage: coverage,
    transform: [
      (grid.bbox[2] - grid.bbox[0]) / w, 0, grid.bbox[0],
      0, -(grid.bbox[3] - grid.bbox[1]) / h, grid.bbox[3]
    ]
  });
}

function checkTileLicensing(source, headerValues) {
  var names, restricted;
  if (source.attribution) {
    warn('This data requires attribution: ' + source.attribution + '. See ' + source.info);
  }
  if (!source.sources_header) return;
  names = headerValues.reduce(function(memo, str) {
    parseTilezenSourcesHeader(str).forEach(function(name) {
      if (!memo.includes(name)) memo.push(name);
    });
    return memo;
  }, []);
  restricted = findRestrictedTilezenSources(names);
  if (restricted.length > 0) {
    warn('Some of the fetched tiles include data that requires attribution (' + restricted.join(', ') +
      '). See ' + source.info);
  }
}

// Adds a fetched dataset to the catalog: in the target's frame (or the frame
// whose members it was fetched for), at the bottom of the layer stack, so it
// draws beneath vector layers.
export function addFetchedDataset(catalog, result) {
  var dataset = result.dataset;
  var extent = result.extent;
  var frame = extent.frame;
  var targetDataset = extent.targetDataset;
  var sources = [];
  var group;
  if (targetDataset && !findFrameLayerInDataset(targetDataset)) {
    sources = [targetDataset];
  } else if (frame && getFrameMembers(catalog, frame).length > 0) {
    sources = [frame.dataset];
  }
  catalog.captureCatalogBefore({operation: 'fetch'});
  inheritFrameRef(dataset, sources);
  catalog.addDataset(dataset);
  frame = getFrameById(catalog, getFrameRef(dataset));
  group = frame ? getFrameMemberLayers(catalog, frame) : catalog.getLayers().filter(function(o) {
    return !getFrameRef(o.dataset) && !isFrameComponentLayer(o.layer, o.dataset);
  });
  moveLayersInStack(catalog, dataset.layers, {bottom: true}, {
    group: group.map(function(o) { return o.layer; }),
    operation: 'fetch'
  });
}
