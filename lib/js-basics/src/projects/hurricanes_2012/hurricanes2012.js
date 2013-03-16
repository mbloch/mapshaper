/* @requires mercator, shapes, core.geo, hybrid-styles, arrayutils, gmaputils, dashed-shape, dateutils */

var Hurricanes = {

	// original track data fields
	NAME: 'NAME',			// display name, e.g. 'Alex'
	NOAA_ID: 'NOAA_ID', 	// NOAA storm id, e.g. '2010_1'
	YEAR: 'YEAR', 			// year (String)

	// computed track data fields
	TRACK_PATH : "trackPath",
	TRACK_VECTOR: "trackVector",

	TRACK_TIMES: "trackTimes",
	TRACK_INTENSITIES: "trackIntensities",
	TRACK_WIND_SWATH: "windSwath",
	TRACK_LATITUDES: "lats",
	TRACK_LONGITUDES: "lons",
	FORECAST_PATH : "forecastPath",
	FORECAST_VECTOR: "forecastVector",
	FORECAST_INTENSITIES: "forecastIntensities",
	FORECAST_TIMES: "forecastTimes",
	FORECAST_CONE: "forecastCone",

	FORECAST_VECTOR_2: "forecastVector2",
	FORECAST_CLASS_2: "forecastClasses2",

	// fields for individual segment / dot tables
	// 
	OBS_INTENSITY: "obsIntensity",
	OBS_TIME: "obsTime",
	OBS_SHAPE: "obsShape",
	OBS_CLASS: "obsClass",
	OBS_X: "obsX",
	OBS_Y: "obsY",
	OBS_FORECAST: "obsForecast",


	projection : new SphericalMercator()

};

Hurricanes.EXTEND_TRACK = true;

// storm strengths: td, ts, c1, c2, c3, c4, c5
Hurricanes.COLORS = [0x65DBDB, 0x2DB5B5, 0XFFBE2C, 0xF99A03, 0xED6000, 0xE0450E, 0xC90A0A];
Hurricanes.INTENSITY_BREAKS = [34, 64, 83, 96, 114, 135];
Hurricanes.STORM_LABELS = "Tropical depression,Tropical storm,Cat. 1 hurricane,Cat. 2 hurricane,Cat. 3 hurricane,Cat. 4 hurricane,Cat. 5 hurricane".split(',');
Hurricanes.TIMESTAMP_PARSER = new DateString("%Y%m%d%H");

Hurricanes.convKnotsToMilesPerHour = function( val ) {
	//1 kts = 1.15077945 mph
	return val * 1.15077945;
};

Hurricanes.WINDSPEED_BREAKS = Utils.map(Hurricanes.INTENSITY_BREAKS, function(knots) { var mph = Hurricanes.convKnotsToMilesPerHour(knots); return Math.round(mph);})


Hurricanes.getStormLabel = function(classId) {
	return this.STORM_LABELS[classId] || "Unknown";
}


Hurricanes.GOOGLE_MAP_STYLE = [ 
  //{ featureType: "all", elementType: "all", stylers: [ { lightness: 33 }, { gamma: 0.8 }, { saturation: -61 } ] },
  //{ featureType: "poi", elementType:"labels", stylers: [{ visibility: "off" }] },
  //{ featureType: "transit.station", elementType:"labels", stylers:[{visibility:"off"}]},
  { featureType: "all", elementType: "all", stylers: [ { saturation: -90 } ] },
  //{ featureType: "all", elementType: "all", stylers: [ { lightness: 0 }, { gamma: 0.8 }, { saturation: -90 } ] },
  /*
  { featureType: "road.local", elementType: "geometry", stylers: [ { color:"#bbbbbb"}, { visibility: "simplified" } ] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [ { visibility: "simplified" }, { color: "#bbbbbb" } ] },
  { featureType: "road.arterial", elementType: "labels", stylers: [ { visibility: "off" } ] },
  { featureType: "road.highway", elementType: "geometry", stylers: [ { visibility: "simplified" }, { saturation: -91 }, { gamma: 0.8 }, { lightness: 40 } ] },
  { featureType: "road.highway", elementType: "labels", stylers: [ { visibility: "off" } ] }, */
  { featureType: "road", elementType: "geometry", stylers: [ { visibility: "simplified" }, { color: "#bbbbbb" } ] },
  { featureType: "road", elementType: "labels", stylers: [ { visibility: "off" }] },

  { featureType: "water", elementType: "geometry", stylers: [ { lightness: 85} ] },
  //{ featureType: "administrative.country", elementType: "geometry", stylers: [ { lightness: 30} ] },
  { featureType: "landscape", elementType: "geometry", stylers: [ { lightness: -10} ] },
  { featureType: "poi", elementType: "all", stylers: [ { visibility: "off"} ] },


  { featureType: "administrative", elementType: "geometry", stylers: [ { visibility: "off"} ] },
  { featureType: "administrative.country", elementType: "geometry", stylers: [ { visibility:"on"} ] },
  { featureType: "administrative.province", elementType: "geometry", stylers: [ { visibility:"on"}, {color:"#ffffff"} ] },


{ featureType: "landscape.man_made", elementType: "geometry", stylers: [ { visibility: "simplified" }, { gamma: 0.76 } ] }
];


