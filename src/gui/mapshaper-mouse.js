/** @requires browser, events, tweening, mouse-area, mouse-wheel */

function MshpMouse(ext) {
  var p = ext.position(),
      mouse = new MouseArea(p.element),
      _fx, _fy; // zoom foci, [0,1]

  var zoomTween = new NumberTween(function(scale, done) {
    ext.rescale(scale, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    var from = ext.scale(),
        to = from * 3;
    _fx = e.x / ext.width();
    _fy = e.y / ext.height();
    zoomTween.start(from, to);
  });

  mouse.on('drag', function(e) {
    ext.pan(e.dx, e.dy);
  });

  var wheel = new MouseWheel(mouse);
  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.x / ext.width(), e.y / ext.height());
  });
}
