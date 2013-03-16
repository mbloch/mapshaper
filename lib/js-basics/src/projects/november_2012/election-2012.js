/*  @requires map-core, data, html-popup */

var Election2012 = {
  jsDataUrl: "http://graphics8.nytimes.com//packages/js/newsgraphics/projects/election_2012/nov6_maps/data/",
  detailedStateShapeUrl: "",
  detailedHouseDistrictShapeUrl: "",
  detailedHouseDistrictMercatorShapeUrl: "",
  detailedCountyShapeUrl: "",
  simpleStateShapeUrl: "",

  NO_DATA_COL:0xe3e3e3,
  NO_ELECTION_COL: 0xf5f5f5,
  NO_VOTES_COL: 0xe3e3e3, // case where polls were open but nobody voted (do we need to distinguish this from no_data?)
  TIE_COL:0x999999, // 0xF4EAA4,
  DEM_WIN_COL:0x445E96,
  REP_WIN_COL:0xBA3A33,
  DEM_SWITCH_COL:0x082247,
  REP_SWITCH_COL:0x680303,
  IND_SWITCH_COL:0x044704,
  IND_WIN_COL:0x418741,
  DEM_LEAD_COL:0x9cbadb, //0x9cbadb, 0xe5a3a3, 0x99c199
  REP_LEAD_COL:0xe5a3a3,
  IND_LEAD_COL:0x99c199,
  DEM_LEAD_HASH_COL:0,
  REP_LEAD_HASH_COL:0,
  IND_LEAD_HASH_COL:0,
  DEM_COLORS:[0xc9e1f5, 0xa9c0de, 0x88a0c6, 0x667faf, 0x445e96],
  REP_COLORS:[0xfacece, 0xeaa9a8, 0xda8482, 0xca5e5b, 0xba3a33],
  IND_COLORS:[0xc6e5c6, 0x9ecc9e, 0x8cb58c, 0x67a067, 0x418741], // 0xbae2ba, 0x94c994, 0x6faf6f, 0x539653, 0x418741],

  SenateStates: "AZ,CA,CT,DE,FL,HI,IN,MA,MD,ME,MI,MN,MO,MS,MT,ND,NE,NJ,NM,NV,NY,OH,PA,RI,TN,TX,UT,VA,VT,WA,WI,WV,WY",
  GovernorStates: "WA,UT,MT,ND,MO,IN,WV,NC,DE,VT,NH",
  SingleDistrictStates: "MT,ND,SD,AK,WY,VT",
  NoLabelStates: 'DC,HI,VT,NH,MA,RI,CT,DE,MD,PR,NJ',

  STATE_WINNER_VIEW:"state_winner_view", // state or house districts
  STATE_WINNER_BUBBLE_VIEW:"state_winner_bubble_view", // hybrid: state shapes, bubble counties when zoomed
  COUNTY_MARGIN_VIEW:"county_margin_view",
  DISTRICT_WINNER_VIEW:"district_winner_view",
  COUNTY_MARGIN_BUBBLE_VIEW:"county_margin_bubble_view",
  //COUNTY_MARGIN_CHANGE_VIEW:"county_coxa_change_view",
  //COUNTY_COXA_CHANGE_VIEW: "county_coxa_change_view",
  COUNTY_MARGIN_CHANGE_VIEW:"county_margin_change_view",
  COUNTY_COXA_CHANGE_VIEW: "county_margin_change_view",


  COUNTY_VOTES_BUBBLE_VIEW:"county_votes_bubble_view",
  COUNTY_HOLLOW_BUBBLE_VIEW:"county_hollow_bubble_view",
  STATE_FORECAST_VIEW:"state_forecast_view",

  // side-by-side map
  SIDE_BY_SIDE_VIEW:"side_by_side_view",

  // Home Page map views (multiple races on one map)
  // ... these map to the above views + election_type
  PRESIDENT_VIEW:"president_view",
  PRESIDENT_BUBBLE_VIEW:"president_bubble_view",
  SENATE_VIEW:"senate_view",
  SENATE_BUBBLE_VIEW:"senate_bubble_view",
  HOUSE_VIEW:"house_view",
  GOVERNOR_VIEW:"governor_view",
  GOVERNOR_BUBBLE_VIEW:"governor_bubble_view",


  ViewLabels: {
    state_winner_view:"States",
    county_margin_view:"Counties",
    district_winner_view:"House",
    county_margin_change_view:"Change from '08",
    county_margin_bubble_view:"Size of lead",
    county_votes_bubble_view:"Size of lead",
    county_hollow_bubble_view:"Size of lead",
    state_forecast_view:"State forecast",
    county_margin_change_view:"Shift from 2008"
  },

  PartyNames: {
    DEM: "Democrat",
    REP: "Republican",
    IND: "Independent",
    "Ind.": "Independent",
    "Ind": "Independent",   
    OTH: "Other"
  },

  PartyAbbr: {
    DEM: "Dem.",
    REP: "Rep.",
    IND: "Ind.",
    "Ind.": "Ind.",
    "Ind": "Ind.",
    OTH: "Other"
  }
};

