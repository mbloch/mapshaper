/* @requires state-names */


var Congress = {};

Congress.getHouseDistrictName = function(st, dist) {
  var name = "";
  if ("MT,VT,WY,ND,SD,AK".indexOf(st) != -1) {
    name = StateNames.getName(st);
  }
  else if (dist > 0) {
    name = StateNames.getAbbrev(st) + " " + dist;
  }

  return name;
};