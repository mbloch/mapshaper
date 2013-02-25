/* @requires core, styles, core.geo */

function log(msg) {
  var doc = app.activeDocument;
  var txt = doc.textFrames.add();
  // Set the contents and position of the text frame
  txt.position = [200,200];
  txt.contents = msg;
  return txt;
}


function getRGB(obj) {
  if (obj.typename != 'RGBColor') {
    warning("[getRGB()] Expected an RGBColor object; found:", obj);
    return 0;
  }
  var rgb = (Math.round(obj.red) << 16) + (Math.round(obj.green) << 8) + Math.round(obj.blue);
  return rgb;
}

function rgbToHex(rgb) {
  return '0x' + rgb.toString(16);
}

function rgbToCSS(rgb) {
  return getCSSColor(rgb);
}

function warning() {
  var msg = Utils.map(arguments, Utils.strval).join(' ');
  alert(msg);
}

function copyToClipboard(text) {
  var doc = app.activeDocument;
  doc.layers.add().textFrames.add().contents = text; 
  doc.layers[0].hasSelectedArtwork = true;
  app.copy();
  doc.layers[0].remove();
}

function getSelectedColors() {
  var cols = [];

  if (app.documents.length < 1) {
    warning("No documents are open.");
    return cols;
  }

  var doc = app.activeDocument;

  if (doc.documentColorSpace != DocumentColorSpace.RGB) {
    warning("Document must use RGB color space; using:", doc.documentColorSpace);
    return cols;
  }

  var items = doc.selection;
  var arr = [];
  var bb = new BoundingBox();

  Utils.forEach(items, function(item) {
    item.selected = false;
    if (item.typename == "PathItem") {
      var bounds = item.geometricBounds;
      var l = bounds[0];
      var t = bounds[1];
      var r = bounds[2];
      var b = bounds[3];
      bb.mergePoint(l, t);
      bb.mergePoint(r, b);
     // var sortKey = y - x * 0.02;
      var rgb = getRGB(item.fillColor);
      var obj = {
        rgb:rgb,
        //sortKey:sortKey
        top: t,
        left: l
      };
      arr.push(obj);
      //warning(item.geometricBounds, item.position);
    }
  });

  if (arr.length < 1) {
    warning("No path objects are selected.");
    return arr;
  }

  var selWidth = bb.width();
  var fudgeFactor = 20 / selWidth;
  Utils.forEach(arr, function(item) { item.sortKey = item.top - item.left * fudgeFactor });

  Utils.sortOn(arr, 'sortKey', false);
  cols = Utils.map(arr, function(obj) { return obj.rgb });
  return cols;
}