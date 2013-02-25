/* core */


var Olympics = {
  mapWidth: 940,
  mapHeight: 420,
  startYear: 1896, // 1936, // 1960,
  endYear: 2008,
  initialYear: 2008,
  //firstYear: 1896,
  skippedYears: [1916, 1940, 1944],
  years: [1896,1900,1904,1908,1912,1920,1924,1928,1932,1936,1948,1952,1956,1960,1964,1968,1972,1976,1980,1984,1988,1992,1996,2000,2004,2008,2012],
  cities: "Athens,Paris,St. Louis,London,Stockholm,Antwerp,Paris,Amsterdam,Los Angeles,Berlin,London,Helsinki,Melbourne,Rome,Tokyo,Mexico City,Munich,Montreal,Moscow,Los Angeles,Seoul,Barcelona,Atlanta,Sydney,Athens,Beijing,London".split(',')
};

Olympics.MEDALS_2012_FILE = "medals2012.js";
Olympics.MEDALS_2012_URL = "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/olympics_2012/medals_map/" + Olympics.MEDALS_2012_FILE;

if (Browser.inNode) {
  Olympics.startYear = 1996;
}

Olympics.getYears = function() {
  var startIdx = Utils.indexOf(this.years, this.startYear);
  var endIdx = Utils.indexOf(this.years, this.endYear);
  //return this.years;
  return this.years.slice(startIdx, endIdx + 1);
};

var continentData = [
  {name:"North America", lat:41.771519, lng:-104.084584, color:0x609894, link:0},  
  //{name:"South America", lat:-27.523989, lng:-65.125819, color:0xb38847, link:0.15},  
  {name:"South America", lat:-15.523989, lng:-65.125819, color:0xb38847, link:0.9},  
  {name:"Europe", lat:43.368190, lng:3.531021, color:0x558e65, link:0},
  //{name:"Africa", lat:-19.221301, lng:20.136396, color:0xa4655d, link:0.15},  
  {name:"Africa", lat:-5.221301, lng:20.136396, color:0xa4655d, link:0.15},  
  {name:"Asia", lat:38.258844, lng:91.986577, color:0xa7ab7a, link:0.1},   
  //{name:"Oceana", lat:-47.642040, lng:144.038042, color:0x7a8d98, link:0.1}  
  {name:"Oceana", lat:-27.642040, lng:144.038042, color:0x7a8d98, link:0.4},
  {name:"Middle East", lat:38.258844, lng:91.986577, color:0xa7ab7a, link:0}
];

var colorUpdate = [0x992381, 0xe33f26, 0xdb3393, 0xa5d8, 0xb3a463, 0x583bd1, 0xb3a463];
//Utils.forEach(continentData, function(obj, i) { obj.color = colorUpdate[i] || obj.color;});

var goldColor = "#efc763";
var silverColor = "#d0d0d0";
var bronzeColor = "#bf947f";

var labelThresholds = {
  "United States": 25,
  "Cuba": 20,
  "Canada": 25
};

var chineseLabels = {
  GDR: "&#19996;&#24503;", // dong de
  FRG: "&#35199;&#24503;"  // xi de
};

function getOriginalCountryCode(noc, yr) {
  if (noc == 'GER') {
    if (yr >= 1956 && yr <= 1964) {
      noc = 'EUA';
    }
  }
  else if (noc == 'RUS') {
    if (yr >= 1952 && yr <= 1988) {
      noc = 'URS';
    }
    else if (yr == 1992) {
      noc = 'EUN';
    }
  }

  return noc;
};