/*
			//s.addRule( "administrative", "visibility", "off", "geometry");
			//s.addRule( "administrative.country", "visibility", "on", "geometry");
			//s.addRule( "administrative.province", "visibility", "on", "all");  // "all" turns on state labels, even when "administrative" 
			s.addRule( "administrative.province", "gamma", .1, "labels" );		// this darkens && reduces contrast of grays
			s.addRule( "administrative.province", "lightness", 50, "labels" );	// lightness changes 
*/

Hurricanes.__createPathVector = function(lats, lons) {
	if (!lats || !lons || !lats.length || lats.length != lons.length) {
		trace("[Hurricanes.__createPathVector()] Invalid lat/lon arrays");
		return null;
	}

	var proj = Hurricanes.projection;
	var xx = [], yy = [], xy = new Point();

	for (var i=0, len=lats.length; i<len; i++) {
		proj.projectLatLng(lats[i], lons[i], xy);
		xx.push(xy.x);
		yy.push(xy.y);
	}

	var vec = new VertexSet(xx, yy);
	vec.calcBounds();
	return vec;
};

Hurricanes.getStormClass = function(intensity) {
	return Utils.getClassId(intensity, this.INTENSITY_BREAKS);
};

Hurricanes.getInnerBreaks = function(v1, v2, breaks) {

};


Hurricanes.__convertTrack = function(stormId, vec, intensities, table, segments) {

	var DASH_LEN = 40000;
	var SPACE_LEN = 30000;

	var xx = vec.xx;
	var yy = vec.yy;

	var prevX = xx[0];
	var prevY = yy[0];
	var prevIntensity = intensities[0];
	var prevClass = this.getStormClass(prevIntensity);

	var currVec = new VertexSet([prevX], [prevY]);
	var obj = {'NOAA_ID': stormId};

	segmentOpts = {dash:DASH_LEN, space:SPACE_LEN, firstSpace: SPACE_LEN * 0.6};

	// step one: partition into continuous segments
	for (var i=1, len=intensities.length; i<len; i++) {
		var intensity = intensities[i];
		var x = xx[i];
		var y = yy[i];
		var stormClass = this.getStormClass(intensity);

		if (prevClass != stormClass) {
			var breaks = Utils.getInnerBreaks(prevIntensity, intensity, this.INTENSITY_BREAKS)

			var diff = intensity - prevIntensity;

			for (var j=0; j<breaks.length; j++) {
				var breakVal = breaks[j];
				var breakDiff = breakVal - prevIntensity;
				var frac = breakDiff / diff;
				var intX = prevX + (x - prevX) * frac;
				var intY = prevY + (y - prevY) * frac;
				currVec.xx.push(intX);
				currVec.yy.push(intY);

				obj[this.OBS_CLASS] = prevClass;
				currVec.calcBounds();

				//var shp = 
				var shp = segments ? Utils.getSegmentedShapeVector(table.size(), currVec, segmentOpts) : new ShapeVector(table.size(), currVec);
				obj[this.OBS_SHAPE] = shp;

				table.appendRecordData(obj);

				// update class, etc
				currVec = new VertexSet([intX], [intY]);
				prevClass = prevClass + (diff > 0 ? 1 : -1);
			}
		}

		currVec.xx.push(x);
		currVec.yy.push(y);

		prevIntensity = intensity;
		prevClass = stormClass;
		prevX = x;
		prevY = y;
	}

	obj[this.OBS_CLASS] = prevClass;
	currVec.calcBounds();
	//var shp = 
	var shp = segments ? Utils.getSegmentedShapeVector(table.size(), currVec, segmentOpts) : new ShapeVector(table.size(), currVec);

	obj[this.OBS_SHAPE] = shp;
	table.appendRecordData(obj);

}