var E = Election2012;
E.USE_FLASH = (Browser.ie && Browser.ieVersion < 9);
E.USE_STAGING = Browser.getPageUrl().indexOf('stg') != -1;
E.ADVANCED_FEATURES = true; // E.USE_STAGING; // change when ready
E.EXPERIMENTAL_FEATURES = Browser.getPageUrl().indexOf('localhost') != -1;

Election2012.getPartyName = function(code) {
  return this.PartyNames[code] || this.PartyNames.OTH;
};

Election2012.getPartyAbbr = function(code) {
  return this.PartyAbbr[code] || this.PartyAbbr.OTH;
};

if (true) {
  Election2012.detailedCountyShapeUrl = "http://graphics8.nytimes.com//packages/js/newsgraphics/projects/election_2012/nov6_maps/data/counties_albers.utf16be.js";
  Election2012.detailedStateShapeUrl = "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/nov6_maps/data/states_albers.utf16be.js";
  Election2012.detailedHouseDistrictMercatorShapeUrl =  "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/house_ratings_map/district-shapes-utf16.js";
}
else {
  Election2012.detailedCountyShapeUrl = "http://localhost.nytimes.com/nytweb/2012_election/counties_albers.utf16be.js";
  Election2012.detailedStateShapeUrl = "http://localhost.nytimes.com/nytweb/2012_election/states_albers.utf16be.js";
  Election2012.detailedHouseDistrictMercatorShapeUrl =  "http://graphics8.nytimes.com/packages/js/newsgraphics/projects/election_2012/house_ratings_map/district-shapes-utf16.js";
}


var commonSchema = {
  //state_id:'string',
  //location_id:'string',
  //hatch_color:'double',
  max_votes:'integer',
  pct_reporting:'string',
  pct_reporting_num:'double',
  total_votes:'integer',
  //fill_color:'double',
  win_lead_color: 'double',
  //lead_pct_color: 'double',
  margin_pct_color: 'double',
  raw_idx:'integer',
  leading_party:'string',
  vote_margin:'integer',
  switch_party:"string"  // switched-to this party (for gains)
};

var stateSchema = commonSchema;

var houseSchema = Opts.copyAllParams({
  district:'integer'
  }, commonSchema);

var countySchema = Opts.copyAllParams({margin2012:'double'}, commonSchema);


function extendTable(table, schema) {
  for( var key in schema) {
    var type = schema[key];
    table.addField(key, type);
  }
}


/**
 *  process array of results objects from data feed (one per candidate)
 *  return object with properties:
    max_votes
    tie
    leading_party
 */
