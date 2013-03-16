/** @requires state-names */

var SHOWING_CIRCLES = false;
var SELECT_MARCH_SIX = false;
var selectedState = "";
var selectedStateFips = "";
var symbolType = 'circles'; // "shapes";  // or 'circles'

var noCountyStates = 'ME,ND,WY,AK';
var noCountyFipsIndex = Utils.arrayToIndex('02,23,38,56'.split(','));

var colorTable = {
  "Gingrich":0xEA9249,
  "Bachmann":0xD9C4A5,
  "Santorum":0xB96155,
  "Paul":0x7EAA7E,
  "Huntsman":0x7F7182,
  "Romney":0x8AB2BF,
  "Perry":0xA29B88,
  "Roemer":0xD3CFC5,
  "Others": 0xD2D0C5
};

var hatchOneColors = {
  "Gingrich":0xEEB585,
  "Bachmann":0xE3D5C1,
  "Santorum":0xCE958D,
  "Paul":0xA8C4A8,
  "Huntsman":0xA89FAA,
  "Romney":0xAFC9D2,
  "Perry":0xCDC9C0,
  "Roemer":0xD3CFC5,
  "Others": 0xAAAAAA
};

var hatchTwoColors = {
  "Gingrich":0xF3CEAF,
  "Bachmann":0xEDE4D7,
  "Santorum":0xDFBAB5,
  "Paul":0xC6D8C6,
  "Huntsman":0xC7C0C7,
  "Romney":0xCBDCE2,
  "Perry":0xD5D2CB,
  "Roemer":0xD3CFC5,
  "Others": 0xC8C8C8
};
var noVotesHatchCol = 0xe8e8e8; // 0xeaeaea; // county/state is voting, total is 0
var tieHatchCol = 0xdadada;


var otherCandColor = 0xD2D0C5;
var candColors; // ?? 

var noDataCol = 0xefefef; // 0xeaeaea; // 0xe1e1e1; // county/state not voting (i.e. future contest)
var noVotesCol = 0xdadada; // 0xeaeaea; // county/state is voting, total is 0

var countryOutlineCol = 0xbbbbbb; // 
var tieCol = 0xc1c1c1;


var NYT_JS_HOME = "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/primary_maps/";
var NYT_CSS_HOME = "http://graphics8.nytimes.com/packages/css/newsgraphics/projects/election_2012/primary_maps/";
var NYT_SWF_HOME = "http://graphics8.nytimes.com/packages/flash/newsgraphics/projects/election_2012/primary_maps/";
var webHome = NYT_JS_HOME;
var cssHome = NYT_CSS_HOME;
var flashHome = NYT_SWF_HOME;

var candidatesTable;
var stateVotesTable;
var countyVotesTable;
var calendarTable;


// Number of votes counted for each state that has votes or has an election today.
// Indexed by FIPS!!!
var stateVotesIndex = {};

var stateWinners = []; // array of candidate ids for winner/s of state election.

var map;

var stateGeoTable;


var countyShapeLyr;
var stateShapeLyr;
var countyCircleLyr;
var labelLyr;

var countyCircleStyler;
var countyShapeStyler;
var countyBackgroundStyler;
var stateShapeStyler;
var stateBackgroundStyler;
var labelStyler;


var maxCountyVotes = 0; // max votes in a county; updated by updateBubbleParams()
var stateSizePct; // 
var mapWidth;

var countyVotesMultiplierForCircles = 0;

// init map
var widthKm = 4650;
var heightKm = 2940; // 3000;


var $ns = this; // namespace

Opts.extendNamespace("nytg.map", { 
  JsonPLoader: JsonPLoader,
  create: create,
  init: create });

Opts.exportObject("nytg.trace", trace);
Opts.exportObject("nytg.tracing.enabled", false); // for production; overridden in local include


function initStateVoteData(obj, candTable, stateTable, countyTable) {
  __initVoteData(obj, candTable, stateTable, countyTable);
}

/**
 * Original function, for national data
 */
