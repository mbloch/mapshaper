import { EventDispatcher } from './gui-events';
import { Timer, Tween } from './gui-tween';
import { utils } from './gui-core';
import { ElementPosition } from './gui-element-position';

function MouseWheelDirection() {
  var prevTime = 0;
  var getAvgDir;

  // returns 1, -1 or 0 to indicate direction of scroll
  // use avg of three values, as a buffer against single anomalous values
  return function(e, now) {
    var delta = e.wheelDelta || -e.detail || 0;
    var dir = delta > 0 && 1 || delta < 0 && -1 || 0;
    var avg;
    if (!getAvgDir || now - prevTime > 300) {
      getAvgDir =  LimitedAverage(3); // reset if wheel has paused
    }
    prevTime = now;
    avg = getAvgDir(dir) || dir; // handle average == 0
    return avg > 0 && 1 || avg < 0 && -1 || 0;
  };
}

function LimitedAverage(maxSize) {
  var arr = [];
  return function(val) {
    var sum = 0,
        i = -1;
    arr.push(val);
    if (arr.length > maxSize) arr.shift();
    while (++i < arr.length) {
      sum += arr[i];
    }
    return sum / arr.length;
  };
}

// @mouse: MouseArea object
export function MouseWheel(mouse) {
  var self = this,
      active = false,
      timer = new Timer().addEventListener('tick', onTick),
      sustainInterval = 150,
      fadeDelay = 70,
      eventTime = 0,
      getAverageRate = LimitedAverage(10),
      getWheelDirection = MouseWheelDirection(),
      wheelDirection;

  if (window.onmousewheel !== undefined) { // ie, webkit
    window.addEventListener('mousewheel', handleWheel, {passive: false});
  } else { // firefox
    window.addEventListener('DOMMouseScroll', handleWheel);
  }

  function updateSustainInterval(eventRate) {
    var fadeInterval = 80;
    fadeDelay = eventRate + 50; // adding a little extra time helps keep trackpad scrolling smooth in Firefox
    sustainInterval = fadeDelay + fadeInterval;
  }

  function handleWheel(evt) {
    var now = +new Date();
    wheelDirection = getWheelDirection(evt, now);
    if (evt.ctrlKey) {
      // Prevent pinch-zoom in Chrome (doesn't work in Safari, though)
      evt.preventDefault();
      evt.stopImmediatePropagation();
    }
    if (!mouse.isOver()) return;
    if (wheelDirection === 0) {
      // first event may not have a direction, e.g. if 'smooth scrolling' is on
      return;
    }
    evt.preventDefault();
    if (!active) {
      active = true;
      self.dispatchEvent('mousewheelstart');
    } else {
      updateSustainInterval(getAverageRate(now - eventTime));
    }
    eventTime = now;
    timer.start(sustainInterval);
  }

  function onTick(evt) {
    var tickInterval = evt.time - eventTime,
        multiplier = evt.tickTime / 25,
        fadeFactor = 0,
        obj;
    if (tickInterval > fadeDelay) {
      fadeFactor = Math.min(1, (tickInterval - fadeDelay) / (sustainInterval - fadeDelay));
    }
    if (evt.done) {
      active = false;
    } else {
      if (fadeFactor > 0) {
        // Decelerate towards the end of the sustain interval (for smoother zooming)
        multiplier *= Tween.quadraticOut(1 - fadeFactor);
      }
      obj = utils.extend({direction: wheelDirection, multiplier: multiplier}, mouse.mouseData());
      self.dispatchEvent('mousewheel', obj);
    }
  }
}

utils.inherit(MouseWheel, EventDispatcher);


export function MouseArea(element, pos) {
  var _pos = pos || new ElementPosition(element),
      _areaPos = _pos.position(),
      _self = this,
      _dragging = false,
      _isOver = false,
      _disabled = false,
      _prevEvt,
      _downEvt;

  _pos.on('change', function() {_areaPos = _pos.position();});
  // TODO: think about touch events
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  element.addEventListener('mouseover', onAreaEnter);
  element.addEventListener('mousemove', onAreaEnter);
  element.addEventListener('mouseout', onAreaOut);
  element.addEventListener('mousedown', onAreaDown);
  element.addEventListener('dblclick', onAreaDblClick);

  this.enable = function() {
    if (!_disabled) return;
    _disabled = false;
    element.style.pointerEvents = 'auto';
  };

  this.stopDragging = function() {
    if (_downEvt) {
      if (_dragging) stopDragging(_downEvt);
      _downEvt = null;
    }
  };

  this.disable = function() {
    if (_disabled) return;
    _disabled = true;
    if (_isOver) onAreaOut();
    this.stopDragging();
    element.style.pointerEvents = 'none';
  };

  this.isOver = function() {
    return _isOver;
  };

  this.isDown = function() {
    return !!_downEvt;
  };

  this.mouseData = function() {
    return utils.extend({}, _prevEvt);
  };

  function onAreaDown(e) {
    e.preventDefault(); // prevent text selection cursor on drag
  }

  function onAreaEnter() {
    if (!_isOver) {
      _isOver = true;
      _self.dispatchEvent('enter');
    }
  }

  function onAreaOut() {
    _isOver = false;
    _self.dispatchEvent('leave');
  }

  function onMouseUp(e) {
    var evt = procMouseEvent(e),
        elapsed, dx, dy;
    if (_dragging) {
      stopDragging(evt);
    }
    if (_downEvt) {
      elapsed = evt.time - _downEvt.time;
      dx = evt.pageX - _downEvt.pageX;
      dy = evt.pageY - _downEvt.pageY;
      if (_isOver && elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
        _self.dispatchEvent('click', evt);
      }
      _downEvt = null;
    }
  }

  function stopDragging(evt) {
    _dragging = false;
    _self.dispatchEvent('dragend', evt);
  }

  function onMouseDown(e) {
   if (e.button != 2 && e.which != 3) { // ignore right-click
      _downEvt = procMouseEvent(e);
    }
  }

  function onMouseMove(e) {
    var evt = procMouseEvent(e);
    if (!_dragging && _downEvt && _downEvt.hover) {
      _dragging = true;
      _self.dispatchEvent('dragstart', evt);
    }
    if (evt.dx === 0 && evt.dy === 0) return; // seen in Chrome
    if (_dragging) {
      var obj = {
        dragX: evt.pageX - _downEvt.pageX,
        dragY: evt.pageY - _downEvt.pageY
      };
      _self.dispatchEvent('drag', utils.extend(obj, evt));
    } else {
      _self.dispatchEvent('hover', evt);
    }
  }

  function onAreaDblClick(e) {
    if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
  }

  function procMouseEvent(e) {
    var pageX = e.pageX,
        pageY = e.pageY,
        prev = _prevEvt;
    _prevEvt = {
      originalEvent: e,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      time: +new Date(),
      pageX: pageX,
      pageY: pageY,
      hover: _isOver,
      x: pageX - _areaPos.pageX,
      y: pageY - _areaPos.pageY,
      dx: prev ? pageX - prev.pageX : 0,
      dy: prev ? pageY - prev.pageY : 0
    };
    return _prevEvt;
  }
}

utils.inherit(MouseArea, EventDispatcher);

