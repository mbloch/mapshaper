
var _partyAbbrev = {
  'AIP':"A.I.P.",
  'AKI':"Ak. I.",
  'AMC':"Am. C.",
  'BEP':"B.E.P.",
  'CON':"Con.",
  'CST':"Const.",
  'CTL':"C.F.L.",
  'DCG':"D.C.G.",
  'DEM':"Dem.",
  'FEP':"F.E.P",
  'FRE':"Frdm.",
  'GOP':"Rep.",
  'GRN':"Green",
  'GRP':"G.R.P.",
  'IAP':"I.A.P.",
  'IGR':"I.Gr.",
  'IND':"Ind.",
  'INP':"Inp.",
  'INR':"I.R.P.",
  'IPD':"I.P.D.",
  'LAB':"Labor",
  'LIB':"Lib.",
  'LUN':"L.U.",
  'MNT':"M.P.",
  'MOD':"Mod.",
  'NLP':"N.L.P.",
  'NP':"Ind.",
  'NPA':"Ind.",
  'NPD':"Ind.",
  'OTH':"Ind.",
  'PAG':"P.Gr.",
  'PEC':"Ind.",
  'PFP':"P.A.F",
  'PRG':"Prog.",
  'RP':"Ref.",
  'RTL':"R.T.L.",
  'SOC':"Soc.",
  'SWP':"S.W.P.",
  'TEA':"Tea",
  'UCZ':"U.C.",
  'UNA':"Ind.",
  'UND':"Und.",
  'UNR':"Ind.",
  'UST':"U.S.T.",
  'WF':"W.F.",
  'WTP':"W.T.P."

};



var E = {
  REP_CODE:"GOP",
  DEM_CODE:"Dem",
  TIE_CODE:"tie",

  SENATE:"senate",
  HOUSE:"house",
  GOVERNOR:"governor",


  Red1:"#EAC1C1",
  Red2:"#E0AAAA",
  Red3:"#D88B8B",
  Red4:"#CC7272",
  //Red5:"#BC3939; 

  Blue1:"#BBCBE1",
  Blue2:"#9AB5D3",
  Blue3:"#719ABF",
  Blue4:"#5F8BB2",
  //Blue5:"#446093; 

  Green1:"#BAE2BA",
  Green2:"#94C994",
  Green3:"#6FAF6F",
  Green4:"#499649",
  //Green5:"#237C23;

  SolidDemCol:"#3A5C8E",
  SolidRepCol:"#B43030",
  SolidThirdCol:"#499649",

  //TossupCol:Number= "#F2E99C; // from Ratings map
  NullCol:"#e3e3e3",
  NoVotesCol:"#d0d0d0", // NullCol;
  TieCol:"#aaaaaa",
  BackgroundShapeCol:"#dadada" // background color for bubble view
};


E.DemWinCol=E.SolidDemCol;
E.DemLeadCol=E.Blue1; // Blue2;
E.RepWinCol=E.SolidRepCol;
E.RepLeadCol=E.Red1; // Red2;
E.ThirdWinCol=E.Green4;
E.ThirdLeadCol=E.Green1; // Green2;

E.Dem4Colors = [ E.Blue1, E.Blue2, E.Blue3, E.Blue4 ];
E.Rep4Colors = [ E.Red1, E.Red2, E.Red3, E.Red4 ];
E.Third4Colors = [ E.Green1, E.Green2, E.Green3, E.Green4 ];

E.getVoteMargin = function( dem, rep, ind ) {
  return 0;
};

E.getPartyAbbrev = function( code ) {
  return _partyAbbrev[ code.toUpperCase() ] || "Other";
};

E.formatVotePercentForPopup = function( pct ) {

  var pctStr = "";
  if ( isNaN( pct ) ) {
    pctStr = "0%"; // "-";
  }
  else if ( pct > 0 && pct < 0.5 ) {
    pctStr = "<1%";
  }
  else {
    pctStr = TextUtils.formatNumber( pct ) + '%';
  }
  return pctStr;
};