function initVoteData(obj) {
  if (!candidatesTable) {
    candidatesTable = new $ns.DataTable();
    stateVotesTable = new $ns.DataTable();
    countyVotesTable = new $ns.DataTable();
  }
  __initVoteData(obj, candidatesTable, stateVotesTable, countyVotesTable);

  // init Candidate colors
  candidatesTable.insertMappedValues('color', C.DOUBLE, function(rec) {
    var shortName = rec.getString('cand_shortname');
    var col = colorTable[shortName] | 0;
    if (col == 0) {
      col = otherCandColor;
    }
    return col;
  });
  candColors = candidatesTable.getFieldData('color');

  // init states with votes
  stateVotesIndex = {};
  var stateSet = stateVotesTable.getRecordSet();
  while (stateSet.hasNext()) {
    var rec = stateSet.nextRecord;
    var votes = rec.getInteger('total_votes');
    stateVotesIndex[ rec.getString('location_fips') ] = votes;
  }
}

function __initVoteData(obj, candidatesTable, stateVotesTable, countyVotesTable) {
  candidatesTable.populate(obj.candidates.data, obj.candidates.schema);
  stateVotesTable.populate(obj.states.data, obj.states.schema);
  procPctReporting(stateVotesTable);

  //trace(">>> __initVoteData() counties?", obj.counties);

  if (obj.counties) {
    countyVotesTable.populate(obj.counties.data, obj.counties.schema);

    // convert string-based pct to a number
    procPctReporting(countyVotesTable);
    
    /*
    if (maxCountyVotes == 0 || isNaN(maxCountyVotes)) {
      countyVotesMultiplierForCircles = 0;
    }
    else {
      var estimatedMaxMargin = maxCountyVotes / 2;  
      var MAX_BUBBLE = 50; // pixel diameter of maximum bubble.... (TODO: vary according to map dimensions)
      countyVotesMultiplierForCircles = MAX_BUBBLE * MAX_BUBBLE / estimatedMaxMargin;
    }
    */
  }


  // init state winner/s
  /*
  if (stateVotesTable.fieldExists('winners')) {
    var stateRec = stateVotesTable.getMatchingRecord('location_fips', stateFIPS);
    stateWinners = stateRec.getString('winners').split(',');
  }
  else {
    trace("[StateMap.initVoteData()] State table is missing 'winners' field.");
  }*/
   /* */

  // voteFields = candidatesTable.getFieldData('votes_field');
  // 
};


function getStateHatchColor(rec) {
  return getHatchColor(rec, true);
};


function getHatchColor(rec, isState) {
  isState = isState === true;
  //if (!isState && SHOWING_CIRCLES) {
  //  return undefined;
  //}
  var obj = getShapeData(rec, candidatesTable);
  if (isNaN(obj.totalVotes)) {
    return undefined;
  }

  if (isState && SELECT_MARCH_SIX) {
    var st = rec.get('STATE');
    var cal = calendarTable.getIndexedRecord(st);
    var mar6 = cal.get('mar6');
    if (!mar6) {
      return undefined;
    }
  }

  var reporting = rec.get('pct_reporting_number');
  // at state level, no hashes if the state is called (i.e. winners are present)
  var hatched = reporting < 100;
  if (isState) {
    hatched = !rec.get('winners');
  }
  if (hatched) {
    if (obj.leaderName || obj.winnerName) {
      var name = obj.winnerName || obj.leaderName;
      return hatchTwoColors[name];
    }
    else if (obj.haveTie && obj.totalVotes > 0) {
      return tieHatchCol;
    }
    else {
      return noVotesHatchCol;
    }
  }
  return undefined;
}


function getStateShapeColor(rec) {
  return getShapeColor(rec, true);
};

function getShapeColor(rec, isState) {
  isState = isState === true;
  //if (!isState && SHOWING_CIRCLES) {
  //  return noDataCol;
 // }
  var obj = getShapeData(rec, candidatesTable);

  //isState && trace("getShapeColor() votes:", obj.totalVotes, "isState:", isState);

  if (isNaN(obj.totalVotes)) {
    return noDataCol;
  }

  if (isState && SELECT_MARCH_SIX) {
    //trace(">>> getShapeColor() select march siz");
    var st = rec.get('STATE');
    var cal = calendarTable.getIndexedRecord(st);
    var mar6 = cal.get('mar6');
    if (!mar6) {
      return noDataCol;
    }
  }

  // pct_reporting_number
  var reporting = rec.get('pct_reporting_number');

  var hatched = reporting < 100;
  if (isState) {
    hatched = !rec.get('winners');
  }

  if (!USE_HATCHING) {
    hatched = false;
  }

  var col = noVotesCol;
  if (obj.totalVotes > 0 || obj.winnerName) {
    if (obj.haveTie && obj.totalVotes > 0) {
      col = tieCol;
    }
    else if (obj.leaderName || obj.winnerName) {
      var name = obj.winnerName || obj.leaderName;
      col = hatched ? hatchOneColors[name] : colorTable[name];
    }
    //else if (obj.maxId != -1) {
    //  col = candColors[obj.maxId];
    //}
    else {
      trace("[getShapeColor()] Have votes but no leader; rec:", rec);
    }
  }
  return col;
}