/* */
Hurricanes.__importTrackRecord = function(src, dest) {

	var lats = Utils.map(src.get('LAT_COORDS').split(','), parseFloat);
	var lons = Utils.map(src.get('LON_COORDS').split(','), parseFloat);
	var intensities = Utils.map(src.get('INTENSITIES').split(','), parseFloat);
	var timeStrings = src.get('TIMES').split(',');


	// todo: TIMES

	var forecastTimeStr = src.get('FORECAST_TIMES'); // empty or ...
	if (forecastTimeStr) {
		var forecastTimeStrings = forecastTimeStr.split(',');
		var forecastLats = Utils.map(src.get('FORECAST_LAT_COORDS').split(','), parseFloat);
		var forecastLons = Utils.map(src.get('FORECAST_LON_COORDS').split(','), parseFloat);
		var forecastIntensities = Utils.map(src.get('FORECAST_INTENSITIES').split(','), parseFloat);
		var forecastTrack = Hurricanes.__createPathVector(forecastLats, forecastLons);
		var forecastTrackShape = new ShapeVector(src.id, forecastTrack);
		dest.set(this.FORECAST_PATH, forecastTrackShape);
		dest.set(this.FORECAST_VECTOR, forecastTrack);

		//dest.set(this.FORECAST_VECTOR, trackVec); // debug
		dest.set(this.FORECAST_INTENSITIES, forecastIntensities);
		dest.set(this.FORECAST_TIMES, forecastTimeStrings);

		// Make segmented vectors
		/*
		if (intensities && intensities.length > 0) {

			var data = this.__getSegmentedPath(forecastTrack, intensities);
			dest.set(this.FORECAST_VECTOR_2, data.vectors);
			dest.set(this.FORECAST_CLASS_2, data.classes);
		}
		*/

		if (this.EXTEND_TRACK) {
			lats.push(forecastLats[0]);
			lons.push(forecastLons[0]);
			intensities.push(forecastIntensities[0]);
			timeStrings.push(forecastTimeStrings[0]);
		}
	}

	var trackVec = Hurricanes.__createPathVector(lats, lons);
	var trackShape = new ShapeVector(src.id, trackVec);
	dest.set(this.TRACK_LATITUDES, lats);
	dest.set(this.TRACK_LONGITUDES, lons);
	dest.set(this.TRACK_PATH, trackShape);
	dest.set(this.TRACK_VECTOR, trackVec);
	dest.set(this.TRACK_INTENSITIES, intensities);
	dest.set(this.TRACK_TIMES, timeStrings);

};




Hurricanes.__getShapeData = function(table, fname) {
	var bb = new BoundingBox();
	var shapeArr = table.getFieldData(fname);
	for (var i=0, len=shapeArr.length; i<len; i++) {
		bb.mergeBounds(shapeArr[i]);
	}

	var shapeData = new ShapeData(C.POLYLINES);
	shapeData.initData({bounds:bb, shapes:shapeArr, polygons:false});
	return shapeData;
};

Hurricanes.__getForecastSegmentShape = function(id, x0, y0, x1, y1) {
	var dist = Point.distance(x0, y0, x1, y1);
	var hatchLen = 40000;
	var spaceLen = 30000;

	var vec = new VertexSet([x0, x1], [y0, y1]);
	vec.calcBounds();
	var shp = new ShapeVector(id, vec);
	return shp;
};

Hurricanes.__getSegmentShape = function(id, x0, y0, x1, y1) {
	var vec = new VertexSet([x0, x1], [y0, y1]);
	vec.calcBounds();
	var shp = new ShapeVector(id, vec);
	return shp;
};

/**
 *  Get data for bubble and track layers...
 */
