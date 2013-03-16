/* @requires nov2012_change */
/* @requires counties_2008 */


VoteMap.prototype.initChangeData = function(geo) {
  var src = new DataTable(nytg.data.counties_2008);
  // src.indexOnField('FIPS');
  geo.joinTableByKey('FIPS', src, 'FIPS');

  this.initChangeDataByYear(geo, geo, [2008])
  trace(">>>> geo;", geo);
  trace("  >> margins:", geo.getFieldData('margin2008'))
};  