/**
 *
 *
 *
 */
function getShapeData(rec, candidatesTable, forPopup) {
  // Three tables are available:
  // candidatesTable  // fields: cand_id, cand_shortname, cand_longname, votes_field
  // stateVotesTable  // fields: location_name, location_fips, pct_reporting, <votes fields...>, total_votes
  // countyVotesTable // fields: 

  var forceList = []; // opts['requiredCandidates'] || []; // todo: make sure these are lower case

  var voteFields = candidatesTable.getFieldData('votes_field');
  var candIds = candidatesTable.getFieldData('cand_id');
  var numCands = candidatesTable.size();

  var candShortNames = candidatesTable.getFieldData('cand_shortname');
  if (forPopup) {
    var candLongNames = candidatesTable.getFieldData('cand_longname');
  }

  var totalVotes = rec.getNumber('total_votes');
  var maxVotes = 0;
  var secondVotes = 0;
  var leaderId = "";
  var maxId = -1;
  var leaderName; // name
  var sizeOfLead = 0;
  var haveTie = false;
  var candArr = [];

  for (var i=0, len = numCands; i<len; i++) {
    var candId = candIds[i];
    var votes = rec.getNumber(voteFields[i]);

    // test
    if (votes == 0) {
      continue;
    }

    var candShortName = candShortNames[i];
    if (forPopup) {
      var pctReportingDecimals = 1;
      if (candShortName == 'Other') {
        // AP data feed may include an 'Other' candidate; exclude it
        continue;
      }
      var candObj = {
        shortName: candShortName,
        slugName: candShortName.toLowerCase(),
        longName: candLongNames[i],
        candidateId : candId
      };
      var auxRank = Utils.indexOf(candShortName.toLowerCase(), forceList);
      candObj.auxRank = auxRank == -1 ? numCands : auxRank;

      candObj.votes = votes;
      candObj.voteStr = isNaN(votes) ? "-" : TextUtils.formatNumber(votes);

      candObj.votePct = totalVotes > 0 ? votes / totalVotes * 100 : 0;
      candObj.votePctStr = TextUtils.formatNumber(candObj.votePct, pctReportingDecimals) + "%";

      candObj.winner = Utils.contains(stateWinners, candId);

      candArr.push(candObj);
    }

    var oldMaxVotes = maxVotes;
    if (votes > maxVotes) {

      haveTie = false;
      if (maxVotes > secondVotes) {
        secondVotes = maxVotes;
      }
      maxVotes = votes;
      leaderId = candId;
      maxId = i;
      leaderName = candShortName;
    }
    else if (votes == maxVotes && votes > 0) {
      maxVotes = votes;
      haveTie = true;
      leaderId = "";
      maxId = -1;
      leaderName = "";
      secondVotes = votes;
    }
    else if (votes > secondVotes) {
      secondVotes = votes;
    }
  }

  sizeOfLead = maxVotes - secondVotes;

  // Sort candidates according to multiple criteria
  //
  Utils.sortOn(candArr, 'votes', false, 'auxRank', true, 'shortName', true);


  // Thin list if relevant
  // TODO: Handle edge cases: including other category and candidateListSize == candArr.length
  //    
  if (forPopup && candidateListSize && candidateListSize < candArr.length) {
    //trace("[getShapeData()] opts:", opts);
    //var maxSize = opts.candidateListSize || 
    
    var includeOthers = true; // opts.includeOthersCategory !== false;
    var candsInList = candidateListSize;
    if (includeOthers) {
      //candsInList--;
    }

    var otherVotes = totalVotes;
    var requiredRemaining = forceList.length;
    var slotsRemaining = candsInList;
    var newList = [];
    for (var j=0, len=candArr.length; j<len; j++) {
      if (slotsRemaining == 0) {
        break;
      }
      var candObj = candArr[j];
      if (requiredRemaining == slotsRemaining) {
        if (!Utils.contains(forceList, candObj.shortName.toLowerCase())) {
          //continue;
        }
        else {
          //requiredRemaining--;
        }
      }
      
      otherVotes -= candObj.votes;
      newList.push(candObj);
      slotsRemaining --;
    }

    if (includeOthers /* && otherVotes > 0*/) {
      //trace("[Adding other data]; candidates in list:", candArr.length);
      var otherPct = totalVotes > 0 ? otherVotes / totalVotes * 100 : 0;
      var others = {
        votes : otherVotes,
        voteStr : isNaN(otherVotes) ? "-" : TextUtils.formatNumber(otherVotes),
        shortName : "Others",
        slugName : "others",
        longName : "Other candidates",
        votePct : otherPct,
        votePctStr : TextUtils.formatNumber(otherPct, pctReportingDecimals) + "%"
      };


      newList.push(others);
    }

    candArr = newList; 
  }


  var obj = {
    totalVotes : totalVotes,
    haveTie : haveTie,
    leaderId : leaderId,
    maxId : maxId,
    leaderName : leaderName,
    sizeOfLead : sizeOfLead
  }

  var winners = rec.get('winners');
  if (winners) {
    var candRec = candidatesTable.getMatchingRecord('cand_id', winners);
    if (!candRec.isNull()) {
      obj.winnerName = candRec.get('cand_shortname');
    }
  }

  if (forPopup) {
    obj.candidates = candArr;
  }

  return obj;
}