Hurricanes.__getTrackLayerData = function(table, pathTable, pointTable, isForecast) {
	var tracks = table.getRecordSet();
	
	// dot table needs fields: NOAA_ID, TIMESTAMP, INTENSITY
	// segment table needs fields: NOAA_ID, INTENSITY
	var fVec = this.TRACK_VECTOR;
	var fTime = this.TRACK_TIMES;
	var fIntensity = this.TRACK_INTENSITIES;
	var fId = this.NOAA_ID;
	if (isForecast) {
		fVec = this.FORECAST_VECTOR;
		fTime = this.FORECAST_TIMES;
		fIntensity = this.FORECAST_INTENSITIES;
	}
/*
	var trackTableSchema = {};
	trackTableSchema[this.OBS_CLASS] = "int";
	trackTableSchema[this.OBS_INTENSITY] = "double";
	trackTableSchema[this.OBS_SHAPE] = "object";
	trackTableSchema[this.NOAA_ID] = 'string';

	var trackTableSchema2 = {};
	trackTableSchema2[this.OBS_CLASS] = "int";
	trackTableSchema2[this.OBS_SHAPE] = "object";
	trackTableSchema2[this.NOAA_ID] = 'string';

	var pointTableSchema = {};
	pointTableSchema[this.NOAA_ID] = 'string';
	pointTableSchema[this.OBS_INTENSITY] = "double";
	pointTableSchema[this.OBS_CLASS] = "int"; // not used
	pointTableSchema[this.OBS_TIME] = "string";
	pointTableSchema[this.OBS_X] = "double";
	pointTableSchema[this.OBS_Y] = "double";

	var trackTable = new DataTable({schema:trackTableSchema});

	var pointTable = new DataTable({schema:pointTableSchema});

	var trackTable2 = new DataTable({schema:trackTableSchema2});
*/

	var trackObj = {};
	var pointObj = {};
	var bb = new BoundingBox();

	while (tracks.hasNext()) {
		var prevX = null, prevY = null;
		var trackRec = tracks.nextRecord;

		if (trackRec.get('ACTIVE') != 1 && isForecast) {
			continue;
		}

		if (trackRec.get('VISIBLE') != 0) {
			//continue;
		}

		var stormId = trackRec.get(fId);
		var timestamps = trackRec.get(fTime);
		var intensities = trackRec.get(fIntensity);
		var vec = trackRec.get(fVec);
		if (!vec || !intensities) {
			continue;
		}
		//isForecast && trace(">> have a forecast for:", stormId, timestamps.length, vec.xx, vec.yy);
		var xx = vec.xx;
		var yy = vec.yy;
		var trackLen = xx.length;
		if (trackLen != intensities.length || trackLen != timestamps.length || trackLen != yy.length) {
			trace("[__getTrackLayerData()] mismatch in number of observations");
			continue;
		}

		this.__convertTrack(stormId, vec, intensities, pathTable, isForecast);

		for (var i=0, len=xx.length; i < len; i++) {
			pointObj[this.OBS_INTENSITY] = intensities[i];
			pointObj[this.OBS_CLASS] = this.getStormClass(intensities[i]);
			pointObj[this.OBS_TIME] = timestamps[i];
			var x = xx[i];
			var y = yy[i];
			bb.mergePoint(x, y);
			pointObj[this.OBS_X] = x;
			pointObj[this.OBS_Y] = y;
			pointObj[this.NOAA_ID] = stormId;
			pointObj[this.OBS_FORECAST] = isForecast ? 1 : 0;
			pointTable.appendRecordData(pointObj);
			/*
			if (i > 0) {
				if (isForecast) {
					var shp = this.__getForecastSegmentShape(trackTable.length, prevX, prevY, x, y);	
				} else {
					shp = this.__getSegmentShape(trackTable.length, prevX, prevY, x, y);	
				}
				trackObj[this.OBS_INTENSITY] = intensities[i];
				trackObj[this.OBS_SHAPE] = shp;
				trackObj[this.NOAA_ID] = stormId;
				trackObj[this.OBS_CLASS] = this.getStormClass(intensities[i]);
				trackTable.appendRecordData(trackObj);
			}
			*/
			prevX = x;
			prevY = y;
		}
	}
	//var retn = {trackTable: trackTable, bounds:bb, pointTable:pointTable, trackTable2:trackTable2};
	//return retn;
	return bb;
};

