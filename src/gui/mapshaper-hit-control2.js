/*
@requires mapshaper-shape-hit, mapshaper-svg-hit
*/

function HitControl2(gui, ext, mouse) {
  var self = new EventDispatcher();
  var storedData = noHitData(); // may include additional data from SVG symbol hit (e.g. hit node)
  var active = false;
  var shapeTest;
  var svgTest;
  var targetLayer;
  // event priority is higher than navigation, so stopping propagation disables
  // pan navigation
  var priority = 2;

  self.setLayer = function(mapLayer) {
    if (!mapLayer || !internal.layerHasGeometry(mapLayer.layer)) {
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
    updateHitData(null);
  };

  self.start = function() {
    active = true;
  };

  self.stop = function() {
    if (active) {
      updateHitData(null); // no hit data, no event
      active = false;
    }
  };

  self.getHitId = function() {return storedData.id;};

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
    var i = storedData.ids.indexOf(storedData.id);
    var n = storedData.ids.length;
    if (i < 0 || n < 2) return;
    if (diff != 1 && diff != -1) {
      diff = 1;
    }
    storedData.id = storedData.ids[(i + diff + n) % n];
    triggerHitEvent('change');
  };

  // make sure popup is unpinned and turned off when switching editing modes
  // (some modes do not support pinning)
  gui.on('interaction_mode_change', function(e) {
    updateHitData(null);
    if (e.mode == 'off') {
      self.stop();
    } else {
      self.start();
    }
  });

  mouse.on('dblclick', handlePointerEvent, null, priority);
  mouse.on('dragstart', handlePointerEvent, null, priority);
  mouse.on('drag', handlePointerEvent, null, priority);
  mouse.on('dragend', handlePointerEvent, null, priority);

  mouse.on('click', function(e) {
    var hitData;
    if (!shapeTest || !active) return;
    e.stopPropagation();

    // TODO: move pinning to inspection control?
    if (gui.interaction.modeUsesClick(gui.interaction.getMode())) {
      hitData = hitTest(e);
      // TOGGLE pinned state under some conditions
      if (!hitData.pinned && hitData.id > -1) {
        hitData.pinned = true;
      } else if (hitData.pinned && hitData.id == storedData.id) {
        hitData.pinned = false;
      }
      updateHitData(hitData);
    }

    triggerHitEvent('click', e.data);

  }, null, priority);

  // Hits are re-detected on 'hover' (if hit detection is active)
  mouse.on('hover', function(e) {
    if (storedData.pinned || !shapeTest || !active) return;
    if (!isOverMap(e)) {
      // mouse is off of map viewport -- clear any current hit
      updateHitData(null);
    } else if (e.hover) {
      // mouse is hovering directly over map area -- update hit detection
      updateHitData(hitTest(e));
    } else {
      // mouse is over map viewport but not directly over map (e.g. hovering
      // over popup) -- don't update hit detection
    }

  }, null, priority);

  function noHitData() {return {ids: [], id: -1, pinned: false};}

  function hitTest(e) {
    var p = ext.translatePixelCoords(e.x, e.y);
    var shapeHitIds = shapeTest(p[0], p[1]);
    var svgData = svgTest(e); // null or a data object
    var data = noHitData();
    if (svgData) { // mouse is over an SVG symbol
      utils.extend(data, svgData);
      if (shapeHitIds) {
        // if both SVG hit and shape hit, merge hit ids
        data.ids = utils.uniq(data.ids.concat(shapeHitIds));
      }
    } else if (shapeHitIds) {
      data.ids = shapeHitIds;
    }

    // update selected id
    if (data.id > -1) {
      // svg hit takes precedence over any prior hit
    } else if (storedData.id > -1 && data.ids.indexOf(storedData.id) > -1) {
      data.id = storedData.id;
    } else if (data.ids.length > 0) {
      data.id = data.ids[0];
    }

    // update pinned property
    if (storedData.pinned && data.id > -1) {
      data.pinned = true;
    }
    return data;
  }

  // If hit ids have changed, update stored hit ids and fire 'hover' event
  // evt: (optional) mouse event
  function updateHitData(newData) {
    if (!newData) {
      newData = noHitData();
    }
    if (!testHitChange(storedData, newData)) {
      return;
    }
    storedData = newData;
    gui.container.findChild('.map-layers').classed('symbol-hit', newData.ids.length > 0);
    if (active) {
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

  // d: event data (may be a pointer event object, an ordinary object or null)
  function triggerHitEvent(type, d) {
    // Merge stored hit data into the event data
    var eventData = utils.extend({}, d || {}, storedData);
    self.dispatchEvent(type, eventData);
  }

  // Test if two hit data objects are equivalent
  function testHitChange(a, b) {
    // check change in 'container', e.g. so moving from anchor hit to label hit
    //   is detected
    if (sameIds(a.ids, b.ids) && a.container == b.container && a.pinned == b.pinned && a.id == b.id) {
      return false;
    }
    return true;
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
