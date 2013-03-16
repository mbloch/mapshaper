/* @requires lambertconic */

function NewYork_LongIsland() {

  this.__super__(-74, 40.666667, 41.033333, 40.166667);
  this.setFalseEastingNorthing(300000, 0);
}

Opts.inherit(NewYork_LongIsland, LambertConformalConic);


/*
  NAD_1983_StatePlane_New_York_Long_Island_FIPS_3104
  Projection: Lambert_Conformal_Conic
  False_Easting: 300000.000000
  False_Northing: 0.000000
  Central_Meridian: -74.000000
  Standard_Parallel_1: 40.666667
  Standard_Parallel_2: 41.033333
  Latitude_Of_Origin: 40.166667
  Linear Unit: Meter
*/