E.getFourColorMarginColor = function( d, r, o, tot ) {

  var col = E.NullCol;

  if ( isNaN( tot ) ) {
    return col;
  }

  var dem = d << 0;
  var rep = r << 0;
  var third = o << 0;

  var others = tot - dem - rep - third;

  if ( tot <= 0 ) {
    col = E.NoVotesCol;
  }
  else {
    var max = dem > rep ? dem : rep;
    if ( third > max ) {
      max = third;
    }

    if ( others > max ) {
      col = E.TieCol; //  
    }
    else {

      var second = 0;
      if ( max == dem ) {
        second = rep > third ? rep : third;
      }
      else if ( max == rep ) {
        second = dem > third ? dem : third;
      }
      else {
        second = dem > rep ? dem : rep;
      }

      if ( max == 0 ) {
        col = E.NullCol;
      }
      else if ( max == second ) {
        col = E.TieCol;
      }
      else {
        if ( dem == max ) {
          var colors = E.Dem4Colors;
        }
        else if ( rep == max ) {
          colors = E.Rep4Colors;
        }
        else if ( third == max ) {
          colors = E.Third4Colors;
        }
        else {
          return E.NullCol;
        }

        var points = (max - second ) * 100.0 / tot;

        if ( points >=  15 ) {
          col = colors[3 ];
        }
        else if ( points >= 10 ) {
          col = colors[2];
        }
        else if ( points >= 5 ) {
          col = colors[1];
        }
        else {
          col = colors[0];
        }  
      }
    }
  }
  return col;
};



DateString.AM = "AM";
DateString.PM = "PM";

var _dateParser = new DateString( "%Y-%m-%d %H:%M ET" );
var _dateFormatter = new DateString( "%I %p ET" );
var _dateFormatterWithMinutes = new DateString( "%I:%M %p ET" );

E.formatPollClosingTime = function( src ) {
  var d = _dateParser.parseDate( src );
  var str = "";
  if ( d ) {
    if ( d.getUTCMinutes() == 0) {
      var dest = _dateFormatter.formatDate( d );
    }
    else {
      dest = _dateFormatterWithMinutes.formatDate( d );
    }

    if ( dest ) {
    //  str = "First polls close at " + dest;
      str = "Most polls close at " + dest;
    }
  }
  return str;
}



E.sortCandidates = function( a, b ) {
  var votesA = a['vote_count'];
  var votesB = b['vote_count'];

  if ( a['winner_flag'] ) {
    return -1;
  }

  if ( b['winner_flag'] ) {
    return 1;
  }

  if ( votesA > votesB ) {
    return -1;
  }

  if ( votesB > votesA ) {
    return 1;
  }

  var aParty = a['party'];
  var bParty = b['party'];

  if ( aParty == E.DEM_CODE ) {
    return -1;
  }

  if ( bParty == E.DEM_CODE) {
    return 1;
  }

  if ( aParty == E.REP_CODE ) {
    return -1;
  }

  if ( bParty == E.REP_CODE ) {
    return 1;
  }

  if ( aParty < bParty  ) {
    return 1;
  }

  if (bParty > aParty ) {
    return -1;
  }

  return 0;
};


var _lastNames = {
  "Frank Della Valle":"Della Valle",
  "Stephanie Herseth Sandlin":"Herseth Sandlin",
  "Debbie Wasserman Schultz":"Wass. Schultz",
  "Cathy McMorris Rodgers":"McMorris Rodgers",
  "Mary Bono Mack":"Bono Mack",
  "Sheila Jackson Lee":"Jackson Lee",
  "Laurel Lambert Schmidt":"Lambert Schmidt"
};