Hurricanes.__getGoogleMapType = function(name, urlBase) {
	var opts = {
		getTileUrl: function(coord, zoom) {
			var x = coord.x;
			var y = coord.y;
			y = Utils.convOsGeoToGoogleY(y, zoom);
			var url = urlBase + name + "/" + zoom + "-" + x + "-" + y + ".jpg";
			//trace("tile url:", url)
			return url;
		},
		tileSize: new google.maps.Size(256, 256),
  		maxZoom: 7,
  		minZoom: 2,
  		name: name
	};

	var mapType = new google.maps.ImageMapType(opts);
	return mapType;
};


Hurricanes.getImageMapTypes = function(names, urlBase) {
	var index = {};
	Utils.forEach(names, function(name) {
		var mapType = this.__getGoogleMapType(name, urlBase);
		index[name] = mapType;
	}, this);
	return index;
};


Hurricanes.configureImageViews = function(baseLayer, names, urlBase) {
	Utils.forEach(names, function(name) {
		var template = urlBase + name + "/{z}-{x}-{y}.jpg";
		baseLayer.addView(name, {type:BaseLayer.IMAGE_TYPE, template:template, backgroundColor:"#000"});
	});
}

Hurricanes.getTrackLayers = function(trackTable) {


	var pathTableSchema = {};
	pathTableSchema[this.OBS_CLASS] = "int";
	pathTableSchema[this.OBS_SHAPE] = "object";
	pathTableSchema[this.NOAA_ID] = 'string';

	var pointTableSchema = {};
	pointTableSchema[this.NOAA_ID] = 'string';
	pointTableSchema[this.OBS_INTENSITY] = "double";
	pointTableSchema[this.OBS_CLASS] = "integer"; // not used
	pointTableSchema[this.OBS_TIME] = "string";
	pointTableSchema[this.OBS_X] = "double";
	pointTableSchema[this.OBS_Y] = "double";
	pointTableSchema[this.OBS_FORECAST] = "integer";

	var pathTable = new DataTable({schema:pathTableSchema});

	var pointTable = new DataTable({schema:pointTableSchema});

	var bb1 = this.__getTrackLayerData(trackTable, pathTable, pointTable, false);
	var bb2 = this.__getTrackLayerData(trackTable, pathTable, pointTable, true);

	bb1.mergeBounds(bb2);

	var self = this;


	var trackSymbols = new ShapeData(C.POLYLINES);
	var trackObj = {bounds:bb1, polygons:false, shapes:pathTable.getFieldData(this.OBS_SHAPE)};
	trackSymbols.initData(trackObj);

	var trackLayer = new ShapeLayer(trackSymbols);

	var trackStyler = new DataStyler(pathTable);
	var defaultTrackStyle = {
		strokeWeight: 2,
		strokeColor: 0xcccc00,
		strokeAlpha: 1,
		fillAlpha: 0,
		hoverStrokeWeight: 2,
		hoverStrokeColor: 0,
		hoverStrokeAlpha: 1
	};
	trackStyler.setDefaultStyle(defaultTrackStyle);

	function trackIsHidden(rec) {

		var stormId = rec.get(self.NOAA_ID);
		//trace("trackIsHidden()]:", rec, stormId)
		var trackRec = trackTable.getIndexedRecord(stormId);
		return trackRec.get('VISIBLE') ? false : true;
	}

	function getColor(rec) {
		//var intensity = rec.get(self.OBS_INTENSITY);
		//var idx = Utils.getClassId(intensity, self.INTENSITY_BREAKS);
		var idx = rec.get(self.OBS_CLASS);
		var col = self.COLORS[idx];
		
		return col;
	}

	trackStyler.setAttributeStyler('hidden', trackIsHidden);
	trackStyler.setAttributeStyler('strokeColor', getColor);
	//trackLayer.setInteraction(true);
	trackLayer.setStyler(trackStyler);

	//trackLayer.on('rollover', function(rec) { trace(rec)});

	
	var defaultCircleStyle = {
		bubbleSize: 8,
		fillColor: 0xffcccc,
		fillAlpha: 1,
		strokeWeight: 1,
		strokeAlpha: 0.1,
		strokeColor: 0,
		hoverStrokeColor: 0,
		hoverStrokeWeight: 2,
		hoverStrokeAlpha: 1,
		hoverFillColor: 0,
		hoverFillAlpha:1
	};


	var trackCircles = new CircleData();
	trackCircles.importXYFields(pointTable, this.OBS_X, this.OBS_Y);
	var trackCircleStyler = new DataStyler(pointTable);
	trackCircleStyler.setAttributeStyler('hidden', trackIsHidden);
	trackCircleStyler.setAttributeStyler('fillColor', getColor);
	trackCircleStyler.setDefaultStyle(defaultCircleStyle);
	var trackPointLayer = new CircleLayer(trackCircles);
	trackPointLayer.setStyler(trackCircleStyler);
	trackPointLayer.setInteraction(true);

	var retn = {
		pointTable: pointTable,
		trackLayer: trackLayer,
		trackPointLayer: trackPointLayer
	};
	return retn;
};

