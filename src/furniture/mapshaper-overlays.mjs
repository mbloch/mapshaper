import { findFrameLayerInDataset, getFrameLayerData } from '../furniture/mapshaper-frame-utils';
import { getFurnitureLayerData, getFurnitureLayerType } from '../furniture/mapshaper-furniture-utils';
import { getFrameById, getFrames } from '../furniture/mapshaper-frame-resolver';
import { markDatasetChanged, noteDatasetWillChange } from '../undo/mapshaper-undo-tracking';
import { DataTable } from '../datatable/mapshaper-data-table';
import { parseSizeParam } from '../geom/mapshaper-units';
import { stop } from '../utils/mapshaper-logging';

// Overlay frames
//
// An overlay is a frame drawn at 1:1 on another frame's page (an inset or
// locator map). The placement belongs to the host: a furniture layer in the
// host frame's dataset holds {type: 'overlay', frame: <ID of the overlay
// frame>, position, margin_x, margin_y}. The overlay frame stays an ordinary
// frame, and one frame can be overlaid on several hosts, each with its own
// placement. Placements are anchored to a corner of the host page, like a
// scalebar; a margin is the distance from the box to the corner's two edges
// (negative margins put the box partly off the page).

export var OVERLAY_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export var DEFAULT_OVERLAY_MARGIN = 10;
var DEFAULT_CORNER_ORDER = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export function layerIsOverlay(lyr) {
  return !!lyr && !lyr.geometry_type && getFurnitureLayerType(lyr) == 'overlay';
}

// The overlay layers of a frame dataset
export function getFrameOverlayLayers(frameDataset) {
  if (!frameDataset || !findFrameLayerInDataset(frameDataset)) return [];
  return frameDataset.layers.filter(layerIsOverlay);
}

export function findOverlayLayer(frameDataset, overlayId) {
  return getFrameOverlayLayers(frameDataset).find(function(lyr) {
    return getFurnitureLayerData(lyr).frame == overlayId;
  }) || null;
}

// The frames that @frame is overlaid on
export function getOverlayHosts(catalog, frame) {
  return getFrames(catalog).filter(function(host) {
    return !!findOverlayLayer(host.dataset, frame.dataset.id);
  });
}

export function isOverlayFrame(catalog, frame) {
  return getOverlayHosts(catalog, frame).length > 0;
}

// The frames overlaid on @host, as [{frame, record}], in drawing order
export function getHostOverlays(catalog, host) {
  return getFrameOverlayLayers(host.dataset).map(function(lyr) {
    var rec = getFurnitureLayerData(lyr);
    return {frame: getFrameById(catalog, rec.frame), record: rec};
  }).filter(function(o) { return !!o.frame; });
}

// Adds, updates or (given null) removes the placement of an overlay frame on
// a host. A new placement is drawn on top of the host's other overlays.
// @placement {position, margin_x, margin_y}
export function setOverlayPlacement(hostDataset, overlayId, placement) {
  var layers = hostDataset.layers;
  var prev = findOverlayLayer(hostDataset, overlayId);
  var idx = layers.indexOf(prev);
  var detail = {operation: 'setFrameOverlay', unit: 'layers'};
  if (!prev && !placement) return;
  noteDatasetWillChange(hostDataset, detail);
  layers = layers.slice();
  if (placement) {
    var lyr = {
      name: prev ? prev.name : 'overlay',
      data: new DataTable([{
        type: 'overlay',
        frame: overlayId,
        position: placement.position,
        margin_x: placement.margin_x,
        margin_y: placement.margin_y
      }])
    };
    if (prev) {
      layers[idx] = lyr;
    } else {
      layers.push(lyr);
    }
  } else {
    layers.splice(idx, 1);
  }
  hostDataset.layers = layers;
  markDatasetChanged(hostDataset, detail);
}

// Applies -frame overlay=, overlay-position= and overlay-margin= to a host:
// adds a placement, or updates an existing one (options that are not given
// keep their values)
export function overlayFrameOnHost(catalog, host, overlay, opts) {
  var rec, placement;
  if (overlay.dataset == host.dataset) {
    stop('A frame cannot be overlaid on itself');
  }
  if (frameOverlaysHost(catalog, overlay, host)) {
    stop('Frame', overlay.layer.name, 'already contains', host.layer.name,
      'as an overlay; overlays cannot contain each other');
  }
  rec = getOverlayRecord(host.dataset, overlay.dataset.id);
  placement = rec ? {
    position: rec.position,
    margin_x: rec.margin_x,
    margin_y: rec.margin_y
  } : {
    position: getFreeOverlayCorner(host.dataset),
    margin_x: DEFAULT_OVERLAY_MARGIN,
    margin_y: DEFAULT_OVERLAY_MARGIN
  };
  if (opts.overlay_position) {
    placement.position = parseOverlayPosition(opts.overlay_position);
  }
  if (opts.overlay_margin !== undefined) {
    Object.assign(placement, parseOverlayMargin(opts.overlay_margin));
  }
  setOverlayPlacement(host.dataset, overlay.dataset.id, placement);
}

function getOverlayRecord(hostDataset, overlayId) {
  var lyr = findOverlayLayer(hostDataset, overlayId);
  return lyr ? getFurnitureLayerData(lyr) : null;
}

