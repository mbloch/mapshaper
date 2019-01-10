/*
@requires mapshaper-shape-hit, mapshaper-svg-hit
*/

function HitControl2(gui, ext, mouse) {
  var self = new EventDispatcher();
  // var hitIds = []; // ids of shapes that are currently selected by mouse hover
  var hitData = noData(); // may include additional data from SVG symbol hit (e.g. hit node)
  var active = false;
  var pinned = false;
  var shapeTest;
  var svgTest;
  var targetLayer;

  var priority = 2; // higher than navigation, to allow stopping propagation

  self.setLayer = function(mapLayer) {
    if (!mapLayer) {
      shapeTest = null;
      svgTest = null;
      self.stop();
    } else {
      shapeTest = getShapeHitTest(mapLayer, ext);
      svgTest = getSvgHitTest(mapLayer);
    }
    targetLayer = mapLayer;
    // deselect any  selection
    // TODO: maintain selection if layer & shapes have not changed
    updateHitData(null, null);
  };

  self.start = function() {
    active = true;
  };

  self.stop = function() {
    if (active) {
      updateHitData(null, null); // no hit data, no event
      active = false;
    }
  };

  self.getHitId = function() {return hitData.id;};

  // Get a reference to the active layer, so listeners to hit events can interact
  // with data and shapes
  self.getHitTarget = function() {
    return targetLayer;
  };

  self.getTargetDataTable = function() {
    var targ = self.getHitTarget();
    return targ && targ.layer.data || null;
  };

  self.getSwitchHandler = function(diff) {
    return function() {
      self.switchSelection(diff);
    };
  };

  self.switchSelection = function(diff) {
    var i = hitData.ids.indexOf(hitData.id);
    var n = hitData.ids.length;
    if (i < 0 || n < 2) return;
    if (diff != 1 && diff != -1) {
      diff = 1;
    }
    hitData.id = hitData.ids[(i + diff + n) % n];
    triggerHitEvent('change');
  };

  // make sure popup is unpinned and turned off when switching editing modes
  // (some modes do not support pinning)
  gui.on('interaction_mode_change', function(e) {
    updateHitData(null, null);
  });

  mouse.on('dblclick', handlePointerEvent, null, priority);
  mouse.on('dragstart', handlePointerEvent, null, priority);
  mouse.on('drag', handlePointerEvent, null, priority);
  mouse.on('dragend', handlePointerEvent, null, priority);
  // mouse.on('click', handlePointerEvent, null, priority);

  mouse.on('click', function(e) {
    if (!shapeTest || !active) return;
    e.stopPropagation();

    // TODO: move pinning to inspection control?
    if (gui.interaction.modeUsesClick(gui.interaction.getMode())) {
      togglePin();
    }

    triggerHitEvent('click', e.data);
    triggerHitEvent('change');

  }, null, priority);

  // Hits are re-detected on 'hover' (if hit detection is active)
  mouse.on('hover', function(e) {
    if (!shapeTest || !active || pinned) return;
    var isOver = isOverMap(e);
    if (!isOver) {
      // mouse is off of map viewport -- clear any current hit
      updateHitData(null, e.data); // no hit data, have event data

    } else if (e.hover) {
      // mouse is hovering directly over map area -- update hit detection
      hitTest(e);

    } else {
      // mouse is over map viewport but not directly over map (e.g. hovering
      // over popup) -- don't update hit detection
    }
  }, null, priority);

  function noData() {return {ids: [], id: -1};}

  function togglePin() {
    if (pinned) {
      // TODO:
      pinned = false;
    } else if (hitData.id > -1) {
      pinned = true;
    } else {
      pinned = false;
    }
  }

  function hitTest(e) {
    // Try SVG hit test first, fall through to shape-based hit test
    var p = ext.translatePixelCoords(e.x, e.y);
    var data = svgTest(e); // null or a data object
    var shapeHitIds = shapeTest(p[0], p[1]);
    if (shapeHitIds && data) {
      // if both SVG hit and shape hit, use both
      data.ids = utils.uniq(data.ids.concat(shapeHitIds));
    } else if (shapeHitIds) {
      // if only shape hit, use shape hit ids
      data = {ids: shapeHitIds};
    }
    updateHitData(data, e.data);
  }

  // If hit ids have changed, update stored hit ids and fire 'hover' event
  // evt: (optional) mouse event
  function updateHitData(newData, evtData) {
    if (!newData) {
      newData = noData();
    } else {
      newData = utils.extend({}, newData); // make a copy
    }
    if (sameIds(newData.ids, hitData.ids)) {
      return;
    }
    // update selected id
    if (hitData.id > -1 && newData.ids.indexOf(hitData.id) > -1) {
      newData.id = hitData.id;
    } else if (newData.ids.length > 0) {
      newData.id = newData.ids[0];
    } else {
      newData.id = -1;
    }
    hitData = newData;
    pinned = false;
    gui.container.findChild('.map-layers').classed('hover', newData.ids.length > 0);
    if (active) {
      triggerHitEvent('hover', evtData || {});
      triggerHitEvent('change');
    }
  }

  // check if an event is used in the current interaction mode
  function eventIsEnabled(type) {
    var mode = gui.interaction.getMode();
    if (type == 'click' && !gui.interaction.modeUsesClick(mode)) {
      return false;
    }
    if ((type == 'drag' || type == 'dragstart' || type == 'dragend') && !gui.interaction.modeUsesDrag(mode)) {
      return false;
    }
    return true;
  }

  function isOverMap(e) {
    return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
  }

  function handlePointerEvent(e) {
    if (!shapeTest || !active) return;
    if (self.getHitId() == -1) return; // ignore pointer events when no features are being hit
    // don't block pan and other navigation in modes when they are not being used
    if (eventIsEnabled(e.type)) {
      e.stopPropagation(); // block navigation
      triggerHitEvent(e.type, e.data);
    }
  }

  function refreshHitData(d) {
    if (!d || !d.container || d.id > -1 == false) {
      return;
    }
  }

  // d: event data (may be a pointer event object, an ordinary object or empty)
  function triggerHitEvent(type, d) {
    // var id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
    // Merge stored hit data into the event data
    var eventData = utils.extend({pinned: pinned}, d || {}, hitData);
    self.dispatchEvent(type, eventData);
  }

  function sameIds(a, b) {
    if (a.length != b.length) return false;
    for (var i=0; i<a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  return self;
}
