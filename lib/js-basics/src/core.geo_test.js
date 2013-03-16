/* @requires core.geo */

test("BoundingBox basics", testBoundingBox );
test("BoundingBox.mergeBounds()", testMergeBounds );

function testMergeBounds() {
	var bb1 = new BoundingBox;

	var bb2 = new BoundingBox;
	bb2.setBounds( 0, 100, 100, 0 );

	var bb3 = new BoundingBox;
	bb3.setBounds( -100, 0, 0, -100 );

	var bb = new BoundingBox;
	bb.mergeBounds( bb1 );
	equal( bb.toString(), bb1.toString(), "Merging two empty boxes" );

	bb = bb2.cloneBounds();
	bb.mergeBounds( bb3 );
	ok( bb.left == -100 && bb.top == 100 && bb.right == 100 && bb.bottom == -100, bb2 + " + " + bb3 + " = " + bb );

	bb = new BoundingBox();
	bb.mergeBounds( bb3 );
	equal( bb.toString(), bb3.toString(), "Merging non-empty box into empty box" );

	bb = bb3.cloneBounds();
	bb.mergeBounds( bb1 );
	equal( bb.toString(), bb3.toString(), "Merging empty box into non-empty box" );

}


function testBoundingBox() {
	var bb = new BoundingBox;
	equal( bb.hasBounds(), false, "Uninitialized box; hasBounds()" );

	bb.setBounds( 0, 100, 100, 0 );
	equal( bb.hasBounds(), true, "Initialized box; hasBounds()" );

	equal( bb.left === 0 && bb.top === 100 && bb.right === 100 && bb.bottom === 0, true, "Bounds check for [0, 100, 100, 0] box" );

	equal( bb.centerX() == 50 && bb.centerY() == 50, true, "centerX() and centerY() check for [0, 100, 100, 0] box" );

	equal( bb.containsPoint( 50, 50 ), true, "containsPoint( 50, 50 )" );

	equal( bb.containsPoint( 0, 0 ), true, "containsPoint( 0, 0 )" );

	equal( bb.containsPoint( 100, 100 ), true, "containsPoint( 100, 100 )" );

	equal( bb.containsPoint( -10, 50 ), false, "containsPoint( -10, 50 )" );

	var bb2 = bb.cloneBounds();
	ok( bb2.hasBounds() == true, "Cloned box, hasBounds() == true" );

	ok( bb.toString() == bb2.toString(), "toString() is same for cloned and original box" );
}