// True if @host is drawn inside @frame, directly or through other overlays
function frameOverlaysHost(catalog, frame, host, visited) {
  visited = visited || [];
  if (visited.includes(frame.dataset)) return false;
  visited.push(frame.dataset);
  return getHostOverlays(catalog, frame).some(function(o) {
    return o.frame.dataset == host.dataset ||
      frameOverlaysHost(catalog, o.frame, host, visited);
  });
}

// The first corner not taken by another overlay or the host's scalebar
function getFreeOverlayCorner(hostDataset) {
  var used = getFrameOverlayLayers(hostDataset).map(function(lyr) {
    return getFurnitureLayerData(lyr).position;
  });
  var scalebar = hostDataset.layers.find(function(lyr) {
    return !lyr.geometry_type && getFurnitureLayerType(lyr) == 'scalebar';
  });
  if (scalebar) {
    used.push(normalizeCorner(getFurnitureLayerData(scalebar).position || 'top-left'));
  }
  return DEFAULT_CORNER_ORDER.find(function(corner) {
    return !used.includes(corner);
  }) || DEFAULT_CORNER_ORDER[0];
}

export function parseOverlayPosition(str) {
  var corner = normalizeCorner(str);
  if (!corner) {
    stop('Unsupported overlay-position:', str, '(expected ' + OVERLAY_CORNERS.join(', ') + ')');
  }
  return corner;
}

// Accepts "top-left", "left-top", "topleft", etc.
function normalizeCorner(str) {
  var s = String(str || '').toLowerCase();
  var y = /top/.test(s) ? 'top' : /bottom/.test(s) ? 'bottom' : '';
  var x = /left/.test(s) ? 'left' : /right/.test(s) ? 'right' : '';
  return x && y ? y + '-' + x : '';
}

// "10" -> both margins; "10,20" -> horizontal, vertical. Values take the units
// of size options (e.g. 0.2in); negative values are allowed.
export function parseOverlayMargin(str) {
  var parts = String(str).split(',').map(function(s) { return s.trim(); });
  if (parts.length < 1 || parts.length > 2 || parts.includes('')) {
    stop('Invalid overlay-margin:', str);
  }
  var values = parts.map(parseSignedSize);
  return {margin_x: values[0], margin_y: values.length > 1 ? values[1] : values[0]};
}

function parseSignedSize(str) {
  var neg = str.charAt(0) == '-';
  var px = parseSizeParam(neg ? str.slice(1) : str);
  return roundPx(neg ? -px : px);
}

function roundPx(val) {
  return Math.round(val * 100) / 100 || 0;
}

// The nominal page size of a frame, in pixels
export function getFramePageSize(frame) {
  var data = getFrameLayerData(frame.layer, frame.dataset.arcs);
  return {width: data.width, height: data.height};
}

// The overlay's box on the host page, in host page pixels (top-left origin)
// @host, @overlay {width, height}
export function getOverlayBox(rec, host, overlay) {
  var corner = normalizeCorner(rec.position) || DEFAULT_CORNER_ORDER[0];
  var mx = isFinite(rec.margin_x) ? +rec.margin_x : DEFAULT_OVERLAY_MARGIN;
  var my = isFinite(rec.margin_y) ? +rec.margin_y : DEFAULT_OVERLAY_MARGIN;
  return {
    x: /right/.test(corner) ? host.width - overlay.width - mx : mx,
    y: /bottom/.test(corner) ? host.height - overlay.height - my : my,
    width: overlay.width,
    height: overlay.height
  };
}

// The inverse of getOverlayBox(): a placement anchored to the corner nearest
// to the center of the box
export function getOverlayPlacementFromBox(box, host) {
  var right = box.x + box.width / 2 > host.width / 2;
  var bottom = box.y + box.height / 2 > host.height / 2;
  return {
    position: (bottom ? 'bottom' : 'top') + '-' + (right ? 'right' : 'left'),
    margin_x: roundPx(right ? host.width - box.x - box.width : box.x),
    margin_y: roundPx(bottom ? host.height - box.y - box.height : box.y)
  };
}

// When a frame is replaced (-frame replace), its placements on other frames
// move to the frame replacing it
export function retargetOverlayPlacements(catalog, fromId, toId) {
  getFrames(catalog).forEach(function(host) {
    var rec = getOverlayRecord(host.dataset, fromId);
    if (!rec || host.dataset.id == toId) return;
    setOverlayPlacement(host.dataset, fromId, null);
    setOverlayPlacement(host.dataset, toId, rec);
  });
}

// Keeps placements valid after a command: a placement of a frame that no
// longer exists is removed, so deleting a frame removes it from its hosts in
// the same command; so is a placement in a dataset that is no longer a frame.
export function repairOverlayReferences(catalog) {
  var ids = getFrames(catalog).map(function(o) { return o.dataset.id; });
  catalog.getDatasets().forEach(function(dataset) {
    var isFrame = !!findFrameLayerInDataset(dataset);
    dataset.layers.filter(layerIsOverlay).forEach(function(lyr) {
      var id = getFurnitureLayerData(lyr).frame;
      if (!isFrame) {
        removeLayer(dataset, lyr);
      } else if (!ids.includes(id) || id == dataset.id) {
        setOverlayPlacement(dataset, id, null);
      }
    });
  });
}

function removeLayer(dataset, lyr) {
  var detail = {operation: 'setFrameOverlay', unit: 'layers'};
  noteDatasetWillChange(dataset, detail);
  dataset.layers = dataset.layers.filter(function(o) { return o != lyr; });
  markDatasetChanged(dataset, detail);
}
