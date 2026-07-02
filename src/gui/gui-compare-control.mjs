import { internal } from './gui-core';

// GUI-only "compare with original" feature.
//
// When the Display option is enabled, an eligible edit (a -buffer/-smooth/
// -simplify console command, or entering the simplify slider) snapshots
// the pre-edit shapes of the active polygon/polyline layer into a throwaway
// dataset and draws them on top of the map as an outline. The overlay
// survives panning/zooming but is torn down as soon as the next edit occurs
// (or the option is disabled).
export function CompareControl(gui) {
  var map = gui.map,
      model = gui.model,
      eligibleCommands = {buffer: true, smooth: true, simplify: true},
      pendingSnapshot = null,
      simplifyModeActive = false;

  // Snapshot the pre-command state before an eligible console command mutates
  // the model (dispatched by the console just before running commands).
  gui.on('command_start', function(e) {
    if (!compareEnabled()) return;
    var commands = (e && e.commands) || [];
    var hasEligible = commands.some(function(cmd) {
      return !!eligibleCommands[cmd.name];
    });
    if (!hasEligible) return;
    pendingSnapshot = captureSnapshot();
  });

  // After the model is mutated, promote a pending snapshot to the overlay, or
  // clear the overlay when a subsequent (non-comparison) edit occurs.
  model.on('update', function(e) {
    var flags = (e && e.flags) || {};
    // The simplify slider drives its own lifecycle (see the 'mode' handler);
    // ignore its live redraws so the overlay stays visible during dragging.
    if (simplifyModeActive) return;
    if (flags.simplify_amount || flags.redraw_only) return;
    if (pendingSnapshot) {
      showSnapshot(pendingSnapshot);
      pendingSnapshot = null;
    } else {
      map.setCompareLayer(null);
    }
  });

  // Simplify slider: snapshot on entering simplify mode, keep the overlay alive
  // through slider drags, and clear it on leaving the mode.
  gui.on('mode', function(e) {
    if (e.name == 'simplify' && compareEnabled() && isComparableLayer(getActiveLayer())) {
      simplifyModeActive = true;
      showSnapshot(captureSnapshot());
    } else if (e.prev == 'simplify' && simplifyModeActive) {
      simplifyModeActive = false;
      clearOverlay();
    }
  });

  // Disabling the Display option removes any live overlay immediately.
  gui.on('compare-clear', function() {
    simplifyModeActive = false;
    clearOverlay();
  });

  function compareEnabled() {
    return !!(gui.display && gui.display.getOptions().compareOn);
  }

  function getActiveLayer() {
    var o = model.getActiveLayer();
    return o ? o.layer : null;
  }

  function isComparableLayer(lyr) {
    return !!lyr && (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline');
  }

  // Build a standalone, throwaway dataset holding a geometry-only copy of the
  // active layer (no attribute data, and therefore no style fields). The arcs
  // are deep-copied so later edits to the source don't alter the overlay.
  function captureSnapshot() {
    var active = model.getActiveLayer();
    if (!active || !isComparableLayer(active.layer)) return null;
    var src = active.dataset;
    var dataset = internal.copyDataset({
      layers: [active.layer],
      arcs: src.arcs,
      info: src.info
    });
    var lyr = dataset.layers[0];
    lyr.data = null; // drop attributes (and any style fields)
    lyr.name = 'before';
    delete lyr.gui; // force fresh display enhancement
    // Preserve the source's current simplification level in the copy, so the
    // overlay reflects the geometry as it was when the edit began.
    if (dataset.arcs && src.arcs) {
      dataset.arcs.setRetainedInterval(src.arcs.getRetainedInterval());
    }
    return {layer: lyr, dataset: dataset};
  }

  function showSnapshot(snapshot) {
    if (snapshot) {
      map.setCompareLayer(snapshot.layer, snapshot.dataset);
    }
  }

  function clearOverlay() {
    pendingSnapshot = null;
    map.setCompareLayer(null);
  }
}
