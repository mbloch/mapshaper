/* @requires
mapshaper-gui-lib
mapshaper-highlight-box
*/

function MapNav(ext, root) {
  var p = ext.position(),
      mouse = new MouseArea(p.element),
      wheel = new MouseWheel(mouse),
      zoomBox = new HighlightBox('body'),
      buttons = El('div').addClass('nav-buttons').appendTo(root),
      zoomTween = new Tween(Tween.sineInOut),
      shiftDrag = false,
      zoomScale = 2.5,
      dragStartEvt, _fx, _fy; // zoom foci, [0,1]

  navBtn("images/home.png").appendTo(buttons).on('click', function() {ext.reset();});
  navBtn("images/zoomin.png").appendTo(buttons).on('click', zoomIn);
  navBtn("images/zoomout.png").appendTo(buttons).on('click', zoomOut);

  zoomTween.on('change', function(e) {
    ext.rescale(e.value, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    zoomByPct(zoomScale, e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    shiftDrag = !!e.shiftKey;
    if (shiftDrag) {
      dragStartEvt = e;
    }
  });

  mouse.on('drag', function(e) {
    if (shiftDrag) {
      zoomBox.show(e.pageX, e.pageY, dragStartEvt.pageX, dragStartEvt.pageY);
    } else {
      ext.pan(e.dx, e.dy);
    }
  });

  mouse.on('dragend', function(e) {
    var bounds;
    if (shiftDrag) {
      shiftDrag = false;
      bounds = new Bounds(e.x, e.y, dragStartEvt.x, dragStartEvt.y);
      zoomBox.hide();
      if (bounds.width() > 5 && bounds.height() > 5) {
        zoomToBox(bounds);
      }
    }
  });

  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.x / ext.width(), e.y / ext.height());
  });

  function zoomIn() {
    zoomByPct(zoomScale, 0.5, 0.5);
  }

  function zoomOut() {
    zoomByPct(1/zoomScale, 0.5, 0.5);
  }

  // @box Bounds with pixels from t,l corner of map area.
  function zoomToBox(box) {
    var pct = Math.max(box.width() / ext.width(), box.height() / ext.height()),
        fx = box.centerX() / ext.width() * (1 + pct) - pct / 2,
        fy = box.centerY() / ext.height() * (1 + pct) - pct / 2;
    zoomByPct(1 / pct, fx, fy);
  }

  // @pct Change in scale (2 = 2x zoom)
  // @fx, @fy zoom focus, [0, 1]
  function zoomByPct(pct, fx, fy) {
    _fx = fx;
    _fy = fy;
    zoomTween.start(ext.scale(), ext.scale() * pct, 400);
  }

  function navBtn(url) {
    return El('div').addClass('nav-btn')
      .on('dblclick', function(e) {e.stopPropagation();}) // block dblclick zoom
      .newChild('img')
      .attr('src', url).parent();
  }
}
