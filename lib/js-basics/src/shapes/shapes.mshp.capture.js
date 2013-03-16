/** @requires events, core, browser, utf16  */
/* @requires topo-shapes */
/* @requires shapes.advanced */


/**
 * Parse a (unicode) string containing mshp data.
 *
 * @param {string} mshpStr String containing mshp-encoded shape data.
 * @param {function()=} transform (Optional) x, y transform function.
 * @param {array} types Array of requested layer types (polygons polylines innerlines outerlines).
 */
function MshpParser(mshpStr, transform, types) {
  if (!Utils.isArray(types)) {
    trace("[MshpParser()] Requires an array of shape types.");
    return;
  }

  var typeIndex = Utils.arrayToIndex(types);
  var bytes = new Utf16Array(mshpStr);
  bytes.useLittleEndian(); // Mshp format uses little-endian for integers.


  // Parse header section to get metadata.
  //
  var metaData = this.parseHeader(bytes);
  if (!metaData) {
    trace('[MshpParser.parseByteArray()] error parsing file header; stopping.');
    return;
  }

  if (!(metaData.shp_type == 5 && metaData.topology)) {
    trace("[MshpParser] Unable to parse; Parser currently only supports polygon data with topology. Found type:", metaData.shp_type, "topology?", metaData.topology);
    return;
  }

  this.data = {header:metaData};


  // Init scale controller
  //
  var simplifiedLevels = metaData.simplified_levels;
  var levelStepFactor = 2;
  if (simplifiedLevels > 0 && metaData.level_resolution > 1) {
    levelStepFactor = Math.pow(2, 1 / metaData.level_resolution);
  }
  // Adjust scale thresholds on lower-power devices to display simpler lines for faster rendering.
  // TODO: Handle other handheld devices.
  var scaleAdjustment = Browser.iPhone || Browser.iPad ? 0.4 : 0.7;
  var levelOneThreshold = 1 << metaData.level_one_precision;
  this._vectorScale = new MshpScale(simplifiedLevels, levelStepFactor, levelOneThreshold, scaleAdjustment);

  // Extract polyline sections, reprojecting if needed.
  //
  T.start();
  this._layerBounds = this.parseVectors(bytes, transform || null, metaData);
  T.stop(" + parseVectors()");

  // Parse topological data, extract polygon shapes (if required)
  //
  var extractPolygons = C.POLYGONS in typeIndex;
  var buildSharedArcIndex = C.INNERLINES in typeIndex || C.OUTERLINES in typeIndex;

  var buildTopology = C.TOPOLOGY in typeIndex || C.OUTLINE in typeIndex;

  T.start();
  this._polygonShapes = this.parseTopologyData(bytes, extractPolygons, buildSharedArcIndex, buildTopology);  // ~113 ms on iPad v1, 500kB file w/ house districts
  T.stop(" + parseTopologyData()");

  // Generate various kinds of polyline shapes, as requested.
  //
  T.start();
  var sharedArcIndex = this._sharedArcIndex; // Assume shared index has been populated as side-effect of parseTopologyData(), if required.
  if (C.POLYLINES in typeIndex) {
    this._lineShapes = this.initLines(C.POLYLINES);
  }

  if (C.OUTERLINES in typeIndex) {
    this._outerShapes = this.initLines(C.OUTERLINES, sharedArcIndex);
  }

  if (C.INNERLINES in typeIndex) {
    this._innerShapes = this.initLines(C.INNERLINES, sharedArcIndex);
  }
  T.stop( " + initLines()");

  // clear references to arc data when possible, to free up memory
  //
  this._xx = null;
  this._yy = null;
  this._zz = null;

  delete this.data.arcs; // this data has been incorporated into other areas

  /*
  AdvancedParser.compressData(this.data, true);
  trace(this.data);
  // trace(Utils.getKeys(this.data));


  var parser = new AdvancedParser(this.data);
  this._outerShapes = parser.hasType(C.OUTERLINES) && parser.extractProjectedShapes(C.OUTERLINES).shapes;
  this._innerShapes = parser.hasType(C.INNERLINES) && parser.extractProjectedShapes(C.INNERLINES).shapes;
  this._polygonShapes = parser.hasType(C.POLYGONS) && parser.extractProjectedShapes(C.POLYGONS).shapes;
  this._lineShapes = parser.hasType(C.POLYLINES) && parser.extractProjectedShapes(C.POLYLINES).shapes;
  */
/* */
  // createVectors(this.data);
  // return new TopoShapes(this.data);
}