//var _lastExp = /^.* ((?:la|von|de|van|st.)? ?(?:[a-z\-\']+))(?: *(?:jr|jr.|ii|iii)?)$/i;
var _lastExp = / ((?:(?:la|von|de|van|st.) )?([a-z\-\']+))(?: (?:sr\.?|jr\.?|ii|iii))?$/i;


function getLastName( name ) {
  var last = name;
  if ( _lastNames[ name ] != undefined ) {
    last = _lastNames[ name ];
  }
  else {
    //last = name.replace( _lastExp, "$1" );
    var matches = _lastExp.exec( last );
    if ( matches ) {
      last = matches[1];
    }
  }

  return last;
}


function decorateCandidateObject( candObj, totalVotes ) {
  candObj['party_name'] = E.getPartyAbbrev( candObj['party'] );
  var votes = candObj['vote_count'];
  candObj['vote_percent'] = E.formatVotePercentForPopup( votes / totalVotes * 100 );
  candObj['votes'] = TextUtils.formatNumber( votes );
  var last = getLastName( candObj['display_name'] );
  //trace( "last: " + last + " full: " + candObj['display_name'] );
  candObj['last_name'] = last;
}


/** 
 * @constructor 
 */
function HouseDataSource( url ) {

  var _self = this;
  Waiter.call( this );

  // this.districtData; // internal data table

  // district table field name constants, used in the internal _districtData table. 
  //
  var PCT_REPORTING = "pct";
  var LEADER_VOTES = "leader_votes";
  var LEADER_PARTY = "leader_party";
  var WINNER_PARTY = "winner_party";
  var GAIN_FLAG = "gain_flag";
  var DEM_VOTES = "dem_votes";
  var REP_VOTES = "rep_votes";
  var THIRD_VOTES = "ind_votes";
  var TOTAL_VOTES = "tot_votes";
  var DISTRICT = "district";
  var MARGIN_POINTS = "margin_points";
  var VOTE_MARGIN = "vote_margin"; // in votes

  var loader = new MultiPartTabDataLoader( url, {nocache:true} );

  //var _houseSummaryTable = loader.requestTable( "house_summary" );
  var _houseCandidatesTable = loader.requestTable( "house_candidates_by_district" );
  var _houseResultsTable = loader.requestTable( "house_results_by_district" );

  _self.waitFor( loader );
  _self.startWaiting();

  this.getDistrictString = function( st, dist ) {
    var str = st + ( dist < 10 ? "0" + dist : dist );
    return str;
  };


  this.importDistrictData = function( districts ) {
    
    //trace( "[election2010.importDistrictData()] candidates: " + _houseCandidatesTable.size() );

    var distIndex = {};
    var distArr = districts.getFieldData( 'DISTRICT' );
    

    var len = distArr.length;
    for ( var i=0; i<len; i++ ) {
      var distStr = distArr[i];
      distIndex[ distStr ] = i;
    }

    // 
    var pctReporting = [];
    //var leaderColor = [];
    var leaderParty = [];
    var leaderMargin = [];
    var winnerParty = [];
    var gainFlags = [];

    var maxVotes = []; // ...


    var demVotes = [];
    var repVotes = [];
    var thirdVotes = [];
    var totVotes = [];
    var distArr = [];

    var leaderVotes = []; // optional
    
    // proc district data
    var voteTotal = 0;
    var srcStateArr = _houseResultsTable.getFieldData( 'state_id' );
    var srcDistArr = _houseResultsTable.getFieldData( 'seat_number' );
    var srcTotVotes = _houseResultsTable.getFieldData( 'total_votes' );
    var srcPctReporting = _houseResultsTable.getFieldData( 'pct_reporting' );


    var srcLen = _houseResultsTable.size();
    for ( var i=0; i<srcLen; i++ ) {
      var distStr = this.getDistrictString( srcStateArr[i], srcDistArr[i] );
      if ( distIndex[ distStr ] === undefined ) {
        trace( "[HouseDataSource.importDistrictData()] unmatched district string: " + distStr );
        continue;
      }
      var destId = distIndex[ distStr ];
      pctReporting[ destId ] = srcPctReporting[i];
      totVotes[ destId ] = srcTotVotes[i];
      // add poll time data ? 
    }

    srcStateArr = _houseCandidatesTable.getFieldData( 'state_id' );
    srcDistArr = _houseCandidatesTable.getFieldData( 'seat_number' );
    var srcVotesArr = _houseCandidatesTable.getFieldData( 'vote_count' );
    var srcPartyArr = _houseCandidatesTable.getFieldData( 'party' );
    var srcWinnerArr = _houseCandidatesTable.getFieldData( 'winner_flag' );
    var srcGainArr = _houseCandidatesTable.getFieldData( 'gain_flag' );
    // winner_flag
    // gain_flag   // used to show hatches...

    // CANDIDATES TABLE
    //
    srcLen = _houseCandidatesTable.size();
    for ( var j=0; j<srcLen; j++ ) {
      var distStr = this.getDistrictString( srcStateArr[j], srcDistArr[j] );
      if ( distIndex[ distStr ] === undefined ) {
        trace( "[HouseDataSource.importDistrictData()] unmatched district string: " + distStr );
        continue;
      }
      var destId = distIndex[ distStr ];
      var totalVotes = totVotes[ destId ];
      var party = srcPartyArr[ j ];
      var votes = srcVotesArr[j];

      var oldLeaderVotes = leaderVotes[ destId ] << 0;
      if ( votes > oldLeaderVotes ) {
        leaderParty[ destId ] = party;
        leaderVotes[ destId ] = votes;
      }
      else if ( votes == oldLeaderVotes && votes > 0 ) {
        leaderParty[ destId] = E.TIE_CODE;
        trace( "[HouseDataSource.importDistrictData()] multiple leaders in district (tie or error): " + distStr ); 
      }


      distArr[ destId ] = distStr;
      if ( party == E.REP_CODE ) {
        repVotes[ destId ] = votes;
      }
      else if ( party == E.DEM_CODE ) {
        demVotes[ destId ] = votes;
      }
      else {
        if ( ( thirdVotes[ destId ] << 0 ) < votes  ) {
          thirdVotes[ destId ] = votes;
        }
      }

      var isWinner = srcWinnerArr[j] == 1;
      var isGainer = srcGainArr[j] == 1;


      if ( isWinner ) {
        winnerParty[ destId ] = party;
        if ( isGainer ) {
          gainFlags[ destId ] = 1;
        }
      }
    }


    // CALCULATE VOTE MARGINS
    for ( var k=0; k< distArr.length; k++ ) {
      var dem = demVotes[k];
      var rep = repVotes[k];
      var ind = thirdVotes[k];
      var margin = E.getVoteMargin( dem, rep, ind );
      leaderMargin.push( margin );
    }
    

    // create new table
    //var fields = [ DISTRICT, LEADER_VOTES, LEADER_PARTY, WINNER_PARTY, TOTAL_VOTES, GAIN_FLAG , DEM_VOTES, REP_VOTES, THIRD_VOTES, VOTE_MARGIN ];
    var schema = {};
    schema[ DISTRICT ] = C.STRING;
    schema[ LEADER_VOTES ] = C.INTEGER;
    schema[ LEADER_PARTY ] = C.STRING;
    schema[ WINNER_PARTY ] = C.STRING;
    schema[ TOTAL_VOTES ] = C.INTEGER;
    schema[ GAIN_FLAG ] = C.INTEGER;
    schema[ DEM_VOTES ] = C.INTEGER;
    schema[ REP_VOTES ] = C.INTEGER;
    schema[ THIRD_VOTES ] = C.INTEGER;
    schema[ VOTE_MARGIN ] = C.INTEGER;

    var data = {};
    data[ DISTRICT ] = distArr;
    data[ LEADER_VOTES ] = leaderVotes;
    data[ LEADER_PARTY ] = leaderParty;
    data[ WINNER_PARTY ] = winnerParty;
    data[ TOTAL_VOTES ] = totVotes;
    data[ GAIN_FLAG ] = gainFlags;
    data[ DEM_VOTES ] = demVotes;
    data[ REP_VOTES ] = repVotes;
    data[ THIRD_VOTES ] = thirdVotes;
    data[ VOTE_MARGIN ] = leaderMargin;


    _self.districtData = new DataTable;
    _self.districtData.populate( data, schema ); //  /*fields:fields,*/ 
    _self.districtData.indexOnField( DISTRICT );
    // TODO: check on data anomalies
    //Trace.dataFields( _districtData, _districtData.fields );
    //Trace.dataFields( _districtData, _districtData.fields );
    
  };

  this.getDistrictData = function( st, dist ) {
    var candRecords = _houseCandidatesTable.getMatchingRecordSet( 'state_id', st, 'seat_number', dist );
    var distRecord = _houseResultsTable.getMatchingRecord( 'state_id', st, 'seat_number', dist );

    if ( distRecord.isNull() || candRecords.size() == 0 ) {
      //trace( "[HouseDataSource.getDistrictData()] missing data for st: " + st + " dist: " + dist );
      return {};
    }

    var obj = distRecord.getDataAsObject();
    var totalVotes = obj['total_votes'];
    var candArr = [];
    while( candRecords.hasNext() ) {
      var candRec = candRecords.nextRecord;
      var candObj =  candRec.getDataAsObject();
      decorateCandidateObject( candObj, totalVotes );

      candArr.push(candObj );
      //trace( candObj );
    }

    candArr.sort( E.sortCandidates );

    obj['candidates'] = candArr;
    obj['poll_close_note'] = E.formatPollClosingTime( obj['poll_close_time'] );
    obj['title'] = StateNames.getName( st ) + " " + dist;
    return obj;
  };


  /*
    public function getDistrictData( st:String, dist:int ):Object {
      var candRecords:RecordSet = _houseCandidatesTable.getMatchingRecordSet( 'state_id', st, 'seat_number', dist );
      var distRecord:Record = _houseResultsTable.getMatchingRecord( 'state_id', st, 'seat_number', dist );
      if ( distRecord.isNull || candRecords.size() == 0 ) {
        trace( "[HouseDataSource.getDistrictData()] missing data for st: " + st + " dist: " + dist );
        return {};
      }

      //RecordSort.sortOnFields( candRecords, 'winner_flag', RecordSort.DESCENDING, 'total_votes', RecordSort.DESCENDING );

      var obj:Object = distRecord.getDataAsObject();
      var candArr:Array = [];
      while( candRecords.hasNext ) {
        var candRec:Record = candRecords.nextRecord;
        candArr.push( candRec.getDataAsObject() );
      }

      candArr.sort( E.sortCandidates );
      
      obj.candidates = candArr;
      return obj;
    }

    */



  this.filterWinLeadStyle = function( s, rec ) {
    var fc = E.NullCol;

    var distStr = rec.getString( 'DISTRICT' );
  
    var dataRec = this.districtData.getIndexedRecord( distStr );
    //trace( dataRec.isNull() );

    if ( dataRec.isNull() ) {
      //trace( "[HouseDataSource.filterWinLeadStyle()] missing data for district: " + distStr );
    }
    else {
      //var gain = dataRec.getNumber( GAIN_FLAG );
      var winnerParty = dataRec.getString( WINNER_PARTY );
      var leaderParty = dataRec.getString( LEADER_PARTY );
      //trace( " winerParty: " + winnerParty );
      if ( winnerParty ) {
        if ( winnerParty == E.DEM_CODE ) {
          fc = E.DemWinCol;
          
        }
        else if ( winnerParty == E.REP_CODE ) {
          fc = E.RepWinCol;
          
        }
        else {
          fc = E.ThirdWinCol;
          
        }
      }
      else if ( leaderParty ) {
        if ( leaderParty == E.DEM_CODE ) {
          fc = E.DemLeadCol;
        }
        else if ( leaderParty == E.REP_CODE ) {
          fc = E.RepLeadCol;
        }
        else if ( leaderParty == E.TIE_CODE ) {
          fc = E.TieCol;
        }
        else {
          fc = E.ThirdLeadCol;
        }
      }
    }
    /* */

    s.fillColor = fc;

  };

}


/** 
 * @constructor 
 */
function DataSourceBase( url, type ) {

  var _self = this;
  Waiter.call( this );

  // this.districtData; // internal data table

  // district table field name constants, used in the internal _districtData table. 
  //
  /*
  var PCT_REPORTING = "pct";
  var LEADER_VOTES = "leader_votes";
  var LEADER_PARTY = "leader_party";
  var WINNER_PARTY = "winner_party";
  var GAIN_FLAG = "gain_flag";
  var DEM_VOTES = "dem_votes";
  var REP_VOTES = "rep_votes";
  var THIRD_VOTES = "ind_votes";
  var TOTAL_VOTES = "tot_votes";
  var DISTRICT = "district";
  var MARGIN_POINTS = "margin_points";
  var VOTE_MARGIN = "vote_margin"; // in votes
  */
  var CANDIDATE_DATA = "candidates"; // generated in here
  var STATE_DATA = "state_data";

  var loader = new MultiPartTabDataLoader( url, {nocache:true} );

  //var _houseSummaryTable = loader.requestTable( "house_summary" );
  var _candidatesTable; 
  var _stateResultsTable;
  var _countyResultsTable;

  if ( type == E.SENATE ) {
    _candidatesTable = loader.requestTable( "senate_candidates" );
    _stateResultsTable = loader.requestTable( "senate_results_by_state" );
    _countyResultsTable = loader.requestTable( "senate_results_by_county" );
  }
  else {
    _candidatesTable = loader.requestTable( "governor_candidates" );
    _stateResultsTable = loader.requestTable( "governor_results_by_state" );
    _countyResultsTable = loader.requestTable( "governor_results_by_county" );
  }

  _self.waitFor( loader );
  _self.startWaiting();

  this.addEventListener( 'ready', handlePreload, this );

  function handlePreload( evt ) {
    //_candidatesTable.indexOnField( 'state_id', true );
    _stateResultsTable.indexOnField( 'state_id' );
    _countyResultsTable.indexOnField( 'county_fips' );

    var candIndex = {};
    var candSet = _candidatesTable.getRecordSet();
    while( candSet.hasNext() ) {
      var candRec = candSet.nextRecord;
      var st = candRec.getString( 'state_id' );
      var stateRec = _stateResultsTable.getIndexedRecord( st );
      var candObj = candRec.getDataAsObject();
      decorateCandidateObject( candObj, stateRec.getNumber( 'total_votes' ) );
      if ( candIndex[ st ] == undefined ) {
        candIndex[ st ] = [];
      }
      candIndex[st ].push( candObj );
    }


    //trace( " >>> state records: " + stateRecords.size() );
    var stateRecords = _stateResultsTable.getRecordSet();
    var candArr = [];
    var stateArr = [];

    while( stateRecords.hasNext() ) {
      var rec = stateRecords.nextRecord;
      var st = rec.getString( 'state_id' );
      var cands = candIndex[ st ];
      cands.sort( E.sortCandidates );
      var stateObj = rec.getDataAsObject();
      stateObj['candidates'] = cands;
      stateArr.push( stateObj );
      //candArr.push( cands );
    }

    
    //_stateResultsTable.insertFieldData( CANDIDATE_DATA, C.OBJECT, candArr );
    _stateResultsTable.insertFieldData( STATE_DATA, C.OBJECT, stateArr )
    //trace( _stateResultsTable.getFieldData( CANDIDATE_DATA ) );


  }

  // Returns an object with state-level data for use w/ popups or filter function
  //
  this.getStateData = function( st ) {
    var stateRec = _stateResultsTable.getIndexedRecord( st );
    if ( stateRec.isNull() ) {
      //trace( "[DataSourceBase.getStateData()] missing data for state: " + st );
      return {};
    }
    //var obj = stateRec.getDataAsObject();
    var obj = stateRec.get( STATE_DATA );

    return obj;
  };

  this.getStateDataForPresentation = function( st ) {
    var obj = this.getStateData( st );
    obj['poll_close_note'] = E.formatPollClosingTime( obj['poll_close_time'] );
    obj['title'] = StateNames.getName( st );
    return obj;
  }

  this.getCountyDataForPresentation = function( st, fips ) {
    var obj = {};

    var rec = _countyResultsTable.getIndexedRecord( fips );
    if ( rec.isNull() ) {
      return obj;
      //obj.subtitle = "No election in 2010";
    }

    var d = rec.getInteger( 'dem_votes' );
    var r = rec.getInteger( 'rep_votes' );
    var o = rec.getInteger( 'third_votes' );
    var totalVotes = rec.getInteger( 'total_votes' );

    obj['total_votes'] = totalVotes;

    var candSet = _candidatesTable.getMatchingRecordSet( 'state_id', st );
    var candArr = [];
    var candCount = 0;
    while( candSet.hasNext() ) {
      var candRec = candSet.nextRecord;
      var candDataObj = candRec.getDataAsObject();
      if ( candDataObj['county_vote_field'] ) {
        if ( candDataObj['party'] == 'GOP' ) {
          candDataObj['vote_count'] = r;
        }
        else if ( candDataObj['party'] == 'Dem' ) {
          candDataObj['vote_count'] = d;
        }
        else {
          candDataObj['vote_count'] = o;
        }

        candCount += candDataObj[ 'vote_count' ];

        decorateCandidateObject( candDataObj, totalVotes );
        candArr.push( candDataObj );
      }
    }
    
    var numCands = candArr.length;
    var uncontestedRace = false;
    obj['pct_reporting'] = rec.getString( 'pct_reporting' );

    if (  numCands > 0 ) {
      candArr.sort( E.sortCandidates );
      var otherVotes = totalVotes - candCount;
      if ( otherVotes > 0 ) {
        var otherObj = { "display_name":"Others", "vote_count":otherVotes, "party":"" };
        decorateCandidateObject( otherObj, totalVotes );
        otherObj['party_name'] = "-";
        candArr.push( otherObj );
      }
      
      obj['candidates'] = candArr;
    }
    else {
      obj['candidates'] = [];
    }
    return obj;

  }


  this.procWinningCandidate = function( s, leaderObj ) {

    var leaderParty = leaderObj['party'];
    var leaderIsWinner = leaderObj['winner_flag'];
    //var leaderIsGain = leaderIsWinner && leaderObj.gain_flag;
    var leaderHasVotes = leaderObj['vote_count'] > 0;
    var fc;

    // possible that the leader has no votes (e.g. running unopposed)
    if ( !leaderObj['winner_flag'] && !leaderHasVotes ) {
      fc = E.NoVotesCol;
    }
    else if ( leaderParty == E.DEM_CODE ) {
      if ( leaderIsWinner ) {
        fc = E.DemWinCol;
      }
      else {
        fc = E.DemLeadCol;
      }
    }
    else if ( leaderParty == E.REP_CODE ) {
      if ( leaderIsWinner ) {
        fc = E.RepWinCol;
      }
      else {
        fc = E.RepLeadCol;
      }

    }
    else {
      if ( leaderIsWinner ) {
        fc = E.ThirdWinCol;
      }
      else {
        fc = E.ThirdLeadCol;
      }

    }

    s.fillColor = fc;

  }

  this.filterWinLeadStyle = function( s, rec ) {
    s.fillColor = E.NullCol;
    var st = rec.getString( 'STATE' );
    var obj = this.getStateData( st );
    if ( !obj || !obj[ 'candidates' ] || !obj[ 'candidates' ].length > 0 ) {
      // s.fillColor = 0xff0000;
    }
    else {
      var cands = obj[ 'candidates' ];
      var leaderObj = cands[0];
      this.procWinningCandidate( s, leaderObj );
    }

  };

  this.getCountyColor = function( st, fips ) {
    // TODO: handle special election
    var col = E.NullCol;
    if ( st == 'NY2' ) {
    //  trace('in NY2')
    //  var rec:Record = _specialCountyResultsTable.getIndexedRecord( fips );
    }
    else {

      rec = _countyResultsTable.getIndexedRecord( fips );
      var d = rec.getInteger( 'dem_votes' );
      var r = rec.getInteger( 'rep_votes' );
      var o = rec.getInteger( 'third_votes' );
      var tot = rec.getInteger( 'total_votes' );
      
      col = E.getFourColorMarginColor( d, r, o, tot );
    }
    
    return col;
  }

}