function __getBasicResultsData(results) {

  var maxVotes = 0;
  var nextVotes = 0;
  var voteMargin = 0;
  var maxResult = null;
  var totalVotes = 0;
  var winningParty = '';

  for (var i=0, len=results.length; i<len; i++) {
    var res = results[i];
    var votes = res.vote_count;
    if (votes > 0) {
      if (votes == maxVotes) {
        nextVotes = maxVotes;
        maxResult = null;
      }
      else if (votes > maxVotes) {
        if (totalVotes == 0) {
          totalVotes = votes / parseFloat(res.pct) * 100;
          // trace("total:", totalVotes);
          totalVotes = Math.round(totalVotes);
        }

        maxResult = res;
        nextVotes = maxVotes;
        maxVotes = votes;
      }
      else if (votes > nextVotes) {
        nextVotes = votes;
      }
    }

    if (res.winner) {
      winningParty = res.party_id;
    }
  }

  var obj = {
    max_votes: maxVotes,
    vote_margin: maxVotes - nextVotes,
    total_votes: totalVotes,
    winning_party: winningParty,
    leading_party: (maxResult ? maxResult.party_id : "")
  };

  return obj;
}


/**
 *  (For popups)
 */
function __getDetailedResultsData(results) {


}

function __getWinLeadColor(maxVotes, leadingParty, won) {
  var col = Election2012.NO_DATA_COL;
  if (maxVotes > 0 || won) {
    if (!leadingParty) {
      if (!won) {
        col = Election2012.TIE_COL;
      }
      else {
        trace("[__getWinLeadColor()] flagged as 'won', no leading party");
      }
    }
    else if (leadingParty == 'DEM') {
      col = won ? Election2012.DEM_WIN_COL : Election2012.DEM_LEAD_COL;
    }
    else if (leadingParty == 'REP') {
      col = won ? Election2012.REP_WIN_COL : Election2012.REP_LEAD_COL;
    }
    else {
      col = won ? Election2012.IND_WIN_COL : Election2012.IND_LEAD_COL;
    }
  }
  return col;
}

//var margins = [10, 20, 30, 40];
var marginBreaks = [5, 10, 15, 20]; // TODO: find a home for this, make configurable
var leadBreaks = [40, 50, 60, 70]; // TODO: find a home for this, make configurable
E.getLeadPctColor = __getLeadPctColor;

function __getLeadPctColor(maxVotes, totalVotes, party) {
  var col = Election2012.NO_DATA_COL;

  if (totalVotes > 0 && maxVotes > 0) {
    if (!party) {
      col = Election2012.TIE_COL;
    }
    else {
      var cols;
      if (party == 'DEM') {
        cols = Election2012.DEM_COLORS;
      }
      else if (party == 'REP') {
        cols = Election2012.REP_COLORS;
      }
      else {
        cols = Election2012.IND_COLORS;
      }

      var pct = maxVotes / totalVotes * 100;
      var classId = Utils.getClassId(pct, leadBreaks);
      col = cols[classId];
    }
  }
  return col; 

}

function __getMarginPctColor(margin, totalVotes, party) {
  var col = Election2012.NO_DATA_COL;

  if (totalVotes > 0) {
    if (margin == 0) {
      col = Election2012.TIE_COL;
    }
    else {
      var cols;
      if (party == 'DEM') {
        cols = Election2012.DEM_COLORS;
      }
      else if (party == 'REP') {
        cols = Election2012.REP_COLORS;
      }
      else {
        cols = Election2012.IND_COLORS;
      }
      var marginPct = 100 * margin / totalVotes;
      var classId = Utils.getClassId(marginPct, marginBreaks);
      col = cols[classId];
    }
  }
  return col;

}

/**
 *  @param raw Array of objects, one per location (e.g. state, house district)
 *
 */
