/** @requires mapshaper-common */

function MshpMouse(ext) {
  var p = ext.position(),
      mouse = new MouseArea(p.element),
      shiftDrag = false,
      dragStartEvt,
      boxEl = El('div').addClass('g-zoom-box').appendTo('body'),
      boxStroke = parseInt(boxEl.computedStyle()['border-width'], 10),
      _fx, _fy; // zoom foci, [0,1]

  boxEl.hide();
  var zoomTween = new NumberTween(function(scale, done) {
    ext.rescale(scale, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    zoomByPct(3, e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    shiftDrag = !!e.shiftKey;
    if (shiftDrag) {
      dragStartEvt = e;
    }
  });

  mouse.on('drag', function(e) {
    if (shiftDrag) {
      showBox(new Bounds(e.pageX, e.pageY, dragStartEvt.pageX, dragStartEvt.pageY));
    } else {
      ext.pan(e.dx, e.dy);
    }
  });

  mouse.on('dragend', function(e) {
    if (shiftDrag) {
      shiftDrag = false;
      boxEl.hide();
      zoomToBox(new Bounds(e.x, e.y, dragStartEvt.x, dragStartEvt.y));
    }
  });

  var wheel = new MouseWheel(mouse);
  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.x / ext.width(), e.y / ext.height());
  });

  // Display zoom box
  // @box Bounds object with coords in pixels from t,l corner of document
  //
  function showBox(box) {
    var minSize = boxStroke * 2 + 1;
    if (box.width() < minSize || box.width() < minSize) {
      boxEl.css("visibility: hidden;");
    } else {
      boxEl.show();
      boxEl.css({
        visibility: 'visible',
        top: box.ymin,
        left: box.xmin,
        width: box.width() - boxStroke * 2,
        height: box.height() - boxStroke * 2
      });
    }
  }

  // @box Bounds with pixels from t,l corner of map area.
  //
  function zoomToBox(box) {
    var minSide = 5,
        w = box.width() - 2 * boxStroke,
        h = box.height() - 2 * boxStroke,
        pct = Math.max(w / ext.width(), h / ext.height());
    if (w < minSide || h < minSide) return;
    var fx = box.centerX() / ext.width() * (1 + pct) - pct / 2,
        fy = box.centerY() / ext.height() * (1 + pct) - pct / 2;
    zoomByPct(1 / pct, fx, fy);
  }

  // @pct Change in scale (2 = 2x zoom)
  // @fx, @fy zoom focus, [0, 1]
  //
  function zoomByPct(pct, fx, fy) {
    _fx = fx;
    _fy = fy;
    zoomTween.start(ext.scale(), ext.scale() * pct);
  }
}
