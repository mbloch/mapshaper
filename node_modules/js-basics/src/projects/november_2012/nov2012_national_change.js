/* @requires nov2012_change */
/* @requires counties_supplement */


VoteMap.prototype.initChangeData = function(geo) {
  this.initChangeDataByYear(geo, new DataTable(nytg.data.counties_supplement), [1996, 2000, 2004, 2008]);
};