function __importCommonData(raw, dest, getId, geoKey) {
  trace('++importCommonData() indexing on field:', geoKey, "got field?", dest.fieldExists(geoKey))
  dest.indexOnField(geoKey);

  //dest.initField('win_lead_color', Election2012.NO_ELECTION_COL);
  //dest.initField('margin_pct_color', Election2012.NO_ELECTION_COL);


  for (var i=0, len=raw.length; i<len; i++) {
    var rawObj = raw[i];

    var called = !! rawObj.called;
    var locationId = getId(rawObj);
    var destRec = dest.getIndexedRecord(locationId);
    if (destRec.isNull()) {
      trace("[__importCommonData()] unmatched data record; id:", locationId);
      //trace("      obj:", rawObj);
      continue;
    }

    if (rawObj.switched_to_party) {
      destRec.set('switch_party', rawObj.switched_to_party);
    }

    destRec.set('raw_idx', i);
    var res = __getBasicResultsData(rawObj.results);
    destRec.set('max_votes', res.max_votes);
    destRec.set('vote_margin', res.vote_margin);
    destRec.set('total_votes', res.total_votes);

    if (called != !!res.winning_party) {
      trace("[__importCommonData()] called flag and winning_party inconsistency; called:", called, "res:", res, "raw:", rawObj);
    }

    var winLeadCol = __getWinLeadColor(res.max_votes, res.winning_party || res.leading_party, called);
   //trace("__winLeadCol__ party:", res.winning_party, res.leading_party, called);
    //var marginPctCol = __getMarginPctColor(res.vote_margin, res.total_votes, res.leading_party);
    var marginPctCol = __getLeadPctColor(res.max_votes, res.total_votes, res.leading_party);
    //destRec.set('fill_color', winLeadCol);
    destRec.set('win_lead_color', winLeadCol);
    destRec.set('margin_pct_color', marginPctCol);
    destRec.set('pct_reporting', rawObj.pct_report);
    destRec.set('pct_reporting_num', __getReportingNumber(rawObj.pct_report));
    //destRec.set('hatch_color', __getHatchColor(res));
  }
}

function __getReportingNumber(pctStr) {
  return parseFloat(pctStr) || 0;  // converts "<1" to 0
}

function __importStateData(raw, dest, geoKey) {
  extendTable(dest, stateSchema);
  __importCommonData(raw, dest, getStateLocationId, geoKey);
}

function __importHouseData(raw, dest, geoKey) {
  extendTable(dest, houseSchema);
  __importCommonData(raw, dest, getHouseLocationId, geoKey);
}

function getHouseLocationId(obj) {
  //return obj.state_id + obj.district
  return obj.state_id.toUpperCase() + Utils.leftPad(obj.seat_number, 2, '0');
}

function getStateLocationId(obj) {
  return obj.state_id.toUpperCase();
}

// VOTE DATA IMPORT FUNCTIONS
// Receive: dest table -- i.e. geographic table. Assumes: has key 'location_id'

Election2012.importHouseData = function(raw, dest, geoKey) {
  __importHouseData(raw, dest, geoKey);

};


Election2012.importGovernorData = function(raw, dest, geoKey) {
  __importStateData(raw, dest, geoKey);

};


Election2012.importSenateData = function(raw, dest, geoKey) {
  __importStateData(raw, dest, geoKey);

};

Election2012.importPresidentData = function(raw, dest, geoKey) {
  __importStateData(raw, dest, geoKey);

};

/*
Election2012.getPopupDataFunction = function(rawArr) {
  var func = function(rec) {
    var rawId = rec.get(raw_idx);
    var rawObj = rawArr[rawId];

  }
  return func;
}
*/


Election2012.getHatchColor = function(rec) {
  return rec.get('hatch_color');
};


Election2012.getCandidateShortName = function(full, last) {
  var name = last;
  if (full == "Tom Smith") {
    name = "T. Smith";
  }
  else if (full == 'Rayburn Smith') {
    name = "R. Smith";
  }
  return name;
}