MshpParser.prototype.getBounds = function() {
  return this._layerBounds.cloneBounds();
}


MshpParser.prototype.initLines = function(type, sharedIndex) {
  var getInner = type == C.INNERLINES;
  var getOuter = type == C.OUTERLINES;
  var getAll = !(getInner || getOuter);
  var scaleObj = this._vectorScale;
  var shapes = [];
  var xx = this._xx;
  var yy = this._yy;
  var zz = this._zz;
  var len = xx.length;
  var shapeCount = 0;


  var arr = this.data[type] = [];

  for (var arcId=0; arcId<len; arcId++) {
    if (getInner && !sharedIndex[arcId] || getOuter && sharedIndex[arcId] === true) {
      continue;
    }

    var vec = new MshpVertexSet(scaleObj, xx[arcId], yy[arcId], zz[arcId]);
    vec.calcBounds();
    var shp = new ShapeVector(shapeCount, vec);
    shapes.push(shp);
    shapeCount += 1;

    arr.push([xx[arcId], yy[arcId], zz[arcId]])
  }

  return shapes;
};


MshpParser.prototype.parseHeader = function(bytes) {
  var meta = {};
  meta.topology = true; // TODO: Also accept non-topological datasets.
  var versionCode = bytes.readByte();
  var shpType = bytes.readByte();
  meta.shp_type = shpType;

  if (shpType != 5 && shpType != 3) {
    trace('[MshpParser.parseHeader()]',
      'unsupported shape type, stopping: ' + shpType + " format:", versionCode);
    return null;
  }

  meta.num_arcs = bytes.readUnsignedInt();

  if (versionCode >= 64) { // Mapshaper output; read off some unused params.
    bytes.readUnsignedInt(); // arc vertices
    bytes.readUnsignedInt(); // orig. shapefile vertices
    bytes.readUnsignedInt(); // number of shared arcs
  }

  meta.minx = bytes.readDouble();
  meta.miny = bytes.readDouble();
  meta.maxx = bytes.readDouble();
  meta.maxy = bytes.readDouble();
  meta.m_pack = bytes.readDouble();
  meta.bx_pack = bytes.readDouble();
  meta.by_pack = bytes.readDouble();
  meta.bit_precision = bytes.readByte();
  meta.bitShift = 1 << (meta.bit_precision - 1);
  meta.simplified_levels = bytes.readByte();
  meta.level_resolution = bytes.readByte();
  meta.level_one_precision = bytes.readByte();
  meta.extract_levels = 0;
  meta.min_available_level = 0;
  if (versionCode == 3) {
    meta.extract_levels = bytes.readByte();
    meta.min_available_level = meta.simplified_levels -
      meta.extract_levels + 1;
  }

  meta.mUnpack = 1.0 / meta.m_pack;
  meta.bxUnpack = -meta.bx_pack * meta.mUnpack;
  meta.byUnpack = -meta.by_pack * meta.mUnpack;

  return meta;
};


MshpParser.prototype.extractMergedShape = function(ids) {
  if (!this._topology) {
    trace("[MshpParser.extractMergedShape()] Missing topology data; initialize with type C.TOPOLOGY");
    return null;
  }

  var shp = this._topology.mergeShapes(ids);
  return shp;
}

/**
 * Receive: array of arrays; each child array contains a list of shape ids to merge
 *
 */
MshpParser.prototype.extractMergedShapeSet = function(index) {
  // TODO: optimize

  var shapes = Utils.map(index, function(shapeIds, i) {
    var shp = this.extractMergedShape(shapeIds);
    shp.id = i;
    return shp;
  }, this);

  return shapes;
};