Hurricanes.getCurrentLocation = function(rec) {
	var lats = rec.get(this.TRACK_LATITUDES);
	var lons = rec.get(this.TRACK_LONGITUDES);
	var times = rec.get(this.TRACK_TIMES);
	var windspeeds = rec.get(this.TRACK_INTENSITIES);
	trace("[getCurrentLocation()] times:", times);
	var obj;
	if (lats && lons) {
		var idx = lats.length - 1;
		obj = {lat:lats[idx], lng:lons[idx]};
		var gmtDate = this.TIMESTAMP_PARSER.parseDate(times[idx]);
		obj.date = Utils.addHours(gmtDate, -4);
		obj.knots = parseFloat(windspeeds[idx]);
		obj.mph = this.convKnotsToMilesPerHour(obj.knots);
		obj.name = rec.get('NAME');
		obj.classId = this.getStormClass(obj.knots);
		obj.forceLabel = this.getStormLabel(obj.classId);
		if (obj.classId > 1) {
			obj.hurricaneCategory = obj.classId - 1;
		}
	}
	return obj;
}


Hurricanes.getForecastPathLayer = function(table) {
	var shapes = this.getForecastShapes(table);

	var styler = new DataStyler(table);

	var style = {
		fillColor: 0xff0000,
		fillAlpha: 1,
		strokeWeight: 2,
		strokeColor: 0xcccc00,
		strokeAlpha: 1,
		hoverStrokeWeight: 2,
		hoverStrokeColor: 0,
		hoverStrokeAlpha: 1
	};

	trace("[getTrackLayer()] shapes ready?", shapes.isReady());
	var obj = shapes.extractProjectedShapes();
	//trace(obj)

	styler.setDefaultStyle(style);
	styler.setAttributeStyler('hidden', function(rec) {var vis = rec.get('VISIBLE'); return !vis;} );
	var lyr = new ShapeLayer(shapes);
	lyr.setStyler(styler);
	return lyr;

};


Hurricanes.getTrackShapes = function(table) {
	return this.__getShapeData(table, this.TRACK_PATH);
};

Hurricanes.getForecastShapes = function(table) {
	return this.__getShapeData(table, this.FORECAST_PATH);
};


/**
 *  Create track objects and shapes for tracks in the table...
 */
 /**/
Hurricanes.importTrackTable = function(trackTable) {
	var destTable = trackTable;
	destTable.addField(this.FORECAST_PATH, "object");
	destTable.addField(this.FORECAST_VECTOR, "object");
	destTable.addField(this.TRACK_PATH, "object");
	destTable.addField(this.TRACK_VECTOR, 'object');
	destTable.addField(this.TRACK_INTENSITIES, "object");
	destTable.addField(this.TRACK_TIMES, "object");
	destTable.addField(this.FORECAST_INTENSITIES, "object");
	destTable.addField(this.FORECAST_TIMES, "object");
	destTable.addField(this.FORECAST_VECTOR_2, "object");
	destTable.addField(this.FORECAST_CLASS_2, "int");
	destTable.addField(this.TRACK_LATITUDES, "object");
	destTable.addField(this.TRACK_LONGITUDES, "object");


	var trackRecords = trackTable.getRecordSet();
	while(trackRecords.hasNext()) {
		var rec = trackRecords.nextRecord.clone();
		Hurricanes.__importTrackRecord(rec, rec);  // importing to same table
	}

	function linkFields(table, srcField, destField) {
		var srcArr = table.getFieldValues(srcField);
		var destArr = table.getFieldValues(destField);
		if (srcArr && srcArr.length > 0 && destArr) {
			destArr.push(srcArr[0]);
		}
	}



	// trace(">> last rec:", rec)
};

