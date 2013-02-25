var CountyNames = {};

/**
 * Index of county-level entities that shouldn't have "County" appended.
 */
CountyNames.skipIndex = {
  'MO': 'St. Louis County~St. Louis City',
  'NV': 'Carson City',
  'VA': 'Alexandria~Bedford City~Bristol~Buena Vista~Charlottesville~Chesapeake~Colonial Heights~Covington~Danville~Emporia~Fairfax City~Falls Church~Franklin~Fredericksburg~Galax~Hampton~Harrisonburg~Hopewell~Lexington~Lynchburg~Manassas~Manassas Park~Martinsville~Newport News~Norfolk~Norton~Petersburg~Poquoson~Portsmouth~Radford~Richmond City~Roanoke City~Salem~Staunton~Suffolk~Virginia Beach~Waynesboro~Williamsburg~Winchester'
};

/**
 * Replacements for irregular county names, indexed by state
 */
CountyNames.replaceIndex = {
  'NY': {
    'Richmond': 'Staten Island',
    'Kings': 'Brooklyn',
    'Queens': 'Queens',
    'New York': 'Manhattan',
    'Bronx': 'Bronx'
  },
  'MD': { 'Baltimore City': 'Baltimore'},
  'DC': { 'District of Columbia': 'Washington' }
};

/**
 * Converts county names as they appear in GIS tables to a nicer form.
 * @param {string} st State postal code (e.g. 'OR').
 * @param {string} county County name, minus "County".
 * @param {number=} yr Optional year (to handle changes in e.g. Miami).
 * @return {string} Corrected county name.
 */
CountyNames.adjustName = function(st, county, yr) {
  var name = '';
  st = st.toUpperCase();

  if (yr && yr < 1997 && county == 'Miami-Dade') {
    return 'Dade County';
  }

  var skipIndex = CountyNames.skipIndex;

  var stObj = this.replaceIndex[st];
  if (stObj && stObj[county]) {
    name = stObj[county];
  }
  else if (st == 'LA') {
    name = county + ' Parish';
  }
  else if (skipIndex[st] && skipIndex[st].indexOf(county) != -1) {
    name = county;
  }
  else if (st == 'AK') {
    name = county;
  }
  else {
    name = county + ' County';
  }

  return name;
};