function getPopupData(rec, candidatesTable) {
  var locationName = rec.getString('location_name');

  var data = getShapeData(rec, candidatesTable, true);
  var fips = rec.getString('FIPS');
  var stFips = fips.substr(0, 2);
  var st = StateFips.getState(stFips);
  data.state = st;
  var geography = fips.length == 2 ? "state" : "county";

  data.displayName = geography == 'state' ? rec.getString('STATE_NAME') : CountyNames.adjustName(st, rec.getString('NAME'));
  data.geography = geography;

  var upcoming = stateIsUpcoming(st);
  data.upcoming = upcoming;

  if (upcoming) {
    data.upcomingNote = getUpcomingNote(st);
  }
  else {
    data.countyShortName = locationName;
    
    if (locationName) {
      data.countyLongName = geography == 'county' ? CountyNames.adjustName(st, data.countyShortName) : data.countyShortName;
      data.totalVotesStr = $ns.TextUtils.formatNumber(data.totalVotes);
      data.reportingPctStr = rec.getString('pct_reporting') + "%";
    }
    else {
      data.countyLongName = "";
      data.totalVotesStr = "";
      data.reportingPctStr = "";
    }
  }

  return data;
}


function getDivHTML(text, cl) {
  return '<div class="' + cl + '">' + text + '</div>';
}

function getTD(text, cl) {
  return '<td class="' + cl + '">' + text + '</td>';
}

var linkToStatePage = false;

function popupCallback(rec) {
  var data = getPopupData(rec, candidatesTable);
  var totalVotes = data.totalVotes;
  var title = data.displayName;

  var haveCountyData = noCountyStates.indexOf(data.state) == -1;

  var subtitle = "";
  var showSubtitle = true;
  if (data.geography == 'county' && !data.countyShortName) {
    title = "No Polling Places";
    showSubtitle = false;
    //subtitle = "Residents vote nearby.";
  }

  var html = "";
  html += getDivHTML(title, 'nytg-popup-title');
  if (!showSubtitle) {

  }
  else if (data.upcomingNote) {
    html += getDivHTML(data.upcomingNote, 'nytg-popup-subtitle');
  }
  else if (totalVotes == 0 || isNaN(totalVotes)) {
    html += getDivHTML(subtitle || 'No votes have been counted.', 'nytg-popup-subtitle');
  }
  else {
    //var html = '<div class="popupHead">FIPS: ' + fips + '</div>';
    //html += '<div class="popupBody">Some County</div><div>Some information</div>';
    var cands = data.candidates;
    //trace(">>> cands:", cands);
    var maxList = 10;
    html += "<table cellpadding=\"0\" cellspacing=\"0\"><tbody>";
    for (var i=0, len=cands.length; i<len && i < maxList; i++) {
      var cand = cands[i];
      var secondClass = i > 0 ? " nytg-popup-lower-row" : "";
      html += "<tr>" + getTD(cand.shortName, 'nytg-popup-candidate' + secondClass) + getTD(cand.voteStr, 'nytg-popup-vote' + secondClass) + getTD(cand.votePctStr, 'nytg-popup-votepct' + secondClass) + "</tr>";
    }
    html += "</tbody></table>";
    if (linkToStatePage) {
      html += getDivHTML("Click for details", 'nytg-popup-subtitle');
    }
    else {
      html += getDivHTML(data.reportingPctStr + " reporting", 'nytg-popup-subtitle');
      if (!haveCountyData) {
        html += '<div style="color:#888; font-size:11px;">County data not available</div>';
      }
    }
  }

  return html;    

};