Election2012.getCandidateData = function(obj, raw) {
  var arr = [];
  var rawObj = raw[obj.raw_idx];
  var tot = obj.total_votes;
  var results = rawObj.results;

  obj.called = rawObj.called;  // KLUDGE: modifying obj to add called data

  // trace("[getCandidateData()] raw obj:", rawObj);

  var pollStr = rawObj.polls_reporting === false && rawObj.poll_closing_display || "";
  obj.pollClosingStr = pollStr;

  for (var i=0; i < results.length; i++) {
    var rawCand = results[i];
    var cand = {
      cand_longname: rawCand.name,
      cand_shortname: this.getCandidateShortName(rawCand.name, rawCand.last_name),
      votes: rawCand.vote_count,
      vote_pct: parseFloat(rawCand.pct),
      party: rawCand.party_id,
      winner: rawCand.winner,
      incumbent: rawCand.incumbent
    };
    arr.push(cand);
  }

  return arr;
};


//// COUNTIES ////
////
Election2012.getCountyCandidateData = function(st, obj, raw) {
  var arr = [];
  var rawCands = raw[st].candidates;
  var rawVotes = raw[st].county_votes;
  //var candIndex = Utils.arrayToIndex(rawCands, 'votes_field');
  //var voteFields = Utils.getKeys(candIndex);
  var idx = obj.raw_idx;

  var tot = rawVotes.total_votes[idx];

  for (var i=0; i<rawCands.length; i++) {
    var rawCand = rawCands[i];
    var f = rawCand.votes_field;
    var votes = rawVotes[f][idx];
    var pct = tot > 0 ? 100.0 * votes / tot : 0;

    var cand = Opts.copyAllParams({}, rawCand);
    cand.vote_pct = pct;
    cand.votes = votes;
    arr.push(cand);
  }

  return arr;
};

Election2012.getCountyDataImporterByType = function(type) {
  if (type == 'president') {
    return this.importPresidentCountyData;
  }
  else if (type == 'senate') {
    return this.importSenateCountyData;
  }
  else if (type == 'governor') {
    return this.importSenateCountyData;
  }

  trace("[Election2012.getCountyDataImporterByType()] missing importer for type:", type);
}

Election2012.importPresidentCountyData = function(raw, dest, geoKey) {
  extendTable(dest, countySchema);
  return __importCountyData(raw, dest, geoKey);

};

Election2012.importSenateCountyData = function(raw, dest, geoKey) {
  extendTable(dest, countySchema);
  return __importCountyData(raw, dest, geoKey);
};

Election2012.importGovernorCountyData = function(raw, dest, geoKey) {
  extendTable(dest, countySchema);
  return __importCountyData(raw, dest, geoKey);
};

/**
 * return candidates table? *NO*
 */
