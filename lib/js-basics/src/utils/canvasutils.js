/* @requires core, browser, colorutils */

var Canvas = {};

Canvas.clear = function(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  
};

Canvas.clone = function(src) {
  var dest = document.createElement('canvas');
  dest.width = src.width;
  dest.height = src.height;
  dest.getContext('2d').drawImage(src, 0, 0);
  return dest;
}


Canvas.drawDot = function(ctx, size, xy, col) {
  Canvas.circlePath(ctx, size, xy);
  ctx.fillStyle = col;
  ctx.fill();
};

Canvas.circlePath = function(ctx, size, xy) {
  ctx.beginPath();
  ctx.arc(xy[0], xy[1], size/2, 2 * Math.PI, false);

};

Canvas.trace = function(canv) {
  var rgbs = [];
  Canvas.forEachPixel(canv, function(data, i) {
    var rgb = Color.getRGB(data[i++], data[i++], data[i++]);
    rgbs.push(rgb.toString(16));
  });
  trace("[" + rgbs.join(', ') + "]");
}

Canvas.imageToCanvas = function(img) {
  var w = img.width,
      h = img.height;
  if (!w || !h) error("[imageToCanvas()] Invalid image size");

  var canv = document.createElement('canvas');; // Browser.createElement('canvas');
  canv.width = w;
  canv.height = h;
  var ctx = canv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canv;
}

Canvas.recolor = function(canv, col) {
  var rgb = Color.parseHex(col),
      targR = Color.getR(rgb),
      targG = Color.getG(rgb),
      targB = Color.getB(rgb);

  Canvas.forEachPixel(canv, function(data, i) {
    data[i] = targR;
    data[i+1] = targG;
    data[i+2] = targB;
  });
};

Canvas.setAlpha = function(canv, alpha) {
  var channel = Utils.clamp(Math.round(alpha * 255), 0, 255);
  Canvas.forEachPixel(canv, function(data, i) {
    data[i+3] = channel;
  });
};

Canvas.forEachPixel = function(canv, callback) {
  var w = canv.width,
      h = canv.height,
      ctx = canv.getContext('2d'),
      imageData = ctx.getImageData(0, 0, w, h),
      data = imageData.data;

  // trace(">> forEachPixel(); w, h:", w, h);

  for (var y=0; y < h; y++) {
    for (var x=0; x < w; x++) {
      var i = (y * w + x) * 4;
      callback(data, i);
    }
  }
  ctx.putImageData(imageData, 0, 0);
};


Canvas.findColor = function(canvas, col) {
  var w = canvas.width,
      h = canvas.height,
      ctx = canvas.getContext('2d');

  var xmin = w-1,
      xmax = 0,
      ymin = h-1,
      ymax = 0;

  var rgb = Utils.isNumber(rgb) ? rgb : Color.parseHex(col),
      targR = Color.getR(rgb),
      targG = Color.getG(rgb),
      targB = Color.getB(rgb);

  var count = 0;
  var destImg = ctx.createImageData(w, h);
  var destData = destImg.data;

  var data = ctx.getImageData(0, 0, w, h).data;
  for (var y=0; y < h; y++) {
    for (var x=0; x < w; x++) {
      var i = (y * w + x) * 4;
      
      var r = data[i],
          g = data[i+1],
          b = data[i+2],
          a = data[i+3];

      if (r === targR && g === targG && b === targB) {
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;

        destData[i] = r;
        destData[i+1] = g;
        destData[i+2] = b;
        destData[i+3] = a;
        count++;
      }
    }
  }

  if (xmin <= xmax) {
    var img = document.createElement('canvas');
    img.width = xmax - xmin;
    img.height = ymax - ymin;
    img.getContext('2d').putImageData(destImg, -xmin, -ymin);
  }

  return {count:count, bbox: [xmin, ymin, xmax, ymax], image:img, rgb:rgb, r:targR, g:targG, b:targB};
}