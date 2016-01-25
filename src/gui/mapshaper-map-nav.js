/* @requires
mapshaper-gui-lib
mapshaper-highlight-box
*/

gui.addSidebarButton = function(iconId) {
  var btn = El('div').addClass('nav-btn')
    .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
  btn.appendChild(iconId);
  btn.appendTo('#nav-buttons');
  return btn;
};

function MapNav(root, ext, mouse) {
  var wheel = new MouseWheel(mouse),
      zoomBox = new HighlightBox('body'),
      buttons = El('div').id('nav-buttons').appendTo(root),
      zoomTween = new Tween(Tween.sineInOut),
      shiftDrag = false,
      zoomScale = 2.5,
      zoomTimeout = 250,
      zooming, dragStartEvt, _fx, _fy; // zoom foci, [0,1]

  gui.addSidebarButton("#home-icon").on('click', function() {ext.reset();});
  gui.addSidebarButton("#zoom-in-icon").on('click', zoomIn);
  gui.addSidebarButton("#zoom-out-icon").on('click', zoomOut);

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
    autoSimplify(true);
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
    autoSimplify(false);
  });

  wheel.on('mousewheel', function(e) {
    var maxDelta = 350,
        wheelDelta = e.wheelDelta,
        scale = ext.scale(),
        direction = wheelDelta > 0 ? 1 : -1,
        k = Math.min(maxDelta, Math.abs(wheelDelta)) * direction;

    if (!zooming) {
      zooming = true;
      autoSimplify(zooming);
    }

    clearTimeout(zooming);

    zooming = setTimeout(function() {
      zooming = false;
      autoSimplify(zooming);
    }, zoomTimeout);

    ext.rescale(Math.pow(2, k * 0.001) * scale, e.x / ext.width(), e.y / ext.height());
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

  function autoSimplify(operation) {
    gui.simplify.dispatchEvent('operation', { operation: operation, scale: ext.scale() });
  }
}
