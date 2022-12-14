import { getPointerHitTest } from './gui-hit-test';
import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';
import { internal } from './gui-core';

export function InteractiveSelection(gui, ext, mouse) {
  var self = new EventDispatcher();
  var storedData = noHitData(); // may include additional data from SVG symbol hit (e.g. hit node)
  var selectionIds = [];
  var transientIds = []; // e.g. hit ids while dragging a box
  var active = false;
  var interactionMode;
  var targetLayer;
  var hitTest;
  // event priority is higher than navigation, so stopping propagation disables
  // pan navigation
  var priority = 2;

  // init keyboard controls for pinned features
  gui.keyboard.on('keydown', function(evt) {
    var e = evt.originalEvent;

    if (gui.interaction.getMode() == 'off' || !targetLayer) return;

    // esc key clears selection (unless in an editing mode -- esc key also exits current mode)
    if (e.keyCode == 27 && !gui.getMode()) {
      self.clearSelection();
      return;
    }

    // ignore keypress if no feature is selected or user is editing text
    if (pinnedId() == -1 || GUI.textIsSelected()) return;

    if (e.keyCode == 37 || e.keyCode == 39) {
      // L/R arrow keys
      // advance pinned feature
      advanceSelectedFeature(e.keyCode == 37 ? -1 : 1);
      e.stopPropagation();

    } else if (e.keyCode == 8) {
      // DELETE key
      // delete pinned feature
      // to help protect against inadvertent deletion, don't delete
      // when console is open or a popup menu is open
      if (!gui.getMode() && !gui.consoleIsOpen()) {
        internal.deleteFeatureById(targetLayer.layer, pinnedId());
        self.clearSelection();
        gui.model.updated({flags: 'filter'}); // signal map to update
      }
    }
  }, !!'capture'); // preempt the layer control's arrow key handler

  self.setLayer = function(mapLayer) {
    targetLayer = mapLayer;
    updateHitTest();
  };

  function updateHitTest() {
    hitTest = getPointerHitTest(targetLayer, ext, interactionMode);
  }

  function turnOn(mode) {
    interactionMode = mode;
    active = true;
    updateHitTest();
  }

  function turnOff() {
    if (active) {
      updateSelectionState(null); // no hit data, no event
      active = false;
      hitTest = null;
    }
  }

  function selectable() {
    return interactionMode == 'selection';
  }

  function pinnable() {
    return clickable() && interactionMode != 'selection';
  }

  function draggable() {
    return interactionMode == 'vertices' || interactionMode == 'location' || interactionMode == 'labels';
  }

  function clickable() {
    // click used to pin popup and select features
    return interactionMode == 'data' || interactionMode == 'info' || interactionMode == 'selection';
  }

  self.getHitId = function() {return storedData.id;};

  // Get a reference to the active layer, so listeners to hit events can interact
  // with data and shapes
  self.getHitTarget = function() {
    return targetLayer;
  };

  self.addSelectionIds = function(ids) {
    turnOn('selection');
    selectionIds = utils.uniq(selectionIds.concat(ids));
    ids = utils.uniq(storedData.ids.concat(ids));
    updateSelectionState({ids: ids});
  };

  self.setTransientIds = function(ids) {
    // turnOn('selection');
    transientIds = ids || [];
    if (active) {
      triggerHitEvent('change');
    }
  };

  self.setHoverVertex = function(p, type) {
    var p2 = storedData.hit_coordinates;
    if (!active || !p) return;
    if (p2 && p2[0] == p[0] && p2[1] == p[1]) return;
    storedData.hit_coordinates = p;
    triggerHitEvent('change');
  };

  self.clearVertexOverlay = function() {
    if (!storedData.hit_coordinates) return;
    delete storedData.hit_coordinates;
    triggerHitEvent('change');
  };

  self.clearSelection = function() {
    updateSelectionState(null);
  };

  self.clearHover = function() {
    updateSelectionState(mergeHoverData({ids: []}));
  };

  self.getSelectionIds = function() {
    return selectionIds.concat();
  };

  self.getTargetDataTable = function() {
    var targ = self.getHitTarget();
    return targ && targ.layer.data || null;
  };

  // get function for selecting next or prev feature within the current set of
  // selected features
  self.getSwitchTrigger = function(diff) {
    return function() {
      switchWithinSelection(diff);
    };
  };

  // diff: 1 or -1
  function advanceSelectedFeature(diff) {
    var n = internal.getFeatureCount(targetLayer.layer);
    if (n < 2 || pinnedId() == -1) return;
    storedData.id = (pinnedId() + n + diff) % n;
    storedData.ids = [storedData.id];
    triggerHitEvent('change');
  }

  // diff: 1 or -1
  function switchWithinSelection(diff) {
    var id = pinnedId();
    var i = storedData.ids.indexOf(id);
    var n = storedData.ids.length;
    if (i < 0 || n < 2) return;
    storedData.id = storedData.ids[(i + diff + n) % n];
    triggerHitEvent('change');
  }

  // make sure popup is unpinned and turned off when switching editing modes
  // (some modes do not support pinning)
  gui.on('interaction_mode_change', function(e) {
    updateSelectionState(null);
    // if (e.mode == 'off' || e.mode == 'box') {
    if (gui.interaction.modeUsesSelection(e.mode)) {
      turnOn(e.mode);
    } else {
      turnOff();
    }
  });

  gui.on('box_drag_start', function() {
    self.clearHover();
  });

  mouse.on('dblclick', handlePointerEvent, null, priority);
  mouse.on('dragstart', handlePointerEvent, null, priority);
  mouse.on('drag', handlePointerEvent, null, priority);
  mouse.on('dragend', handlePointerEvent, null, priority);

  mouse.on('click', function(e) {
    if (!hitTest || !active) return;
    e.stopPropagation();

    // TODO: move pinning to inspection control?
    if (clickable()) {
      updateSelectionState(mergeClickData(hitTest(e)));
    }
    triggerHitEvent('click', e.data);
  }, null, priority);

  // Hits are re-detected on 'hover' (if hit detection is active)
  mouse.on('hover', function(e) {
    handlePointerEvent(e);
    if (storedData.pinned || !hitTest || !active) return;
    if (e.hover && isOverMap(e)) {
      // mouse is hovering directly over map area -- update hit detection
      updateSelectionState(mergeHoverData(hitTest(e)));
    } else if (targetIsRollover(e.originalEvent.target)) {
      // don't update hit detection if mouse is over the rollover (to prevent
      // on-off flickering)
    } else {
      updateSelectionState(mergeHoverData({ids:[]}));
    }
  }, null, priority);

  function targetIsRollover(target) {
    while (target.parentNode && target != target.parentNode) {
      if (target.className && String(target.className).indexOf('rollover') > -1) {
        return true;
      }
      target = target.parentNode;
    }
    return false;
  }

  function noHitData() {return {ids: [], id: -1, pinned: false};}

  function mergeClickData(hitData) {
    // mergeCurrentState(hitData);
    // TOGGLE pinned state under some conditions
    var id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
    hitData.id = id;
    if (pinnable()) {
      if (!storedData.pinned && id > -1) {
        hitData.pinned = true; // add pin
      } else if (storedData.pinned && storedData.id == id) {
        delete hitData.pinned; // remove pin
        // hitData.id = -1; // keep highlighting (pointer is still hovering)
      } else if (storedData.pinned && id > -1) {
        hitData.pinned = true; // stay pinned, switch id
      }
    }
    if (selectable()) {
      if (id > -1) {
        selectionIds = toggleId(id, selectionIds);
      }
      hitData.ids = selectionIds;
    }
    return hitData;
  }

  function mergeHoverData(hitData) {
    if (storedData.pinned) {
      hitData.id = storedData.id;
      hitData.pinned = true;
    } else {
      hitData.id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
    }
    if (selectable()) {
      hitData.ids = selectionIds;
      // kludge to inhibit hover effect while dragging a box
      if (gui.keydown) hitData.id = -1;
    }
    return hitData;
  }

  function pinnedId() {
    return storedData.pinned ? storedData.id : -1;
  }

  function toggleId(id, ids) {
    if (ids.indexOf(id) > -1) {
      return utils.difference(ids, [id]);
    }
    return [id].concat(ids);
  }

  // If hit ids have changed, update stored hit ids and fire 'hover' event
  // evt: (optional) mouse event
  function updateSelectionState(newData) {
    var nonEmpty = newData && (newData.ids.length || newData.id > -1);
    transientIds = [];
    if (!newData) {
      newData = noHitData();
      selectionIds = [];
    }

    if (!testHitChange(storedData, newData)) {
      return;
    }

    storedData = newData;
    gui.container.findChild('.map-layers').classed('symbol-hit', nonEmpty);
    if (active) {
      triggerHitEvent('change');
    }
  }

  // check if an event is used in the current interaction mode
  function eventIsEnabled(type) {
    if (type == 'click' && !clickable()) {
      return false;
    }
    if ((type == 'drag' || type == 'dragstart' || type == 'dragend') && !draggable()) {
      return false;
    }
    return true;
  }

  function isOverMap(e) {
    return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
  }

  function handlePointerEvent(e) {
    if (!hitTest || !active) return;
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
    var eventData = utils.extend({mode: interactionMode}, d || {}, storedData);
    if (transientIds.length) {
      eventData.ids = utils.uniq(transientIds.concat(eventData.ids || []));
    }
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
