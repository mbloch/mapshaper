/* @requires data, dataview */

var Shapefile = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULIPOINTM: 28,
  MULTIPATCH: 31
};


var DBF = {

};


/*
  @param buff {}

*/
DBF.importFromBuffer = function(buff) {
  var byteLength = buff.byteLength;
  var view = new DataView(buff);
}