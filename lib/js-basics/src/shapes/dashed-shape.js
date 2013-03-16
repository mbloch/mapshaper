/* @requires core, core.geo, shapes */


Utils.partitionVertexSet = function(vec, zz, breaks) {
	var xx = vec.xx;
	var yy = vec.yy;
	var vectors = [];
	var classIds = [];

	if (!xx || !yy || !zz || xx.length != zz.length || xx.length < 2) {
		trace("[dashed-shape partitionVertexSet()] Mismatched input:", xx, yy, zz);
		return null;
	}

	var prevX, prevY, prevZ, prevClassId, currVec;

	// step one: partition into continuous segments
	for (var i=0, len=zz.length; i<len; i++) {
		var x = xx[i];
		var y = yy[i];
		var z = zz[i];
		var classId = Utils.getClassId(z, breaks);
		trace("z =>", classId, "z:", z, "breaks:", breaks);

		if (i == 0) {
			currVec = new VertexSet([], []);
		}
		else {
			if (prevClassId != classId) {
				var innerBreaks = Utils.getInnerBreaks(prevZ, z, breaks);
				var diff = z - prevZ;
				for (var j=0; j < innerBreaks.length; j++) {
					var breakVal = innerBreaks[j];
					var breakDiff = breakVal - prevZ;
					var frac = breakDiff / diff;
					var intX  = prevX + (x - prevX) * frac;
					var intY = prevY + (y - prevY) * frac;
					currVec.xx.push(intX);
					currVec.yy.push(intY);
					currVec.calcBounds();
					classIds.push(prevClassId);
					vectors.push(currVec);

					currVec = new VertexSet([intX], [intY]);
					prevClassId = prevClassId + (diff > 0 ? 1 : -1);
				}
			}
		}

		currVec.xx.push(x);
		currVec.yy.push(y);

		prevX = x;
		prevY = y;
		prevZ = z;
		prevClassId = classId;
	}

	classIds.push(prevClassId);
	currVec.calcBounds();
	vectors.push(currVec);

	return {classes:classIds, paths:vectors};

};




Utils.getSegmentedShapeVector = function(id, vec, opts) {
	if (!opts || !opts.dash || !opts.space) {
		trace("[dashed-shape getSegmentVector()] missing opts.space and/or opts.dash.");
		return new ShapeVector(id, vec);
	}

	var dashes = this.chopVertexSet(vec, opts);
	var shp;
	if (dashes.length == 0) {
		shp = new ShapeVector(id, null);
	}
	else {
		shp = new ShapeVector(id, dashes[0]);
		for (var i=1; i<dashes.length; i++) {
			shp.addPartData(dashes[i]);
		}
	}

	return shp;
};


Utils.chopVertexSet = function(vec, opts) {
	var dashLen = opts.dash;
	var spaceLen = opts.space;
	var firstSpace = opts.firstSpace || 0;
	var firstDash = opts.firstDash || 0;

	var xx = vec.xx;
	var yy = vec.yy;

	var dashes = [];

	var vertX = xx[0];
	var vertY = yy[0];

	var currDash = null; // new VertextSet([prevX], [prevY]);
	var inDash = false;
	var pathLeft = 0;

	if (firstDash > 0) {
		inDash = true;
		currDash = new VertexSet([vertX], [vertY]);
		pathLeft = firstDash;
	}
	else if (firstSpace > 0) {
		inDash = false;
		pathLeft = firstSpace;
	}

	var pathX = vertX;
	var pathY = vertY;

	for (var i=1, len=xx.length; i<len; i++) {
		var nextX = xx[i];
		var nextY = yy[i];
		var segLeft = Point.distance(vertX, vertY, nextX, nextY);

		// case a: remainder of current dash or space fits inside current polyline segment
		while(segLeft >= pathLeft) {
			// find x,y of next path endpoint along the polyline
			var ratio = pathLeft > 0 ? pathLeft / segLeft : 0;
			pathX += (nextX - pathX) * ratio;
			pathY += (nextY - pathY) * ratio;

			segLeft -= pathLeft;
			if ( inDash ) {
				//g.lineTo( pathX, pathY );
				currDash.addPoint(pathX, pathY);
				currDash.calcBounds();
				dashes.push(currDash);
				currDash = null;
				pathLeft = spaceLen;
			}
			else {
				//g.moveTo( pathX, pathY );
				currDash = new VertexSet([pathX], [pathY]);
				pathLeft = dashLen;
			}
			inDash = !inDash;
		}


		// Case B:	Remaining length of current dash or space is greater than 
		//			the remaining length of current vector segment.
		//			Action: draw (or skip) to end of segment. 
		if ( segLeft < pathLeft ) {
			pathLeft -= segLeft;
			if ( inDash ) {
				currDash.addPoint(nextX, nextY);
				//g.lineTo( nextX, nextY );
			}
			else {
				// no need to move pen along empty path
				// * BUT * in the future, we may want to support filled paths by drawing invisible segments. 
				// g.moveTo( nextX, nextY ); // 
			}
			pathX = nextX;
			pathY = nextY;
		}

		vertX = nextX;
		vertY = nextY;
	}

	if (currDash) {
		currDash.addPoint(vertX, vertY);
		currDash.calcBounds();
		dashes.push(currDash);
	}

	// update opts.firstDash and opts.firstSpace, so next segment can match this one
	//
	if (inDash) {
		opts.firstSpace = 0;
		opts.firstDash = pathLeft;
	} 
	else {
		opts.firstSpace = pathLeft;
		opts.firstDash = 0;
	}

	return dashes;

};