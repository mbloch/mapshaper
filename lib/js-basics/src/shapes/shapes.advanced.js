/* @requires arrayutils, events, shapes, browser */


var types = {
  POLYGONS:"polygons",
  POLYLINES:"polylines",
  POINTS:"points",
  OUTERLINES:"outerlines",
  INNERLINES:"innerlines",
  TOPOLOGY:"topology",
  OUTLINE:"outline"
};
Opts.copyNewParams(C, types);

/**
 * A polyline class that supports multiple levels of detail.
 * Implements the VertexSet interface (see shapes.js).
 *
 * @constructor
 * @param {MshpScale} scale MshpScale instance for access to current level of detail.
 */
function MshpVertexSet(scale, xx, yy, zz, reversed) {
  this._scale = scale;
  this._idx = 0;
  var args = arguments.length;

  if (args < 2) {
    xx = [];
    yy = [];
    zz = [];
  }
  else if (reversed === true) {
    xx = xx.concat().reverse();
    yy = yy.concat().reverse();
    zz = zz.concat().reverse();
  }

  this.xx = xx;
  this.yy = yy;
  this.zz = zz;
  this._size = xx.length;
};

MshpVertexSet.prototype = new BoundingBox();

MshpVertexSet.prototype.extend = function extend(xx, yy, zz, reversed) {
  if (!xx || xx.length < 2) {
    return;
  }
  var len = this._size;
  //this._parts += 1;
  var _xx = this.xx;
  var _yy = this.yy;
  var _zz = this.zz;

  if (reversed) {
    xx = xx.concat().reverse();
    yy = yy.concat().reverse();
    zz = zz.concat().reverse();

    /*
    // reverse is slow...
    http://jsperf.com/js-array-reverse-vs-while-loop/3
    */
  }

  // ??? Is this the fastest way to extend?
  // alternative: xx = xx.concat(xx_); first part can use assignment
  if (len > 0) {
    _xx.pop();
    _yy.pop();
    _zz.push(99);
  }

  _xx.push.apply(_xx, xx);
  _yy.push.apply(_yy, yy);
  _zz.push.apply(_zz, zz);

  this._size = _xx.length;
};

MshpVertexSet.prototype.calcBounds = VertexSet.prototype.calcBounds; 


/**
 * Use canvas drawing api to draw polyline at the appropriate level of detail.
 *
 * @param context Canvas 2D context.
 * @param {TileExtent} Object with params for translating projected coords into canvas pixel coords.
 */
MshpVertexSet.prototype.draw = function draw(context, ext) {
  var mx = ext.mx,
    my = ext.my,
    bx = ext.bx,
    by = ext.by,
    xx = this.xx,
    yy = this.yy,
    zz = this.zz,
    level = this._scale.level,
    lastIdx = this._size - 1;

  if (lastIdx < 1) {
    return;
  }
  
  var x = xx[0] * mx + bx;
  var y = yy[0] * my + by;
  context.moveTo(x, y);

  for (var i=1; i<=lastIdx; i++) {
    var z = zz[i-1];
    if (z >= level || i == lastIdx) {
      x = xx[i] * mx + bx;
      y = yy[i] * my + by;
      context.lineTo(x, y);
    }
  }
};



/**
 * Iterator test; also advances cursor or resets if at end.
 * @return {boolean} True or false.
 */
MshpVertexSet.prototype.hasNext = function hasNext(rev) {
  var idx = this._idx;
  var lastIdx = this._size - 1;
  if (idx >= this._size) {
    this._idx = 0;
    return false;
  }

  var level = this._scale.level;

  // thresh 0 : yes
  // thresh > 0 || thresh < level : no
  // thresh >= level : yes
  //
  // i.e. 1 -> high detail; 5 -> low detail

  var i = idx, inc = 1;
  if (rev) {
    i = lastIdx - idx;
    inc = -1;
  }

  if (level > 0 && idx > 0) {

    var zz = this.zz;
    while (idx < lastIdx) {
      var thresh = zz[i-1];  // ?? copy zz to local?
      if (thresh >= level) {
        break;
      }
      i += inc;
      idx ++;
    }
  }

  this.nextX = this.xx[i];
  this.nextY = this.yy[i];

  this._idx = idx + 1;
  return true;
};




/**
 * Returns number of vertices in the collection.
 * @return {number} Length of VertexSet.
 */
MshpVertexSet.prototype.size = function() {
  return this._size;
};



/**
 * Calculates appropriate level of simplification for a collection of mshp shapes based on current map scale.
 *
 * @param {int} numLevels Number of simplified levels available; 0 == only base level.
 * @param {int} interval Pixel-size threshold of a simplification level s[n] is equal to s[n-1]/interval.
 * @param {number} levelOneThreshold Pixel size at which the first simplification level is applied.
 * @param {number} scaleAdjustment Factor for adjusting effective scale of layer content
 *   ... has the effect of adjusting scale at which polylines switch getween simplification levels.
 *   ... 1 = no change; <1 = simplify sooner.
 */