MshpParser.prototype.extractProjectedShapes = function(type) {
  //trace("***[MshpParser.extractProjectedShapes()] type:", type);
  var shapes;
  if (type == C.POLYGONS) {
    shapes = this._polygonShapes;
  }
  else if (type == C.POLYGONS) {
    shapes = this._lineShapes;
  }
  else if (type == C.INNERLINES) {
    shapes = this._innerShapes;
  }
  else if (type == C.OUTERLINES) {
    shapes = this._outerShapes;
  }
  else if (type == C.TOPOLOGY) {
    shapes = [];
  }
  else if (type == C.OUTLINE) {
    // T.start();
    var allIds = Utils.sequence(this._topology.shapeCount); // kludgy way to get number of shapes
    var shp = this.extractMergedShape(allIds);
    shapes = [shp]; // TODO: check performance, see if this is bottleneck
    // T.stop("[MshpParser.extractProjectedShapes()] outline"); // Fast for counties in one state (max 4ms)
  }

  if (!shapes) {
    trace("[MshpParser.extractProjectedShapes()] Shapes are not available for type:", type);
    shapes = [];
  }

  var data = {
    bounds: this._layerBounds.cloneBounds(), 
    polygons: type == C.POLYGONS || type == C.TOPOLOGY || type == C.OUTLINE, 
    shapes: shapes,
    vectorScaler: this._vectorScale
  };
  return data;
};


MshpParser.prototype.parseTopologyData = function(bytes, extractPolygons, buildSharedArcIndex, buildTopology) {
  var shapeRings = [];
  var newRing;
  var topoIndex = [];

  if (buildTopology) {
    var topoData = this.data.topology = { arcs: this.data.arcs };
    var ringData = topoData.parts = [];
    var shapeData = topology.shapes = [];
  }

  // EXPERIMENTAL: Init topology index
  //
  var topology = new TopologyIndex(this._xx, this._yy, this._zz, this._vectorScale);
  var arcs = [];
  var numRingArcs = bytes.readUnsignedInt();
  var ringCount = 0;
  var bounds = new BoundingBox();

  for (var j = 0; j < numRingArcs; j++) {
    var code = bytes.readByte();
    if (code == 1) {
      ringCount++;

    }
    var ringId = ringCount - 1;
    var arcId = bytes.readUnsignedShort();
    var reverseFlag = bytes.readByte() === 0;

    if (buildSharedArcIndex && reverseFlag === true) {
      topoIndex[arcId] = true;
    }

    if (buildTopology) {
      //trace("vectorId:", arcId, "ringId:", ringId, "rev:", reverseFlag);
      topology.addArc(arcId, ringId, reverseFlag);
      var arcCode = reverseFlag ? -arcId - 1 : arcId;
      if (ringData[ringId] === undefined) {
        ringData[ringId] = [];
      }
      ringData[ringId].push(arcCode);
    }

    if (extractPolygons) {
      newRing = shapeRings[ringId];

      if (!newRing) { // new ring...
        newRing = new MshpVertexSet(this._vectorScale);
        shapeRings[ringId] = newRing;
      }
   
      newRing.extend(this._xx[arcId], this._yy[arcId], this._zz[arcId], reverseFlag);
    }
  }

  if (buildSharedArcIndex) {
    this._sharedArcIndex = topoIndex;
  }

  if (!extractPolygons) {
    return null;
  }



  // Got rings
  // Next, get record:part associations
  //
  var numParts = bytes.readUnsignedInt();
  var shapeCount = 0;
  var shapeVectors = [];

  var ringShapeTable = [];

  for (var i = 0; i < numParts; i++) {
    var haveShape = false;
    do {
      var code = bytes.readByte();
      var partId = bytes.readUnsignedShort();
      bytes.readByte();

      if (code == 1) {
        shapeCount++;
      }
      var shapeId = shapeCount - 1; // shape id starts at 1;

      // null shape indicator : VERIFY & CHANGE THIS (remove magic number)
      if (partId == 65535) {
        trace("[MshpParser.parseTopologyData()] Found null shape; part id:", i);
        //shapeVectors[shapeId] = null;
        shapeVectors[shapeId] = new ShapeVector(i); // using empty vector as a placeholder instead of null
      }
      else {
        haveShape = true;
        //trace("ringId:", partId, " => shapeId:", shapeId);
        ringShapeTable[partId] = shapeId;
      }

    } while (!haveShape);


    var newRing = shapeRings[partId];
    if (!newRing) {
      trace('@@@ Missing ring:', partId,
        'in MshpParser.unpackShapes(). skipping');
      continue;
    }
    newRing.calcBounds();

    var shape = shapeVectors[shapeId];

    if (!shape) {
      shape = new ShapeVector(shapeId, newRing);
      shapeVectors[shapeId] = shape;
    }
    else {
      shape.addPartData(newRing);
    }
  }

  if (topology) {
    topology.buildTopology(ringShapeTable, shapeCount);
    //topology.mergeShapes([ 0 ])
    this._topology = topology;
  }

  if (buildTopology) {

  }

  this.data.polygons = Utils.map(shapeVectors, function(shp) {
    if (!shp || !shp.parts || !shp.parts.length > 0) {
      return null;
    }
    var parts = shp.parts;

    var polygon = [];
    for (var i=0, len=parts.length; i<len; i++) {
      var vec = parts[i];
      var arr = [vec.xx, vec.yy, vec.zz];
      polygon.push(arr);
    }
    return polygon;
  });

  return shapeVectors;
};


