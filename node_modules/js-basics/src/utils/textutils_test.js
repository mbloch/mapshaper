/* @requires textutils */

test("formatNumber()", formatNumber );

function formatNumber() {
	var arr = [0, 999, 1000, 999999, 1000000, 10.50000000, 10.49999999 ];
	equal( TextUtils.formatNumber( arr[0], 0 ), "0"  );
	equal( TextUtils.formatNumber( arr[0], 1 ), "0.0" );

	equal( TextUtils.formatNumber( arr[1], 0 ), "999"  );
	equal( TextUtils.formatNumber( arr[1], 1 ), "999.0" );

	equal( TextUtils.formatNumber( arr[2], 0 ), "1,000"  );
	equal( TextUtils.formatNumber( arr[2], 1 ), "1,000.0" );

	equal( TextUtils.formatNumber( arr[3], 0 ), "999,999"  );
	equal( TextUtils.formatNumber( arr[3], 1 ), "999,999.0" );

	equal( TextUtils.formatNumber( arr[4], 0 ), "1,000,000"  );
	equal( TextUtils.formatNumber( arr[4], 1 ), "1,000,000.0" );

	equal( TextUtils.formatNumber( arr[5], 0 ), "11"  );
	equal( TextUtils.formatNumber( arr[5], 1 ), "10.5" );


	equal( TextUtils.formatNumber( arr[6], 0 ), "10"  );
	equal( TextUtils.formatNumber( arr[6], 1 ), "10.5" );
}