function __importCountyData(raw, dest, geoKey) {

  //dest.initField('win_lead_color', Election2012.NO_ELECTION_COL);
  //dest.initField('margin_pct_color', Election2012.NO_ELECTION_COL);


  //trace("[__importCountyData()] geoKey:", geoKey);
  var unmatchedCount = 0;
  var matchedCount = 0;

  // Validate: county fips field exists in dest
  //
  var fCountyFips = geoKey;
  if (dest.fieldExists(fCountyFips) == false) {
    trace("[__importCountyData()] Missing county fips field from geo table:", fCountyFips);
    return null;
  }
  dest.indexOnField(fCountyFips);

  var rawArr = raw;
  var maxMargin = 0;
  var maxMarginReporting = 0;

  Utils.forEach(rawArr, function(obj, st) {
    st = st.toUpperCase();

    var candIndex = Utils.arrayToIndex(obj.candidates, 'votes_field');  // {"votesField":{candData}}
    // var partyIndex = Utils.arrayToIndex(obj.candidates, 'party');
    var votesObj = obj.county_votes;
    var voteFieldKeys = Utils.getKeys(candIndex);
    var voteSectionKeys = Utils.getKeys(votesObj);
    // TODO: validate vote fields
    var fipsArr = votesObj.location_fips;
    var totalArr = votesObj.total_votes;
    var reportingArr = votesObj.pct_reporting;

    // check arrays
    if (!fipsArr || !totalArr || !reportingArr) {
      trace("[_importCountyData()] missing pct_reporting or total_votes or location_fips from vote keys:", voteSectionKeys);
      return;
    }

    var countyCount = fipsArr.length;
    var candCount = voteFieldKeys.length;
    var voteArrays = Utils.map(voteFieldKeys, function(key) {return votesObj[key];});
    // TODO: validate arr lengths
    for (var i=0; i<countyCount; i++) {
      var fips = fipsArr[i];
      var destRec = dest.getIndexedRecord(fips);
      var maxVotes = 0;
      var nextVotes = 0;
      var maxKey = null;
      if (destRec.isNull()) {
        //trace("[__importCountyData()] Unmatched fips in results data; st:", st, "fips:", fips);
        unmatchedCount++;
        continue;
      }
      matchedCount ++;
      var tot = totalArr[i];
      var dem = 0;
      var rep = 0;
      if (tot > 0) {
        // trace("tot:", tot);
        // get max
        for (var j=0; j<candCount; j++) {
          var candField = voteFieldKeys[j];


          var voteArr = voteArrays[j];
          var votes = voteArr[i];

          var candObj = candIndex[candField];
          var party = candObj.party;
          if (party == 'DEM') {
            dem = votes;
          } 
          else if (party == 'REP') {
            rep = votes;
          }

          if (votes == maxVotes) {
            nextVotes = maxVotes;
            maxKey = null;
          }
          else if (votes > maxVotes) {
            nextVotes = maxVotes;
            maxVotes = votes;
            maxKey = candField;
          }
          else if (votes > nextVotes) {
            nextVotes = votes;
          }

        }
      }

      var margPct = tot == 0 ? 0 : (dem / tot - rep / tot) * 100;
      destRec.set('margin2012', margPct);

      var voteMargin = maxVotes - nextVotes;
      var haveTie = voteMargin > 0;
      destRec.set('raw_idx', i);
      destRec.set('total_votes', tot);
      destRec.set('max_votes', maxVotes);
      destRec.set('vote_margin', voteMargin);
      destRec.set('pct_reporting', reportingArr[i]);
      var reporting = __getReportingNumber(reportingArr[i]);
      destRec.set('pct_reporting_num', reporting);


      if (voteMargin > maxMargin) {
        maxMargin = voteMargin;
        if (voteMargin > maxMarginReporting){
          maxMarginReporting = voteMargin;

        }
      }

      var leadParty = "";
      if (voteMargin > 0) {
        //trace(candIndex);
        var candObj = candIndex[maxKey];
        leadParty = candObj.party;
      }
      destRec.set('leading_party', leadParty);

      var partyCol = leadParty ? __getWinLeadColor(maxVotes, leadParty, true) : E.NO_DATA_COL;  // used for bubble views.... 
      destRec.set('win_lead_color', partyCol);

      //var marginCol = __getMarginPctColor(voteMargin, tot, leadParty);
      var marginCol = __getLeadPctColor(maxVotes, tot, leadParty);

      destRec.set('margin_pct_color', marginCol); // this may be removed
      // var marginPctCol = __getMarginPctColor(res.vote_margin, res.total_votes, res.leading_party);

      // TODO: add remaining fields
    }

  }); // end Utils.forEach

  var obj = {};

  obj.maxMargin = A._maxMargin = maxMargin;
  obj.maxMarginReporting = A._maxMarginReporting = maxMarginReporting;
  //raw._numShapes = dest.size();
  var refMargin = 0;
  if (maxMargin > 0) {
    var margins = dest.getFieldData('vote_margin').concat();
    margins = Utils.filter(margins, function(el) { return !!el})
    Utils.sortNumbers(margins);
    refMargin = margins[Math.round(margins.length * 0.7)] || 0;

  }
  obj.referenceMargin = A._referenceMargin = refMargin;
  /*  */

  if (unmatchedCount > 0) {
    trace("[__importCountyData()] Unmatched counties in results data --", unmatchedCount, "matched counties --", matchedCount);
  }

  return obj;
}