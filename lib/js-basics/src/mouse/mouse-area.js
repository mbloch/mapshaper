/* @requires browser, element-position, events */

function MouseArea(element) {
  var pos = new ElementPosition(element),
      _areaPos = pos.position(),
      _self = this,
      _dragging = false,
      _isOver = false,
      _isDown = false,
      _moveData,
      _downData;

  pos.on('change', function() {_areaPos = pos.position()});

  if (!Browser.touchEnabled) {
    Browser.on(document, 'mousemove', onMouseMove);
    Browser.on(document, 'mousedown', onMouseDown);
    Browser.on(document, 'mouseup', onMouseUp);
    Browser.on(element, 'mouseover', onAreaOver);
    Browser.on(element, 'mouseout', onAreaOut);
    Browser.on(element, 'mousedown', onAreaDown);
    Browser.on(element, 'dblclick', onAreaDblClick);
  }

  function onAreaDown(e) {
    e.preventDefault(); // prevent text selection cursor on drag
  }

  function onAreaOver(e) {
    _isOver = true;
    _self.dispatchEvent('enter');
  }

  function onAreaOut(e) {
    _isOver = false;
    _self.dispatchEvent('leave');
  }

  function onMouseUp(e) {
    _isDown = false;
    if (_dragging) {
      _dragging = false;
      _self.dispatchEvent('dragend');
    }

    if (_downData) {
      var obj = procMouseEvent(e),
          elapsed = obj.time - _downData.time,
          dx = obj.pageX - _downData.pageX,
          dy = obj.pageY - _downData.pageY;
      if (elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
        _self.dispatchEvent('click', obj);
      }
    }
  }

  function onMouseDown(e) {
    _isDown = true;
    _downData = _moveData
  }

  function onMouseMove(e) {
    _moveData = procMouseEvent(e, _moveData);

    if (!_dragging && _isDown && _downData.hover) {
      _dragging = true;
      _self.dispatchEvent('dragstart');
    }

    if (_dragging) {
      var obj = {
        dragX: _moveData.pageX - _downData.pageX,
        dragY: _moveData.pageY - _downData.pageY
      };
      _self.dispatchEvent('drag', Utils.extend(obj, _moveData));
    }
  }

  function onAreaDblClick(e) {
    if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
  }

  function procMouseEvent(e, prev) {
    var pageX = e.pageX,
        pageY = e.pageY;

    return {
      time: +new Date,
      pageX: pageX,
      pageY: pageY,
      hover: _isOver,
      x: pageX - _areaPos.pageX,
      y: pageY - _areaPos.pageY,
      dx: prev ? pageX - prev.pageX : 0,
      dy: prev ? pageY - prev.pageY : 0
    };
  }

  this.isOver = function() {
    return _isOver;
  }

  this.isDown = function() {
    return _isDown;
  }

  this.mouseData = function() {
    return Utils.extend({}, _moveData);
  }
}

Opts.inherit(MouseArea, EventDispatcher);
