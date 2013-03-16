/* @requires data, data-multipart, loading.ajax, browser */

(function(){

  var table = new DataTable();
  //table.load( new TabDataLoader( "data/table1_basic_data.txt" ) );
  //table.importData(new FileLoader().load("data/table1_basic_data.txt"), new TabDataParser);
  table.importArrayRecords(
    [['OR', 50000, 30.1, 'dummy', 50000],
    ['CA', , , , 0],
    ['NY', 0, 0.0, "", 0],
    ['MA', 40000, 100.0, '', 40000]],
    ['STATE', 'VOTES', 'PCT', 'NAME', 'VOTES2'],
    ['str', 'int', 'double', 'str', 'int']
  );


  var context = {};
  table.addEventListener( 'ready', handleLoad, this );

/*
  var loader = new MultiPartTabDataLoader( "data/table2_multi_part.txt" );
  var table2 = loader.requestTable( 'part_one' );
  var table3 = loader.requestTable( 'part_two' );
  loader.addEventListener( 'ready', handleMultiTableLoad, this );

  function handleMultiTableLoad( evt ) {
    test( "MultiPartTabDataLoader tests", testMultiTables );
  }


  function testMultiTables() {
    deepEqual( table2.size(), 1, "Part one length" );
    deepEqual( table3.size(), 3, "Part two length" );
    
    var rec = table2.getRecordById( 0 );
    deepEqual( rec.getString( 'COUNTRY' ), 'USA', "Reading a value from part one" );

    rec = table3.getRecordById( table3.size() - 1 );
    deepEqual( rec.getString( 'STATE'), 'TX', "Reading a value from part two" );
  }
*/

  function handleLoad( evt ) {
    test( "Value reading tests", testTable );

    test( "RecordSet tests", testRecordSet );
    test( "RecordSet sorting and filtering", testRecordSetSort );
    test( "DataTable.getMatchingRecordSet()", testGetMatchingRecordSet );
    test( "DataTable.getMatchingRecord()", testGetMatchingRecord );
    test( "DataTable: data insertion and extraction", testDataInsertion );
    test( "Record.getDataAsObject()", testGetDataAsObject );
    test( "Record and empty table cells", testEmptyRecordValues );
    test( "DataTable.getIndexedRecord()", testIndexing );
    /*	*/
  }


  function testDataInsertion() {
    var target = ['OR','CA','NY','MA'];
    deepEqual( table.getFieldData( 'STATE' ), target, "getFieldData( 'STATE' )" );

    var src1 = [ 0,1,2,3 ];
    table.insertFieldData( 'NUMBERS', C.INTEGER, src1 );
    deepEqual( table.getFieldData( 'NUMBERS' ), src1, "insertFieldData( 'NUMBERS' )" );

    var src2 = [5,6,7,8];
    table.insertFieldData( 'NUMBERS', C.INTEGER, src2 );
    deepEqual( table.getFieldData( 'NUMBERS' ), src2, "insertFieldData( 'NUMBERS' ) (overwriting)" );

  }
    

  function testIndexing() {
    table.indexOnField( 'STATE' );
    var rec = table.getIndexedRecord( 'NY' );

    deepEqual( rec.getString( 'STATE' ), 'NY', 'String field' );

    table.indexOnField( 'VOTES' );
    rec = table.getIndexedRecord( 50000 );
    deepEqual( rec.getInteger( 'VOTES'), 50000, 'Integer field' );


  }

  function testTable() {
    var rec = table.getRecordById( 0 );
    deepEqual( rec.getString( 'STATE' ), "OR", "Read string using getString()" );
    deepEqual( rec.getNumber( 'STATE' ), NaN, "Read non-numeric string using getString()" );
    deepEqual( rec.getNumber( 'PCT' ), 30.1, "Read number using getNumber()" );
    deepEqual( rec.getInteger( 'PCT' ), 30, "Read number using getInteger()" );
    deepEqual( rec.getNumber( 'VOTES' ), 50000, "Read integer using getNumber()" );
    deepEqual( rec.getInteger( 'VOTES' ), 50000, "Read integer using getInteger()" );
    
  }

  function testGetDataAsObject() {
    var rec = table.getMatchingRecord( 'STATE', 'OR' );
    var obj = rec.getDataAsObject();
    deepEqual( obj.STATE , "OR", "String property" );
    deepEqual( obj.VOTES, 50000, "Integer property" );
    deepEqual( obj.PCT, 30.1, "Number property" );
  }

  function testGetMatchingRecordSet() {
    var records = table.getMatchingRecordSet( 'STATE', 'OR' );
    deepEqual( records.size(), 1, "Set size, simple match" );

    
    records = table.getMatchingRecordSet( 'STATE', ['OR','CA'] );
    deepEqual( records.size(), 2, "Set size, one field, array of values" );

    records = table.getMatchingRecordSet( 'STATE', 'PR' );
    deepEqual( records.size(), 0, "Set size, one field, no match" );

    records = table.getMatchingRecordSet( 'STATE', [] );
    deepEqual( records.size(), 0, "Set size, one field, array, no match" );

    records = table.getMatchingRecordSet( 'STATE', 'OR', 'VOTES', 50000 );
    deepEqual( records.size(), 1, "Set size, two fields" );

    records = table.getMatchingRecordSet( 'STATE', ['OR','MA'], 'VOTES', [50000,40000] );
    deepEqual( records.size(), 2, "Set size, two fields, arrays" );

    records = table.getMatchingRecordSet( 'STATE', ['OR','MA'], 'VOTES', 50000, 'PCT', 100 );
    deepEqual( records.size(), 0, "Set size, three fields, no matches" );

    records = table.getMatchingRecordSet( 'STATE', 'OR', 'VOTES', 50000, 'PCT', 30.1 );
    deepEqual( records.size(), 1, "Set size, three fields, one match" );

  }


  function testGetMatchingRecord() {
    var rec = table.getMatchingRecord( 'STATE', 'OR' );
    deepEqual( rec.getString( 'STATE' ), "OR", "Read string from record" );
    deepEqual( rec.getNumber( 'VOTES' ), 50000, "Read integer from record" );
    deepEqual( rec.getNumber( 'PCT' ), 30.1, "Read number from record" );

    var rec = table.getMatchingRecord( 'STATE', 'PR' );
    deepEqual( rec.isNull(), true, "No match, record is null" );

  }

  function testEmptyRecordValues() {
    var rec = table.getMatchingRecord( 'STATE', 'CA' );
    deepEqual( isNaN( rec.getNumber( 'PCT' ) ), true, "Empty number field is NaN" );
    deepEqual( rec.getString( 'NAME' ), "", "Empty string field === ''" );
  }

  function testRecordSet() {
    var records = table.getRecordSet();
    var count=0;
    var tableSize = table.size();


    while( records.hasNext() ) {
      var rec = records.nextRecord;
      count++;
    }
    deepEqual( tableSize, count, "RecordSet.hasNext() count" );

    deepEqual( records.hasNext() && records.nextRecord.getString( 'STATE' ), 'OR', "First record" );
    deepEqual( records.hasNext() && records.nextRecord.getString( 'STATE' ), 'CA', "Second record" );
    deepEqual( records.hasNext() && records.nextRecord.getString( 'STATE' ), 'NY', "Third record" );
    deepEqual( records.hasNext() && records.nextRecord.getString( 'STATE' ), 'MA', "Fourth record" );
  }

  function testRecordSetSort() {
    var records = table.getRecordSet();
    records.sortOnField('STATE', true);
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['CA', 'MA', 'NY', 'OR'], "Ascending alphabetic sort");

    records = table.getRecordSet();
    records.sortOnField('STATE', false);
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['OR', 'NY', 'MA', 'CA'], "Descending alphabetic sort");

    records = table.getRecordSet();
    records.sortOnField('VOTES2', true);
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['CA', 'NY', 'MA', 'OR'], "Ascending numeric sort");


    records = table.getRecordSet();
    records.sortOnField('VOTES2', false);
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['OR', 'MA', 'CA', 'NY'], "Descending numeric sort");

    records = table.getRecordSet();
    records.filter(function(rec) { return rec.get('STATE') == 'OR' });
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['OR'], "Filter to match 'OR'");

    var records = table.getRecordSet().filter(function(rec) { return false });
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, [], "Filter to exclude everything");

    var records = table.getRecordSet().filter(function(rec) { return true });
    var data = getRecordSetData(records, 'STATE');
    deepEqual(data, ['OR', 'CA', 'NY', 'MA'], "Filter to include everything");

 }

  function getRecordSetData(set, field) {
    var data = [];
    while(set.hasNext()) {
      data.push(set.nextRecord.get(field));
    }
    return data;
  }
})();