function stateIsUpcoming(st) {
  //trace("index:", stateVotesIndex);
  var fips = StateFips.getFips(st);
  //st = st.toLowerCase();
  return stateVotesIndex[fips] === undefined;
  //return "ia,sc,nh,fl".indexOf(st) == -1;
}

function getUpcomingNote(st) {
  st = st.toUpperCase();
  var rec = calendarTable && calendarTable.getMatchingRecord('state', st);
  if (!rec || rec.isNull()) {
    return "Upcoming contest";
  }

  var dateStr = rec.getString('date');
  var typeStr = rec.getString('type');

  var typeNote = typeStr == 'C' ? "Caucus" : "Primary";
  var niceDate = DateString.reformatDate(dateStr, "%Y-%m-%d", "%b %d");
  if (st == 'ME') {
    niceDate += "-11";
  }

  var note = typeNote + " will be held " + niceDate + ".";
  if (st == 'MO') {
    note = "Delegate selection begins with<br>caucuses on March 17.";
  }
  return note;
};


function procPctReporting(table) {
  var strArr = table.getFieldData('pct_reporting');
  var numArr = [];
  for (var i=0, len=strArr.length; i<len; i++) {
    var strVal = strArr[i];
    var val = strVal == '<1' ? 1 : parseInt(strVal);
    numArr.push(val);
  }
  table.insertFieldData('pct_reporting_number', 'integer', numArr);
};


function updateBubbleParams(fips, statePct) {
  var set = countyVoteDataSource.getMatchingRecordSet('STATE_FIPS', fips);
  var max = 0;
  while(set.hasNext()) {
    var votes = set.nextRecord.get('total_votes');
    if (votes > max) {
      max = votes;
    }  
  }
  // get maximum votes across counties.
  // var votesArr = countyVotesTable.getFieldData('total_votes');
  // maxCountyVotes = Math.max.apply(null, votesArr);
  maxCountyVotes = max;
  stateSizePct = statePct;
  mapWidth = map.getWidthInPixels();
}


function getCountyCircleSize(rec) {
  var obj = getShapeData(rec, candidatesTable);
  var sizeOfLead = obj.sizeOfLead || 0;
  var countyVotesMultiplierForCircles = getCircleDataMultiplier();
  var size = Math.sqrt(sizeOfLead * countyVotesMultiplierForCircles);
  return size;
}

function getCircleDataMultiplier() {
  if (maxCountyVotes <= 0) {
    return 0;
  }

  var maxCircle = mapWidth / 4 * stateSizePct;
  var estimatedMaxMargin = maxCountyVotes * 0.2;
  var multiplier = maxCircle * maxCircle / estimatedMaxMargin * Math.pow(maxCountyVotes, 0.1);
  return multiplier;
}


function SwappingKey(div) {
  // make img
  var img = Browser.createElement('img', "position:absolute; left:0px; bottom:0px;");
  var views = {};

  this.addView = function(name, url) {
    views[name] = url;
  };

  this.setView = function(name) {
    var url = views[name];
    if (!url) {
      trace("[SwappingKey.setView()] missing view:", name);
      return;
    }
    img.src = url;

    if (!img.parentNode) {
      div.appendChild(img);
    }
  };
}