function MshpScale(numLevels, interval, levelOneThreshold, scaleAdjustment) {
  var haveLevels = numLevels > 0 && interval > 1 && levelOneThreshold > 0;
  this.level = 0; // Current simplification level; Frequently accessed, so using parameter for speed.

  /**
   * Update the current simplification level based on the scaled pixel width of the layer symbols
   * (called on layer refresh)
   */
  this.updateContentWidth = function(wPix) {
    if (haveLevels === false) {
      return;
    }
    var effectiveWidth = wPix *= scaleAdjustment;
    var maxCode = numLevels;

    // Calculate appropriate level of simplification.
    var levelCode = 0;
    var levelThreshold = levelOneThreshold;
    while (effectiveWidth < levelThreshold && levelCode < maxCode) {
      levelCode++;
      levelThreshold /= interval;
    }

    this.level = levelCode;
  }
}


function AdvancedParser(data) {

  this.data = data;
  var meta = data.header;
  var simplifiedLevels = meta.simplified_levels;
  var levelStepFactor = 2;
  if (simplifiedLevels > 0 && meta.level_resolution > 1) {
    levelStepFactor = Math.pow(2, 1 / meta.level_resolution);
  }
  // Adjust scale thresholds on lower-power devices to display simpler lines for faster rendering.
  // TODO: Handle other handheld devices.
  var scaleAdjustment = Browser.iPhone || Browser.iPad ? 0.4 : 0.7;
  var levelOneThreshold = 1 << meta.level_one_precision;
  var vectorScale = this._vectorScale = new MshpScale(simplifiedLevels, levelStepFactor, levelOneThreshold, scaleAdjustment); 


  var bounds = this._bounds = new BoundingBox();
  var b = this.data.bounds;
  bounds.setBounds(b.left, b.top, b.right, b.bottom);

  this.extractMultiShapes = function(name) {
    var rawShapes = data[name];
    assert(!!rawShapes, "Missing shape type:", name);
    var shapes = Utils.map(rawShapes, extractShape);
    return shapes;
  };

  this.hasType = function(type) {
    return type in data;
  }


  function extractShape(rawParts, shpId) {
    var shp, part, xx, yy, zz, x = 0, y = 0,
      useDeltas = !!data.header.deltas;
      Utils.getKeys(data.header);
    for (var i=0, len=rawParts.length; i<len; i++) {
      part = rawParts[i];
      xx = part[0];
      yy = part[1];
      zz = part[2];

      if (useDeltas) {
        for (var j=1, x=xx[0], y=yy[0], jlen=xx.length; j<jlen; j++) {
          x += xx[j];
          y += yy[j];
          xx[j] = x;
          yy[j] = y;
        }
      }

      var vec = new MshpVertexSet(vectorScale, xx, yy, zz);
      vec.calcBounds();
      if (i == 0) {
        shp = new ShapeVector(shpId, vec);
      }
      else {
        shp.addPartData(vec);
      }
    }
    return shp;
  };

/*
    var vec = new MshpVertexSet(scaleObj, xx[arcId], yy[arcId], zz[arcId]);
    vec.calcBounds();
    var shp = new ShapeVector(shapeCount, vec);

*/

  this.extractSimpleShapes = function(name) {
    var rawShapes = data[name];
    assert(!!rawShapes, "Missing shape type:", name);
    var shapes = Utils.map(rawShapes, function(shp, i) {
      return extractShape([shp], i)
    });
    return shapes;
  };


  this.startWaiting(); // already READY
}

Opts.inherit(AdvancedParser, Waiter);


AdvancedParser.prototype.extractProjectedShapes = function(type) {
  //trace("***[MshpParser.extractProjectedShapes()] type:", type);
  var shapes;
  if (type == C.POLYGONS) {
    shapes = this.extractMultiShapes(type);
  }
  else if (type == C.POLYLINES) {
    shapes = this.extractSimpleShapes(type);
  }
  else if (type == C.INNERLINES) {
    shapes = this.extractSimpleShapes(type);
  }
  else if (type == C.OUTERLINES) {
    shapes = this.extractSimpleShapes(type);
  }
  else  {
    error("Unsupported shape type:", type);
  }

  var data = {
    bounds: this._bounds.cloneBounds(),
    polygons: type == C.POLYGONS || type == C.TOPOLOGY || type == C.OUTLINE, 
    shapes: shapes,
    vectorScaler: this._vectorScale
  };
  return data;
};


AdvancedParser.compressData = function(data, deltas) {
  data.header.deltas = deltas = deltas !== false;

  trace("****** compressData(); useDeltas:", data.header.deltas, "header:", data.header)

  function compressCoords(arr) {
    var coord, prev = 0;
    var useDeltas = deltas;

    for (var i=0, len=arr && arr.length; i<len; i++) {
      var coord = arr[i];
      coord = coord | 0; // round;
      arr[i] = coord - prev;

      if (useDeltas) {
        prev = coord;
      }
    }
  }

  function compressMultiShapes(arr) {
    Utils.forEach(arr, function(parts) {
      Utils.forEach(parts, compressArc);
    });
  }

  function compressSimpleShapes(arr) {
    Utils.forEach(arr, compressArc);
  }

  function compressArc(arr) {
    if (!arr || arr.length < 2) {
      return;
    }
    compressCoords(arr[0]);
    compressCoords(arr[1]);
  }

  compressSimpleShapes(data[C.INNERLINES]);
  compressSimpleShapes(data[C.OUTERLINES]);
  compressSimpleShapes(data[C.POLYLINES]);
  compressMultiShapes(data[C.POLYGONS]);

};