MshpParser.prototype.parseVectors = function(bytes, transform, metaData) {
  this._xx = [];
  this._yy = [];
  this._zz = [];

  var arcs = this.data.arcs = [];

  var minx = Infinity,
    maxx = -Infinity,
    miny = Infinity,
    maxy = -Infinity;

  var nullVec = new VertexSet([], []);

  // ASSUMES: header data has just been read; bytes position is pointing to beginning of arc data

  var bitPrecision = metaData.bit_precision;
  var useShort = bitPrecision <= 16;
  var x, y, xdiff, ydiff, rawx, rawy, xy;
  var numArcs = metaData.num_arcs;
  var shift = metaData.bitShift;
  var mUnpack = metaData.mUnpack;
  var bxUnpack = metaData.bxUnpack;
  var byUnpack = metaData.byUnpack;
  var xy = new Point();

  for (var arcId = 0; arcId < numArcs; arcId++) {

    var size = bytes.readUnsignedShort();
    var innerVertices = size < 2 ? 0 : size - 2;
    var thresholdBytes = metaData.simplified_levels > 0 ? innerVertices : 0;
    var xarr = new Array(size); // [];
    var yarr = new Array(size); // [];

    if (size > 0) {
      rawx = bytes.readUnsignedShort();
      rawy = bytes.readUnsignedShort();
    
      rawx = rawx * mUnpack + bxUnpack;
      rawy = rawy * mUnpack + byUnpack;

      if (transform) {
        xy = transform.transformXY(rawx, rawy, xy);
        x = xy.x;
        y = xy.y;
      }
      else {
        x = rawx;
        y = rawy;
      }


      xarr[0] = x;
      yarr[0] = y;

      var lastIdx = size - 1;
      for (var i = 1; i <= lastIdx; i++) {
        xdiff = bytes.readUnsignedShort() - shift;
        ydiff = bytes.readUnsignedShort() - shift;

        rawx += xdiff * mUnpack;
        rawy += ydiff * mUnpack;

        if (transform !== null) {
          xy = transform.transformXY(rawx, rawy, xy);
          x = xy.x;
          y = xy.y;
        }
        else {
          x = rawx;
          y = rawy;
        }

        if (x < minx)      minx = x;
        else if (x > maxx) maxx = x;
        if (y < miny)      miny = y;
        else if (y > maxy) maxy = y;

        xarr[i] = x;
        yarr[i] = y;
      }
    } // end in-arc vertex loop

    var zarr = new Array(thresholdBytes); // [];

    for (var j = 0; j < thresholdBytes; j++) {
      zarr[j] = bytes.readByte();
    }

    var arc = null;
    if (xarr.length > 0) {
      this._xx.push(xarr);
      this._yy.push(yarr);
      this._zz.push(zarr);

      arc = [xarr, yarr, zarr];
    }
    else {
      this._xx.push(null);
      this._yy.push(null);
      this._zz.push(null);

      arc = []; // ??? or null or [[],[],[]];
    }

  } // end arc unpack loop

  var bounds = new BoundingBox().setBounds(minx, maxy, maxx, miny);
  this.data.bounds = Opts.copyAllParams({}, bounds);

  return bounds;
};
