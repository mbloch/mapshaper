/* @requires events */

test( "EventDispatcher: Adding and removing event handlers", testEvents );
test( "EventDispatcher: Event sequence and priority", testEventSequence );
test( "Waiter: Basic tests", testWaiter );

function testEvents() {
  var index, e;
 
  function reset() {
    index = {total:0};
    e = new EventDispatcher();
  }

  function handler(evt) {
    index.total++;
    if (!(evt.type in index)) {
      index[evt.type] = 0;
    }
    index[evt.type] += 1;
  }

  function handler2(evt) {
    handler(evt);
  }

  reset();

	e.addEventListener( 'foo', handler  ); 
	e.dispatchEvent('foo'); 
	ok( index.foo == 1 && index.total == 1, "Listener with no explicit context fires." );

	e.removeEventListener( 'foo', handler );
	e.dispatchEvent('foo');

	ok( index.foo == 1 && index.total == 1, "Listener with no context was removed." );

  reset();

	e.addEventListener( 'foo', handler, this ); 
	e.dispatchEvent('foo');  // 2
	ok( index.foo == 1, "Listener whith explicit context fires." );

	e.removeEventListener( 'foo', handler, this );
	e.dispatchEvent('foo');
	ok( index.foo == 1 && index.total == 1, "Listener with context was removed." );

  reset();

  e.addEventListener( 'boo', handler, this );
	e.addEventListener( 'boo', handler, {} );
	e.dispatchEvent('boo');
  ok(index.boo == 2, "Handler registered twice, with same event and different contexts, fires twice.");


  e.removeEventListener('boo', handler, this);
  e.dispatchEvent('boo');
  ok(index.boo == 3, "Removing the event handler in one context doesn't affect other contexts.");

  
  reset();
  var removals = e.removeEventListeners();
  ok(removals === 0, "No registered events, removeEventListeners() returns 0"); // 4


	e.addEventListener( 'moo', handler, this );
  e.addEventListener( 'too', handler, this );
  removals = e.removeEventListeners('moo');
  e.dispatchEvent('moo');
  e.dispatchEvent('too');
  ok( removals == 1 && index.too == 1 && !index.moo, "Removing one type of event leaves others untouched." ); // 5
}


function testEventSequence() {
  var e, callSequence;
  var seq12 = "12"
  var seq123 = "123"

  function reset() {
    e = new EventDispatcher();
    callSequence = "";
  };

  function handler1(evt) {
    callSequence += "1"
  }

  function handler2(evt) {
    callSequence += "2";
  }

  function handler3(evt) {
    callSequence += "3";
  }

  reset();
  e.addEventListener('foo', handler1, this);
  e.addEventListener('foo', handler2, this);
  e.addEventListener('foo', handler3, this);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with no priority fire in the order added.");


  reset();
  e.addEventListener('foo', handler1, this, 1);
  e.addEventListener('foo', handler2, this, 1);
  e.addEventListener('foo', handler3, this, 1);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with same priority (1) fire in the order added.");

  reset();
  e.addEventListener('foo', handler3, this, 1);
  e.addEventListener('foo', handler2, this, 2);
  e.addEventListener('foo', handler1, this, 3);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with increasing priority fire in the correct sequence.");

  reset();
  e.addEventListener('foo', handler1, this, 3);
  e.addEventListener('foo', handler2, this, 2);
  e.addEventListener('foo', handler3, this, 1);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with decreasing priority fire in the correct sequence.");

  reset();
  e.addEventListener('foo', handler2, this, 2);
  e.addEventListener('foo', handler1, this, 3);
  e.addEventListener('foo', handler3, this, 1);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with mixed priority fire in the correct sequence.");


  reset();
  e.addEventListener('foo', handler3, this, -1);
  e.addEventListener('foo', handler1, this, 0.1);
  e.addEventListener('foo', handler2, this, 0);
  e.dispatchEvent('foo');
  equal(callSequence, seq123, "Handlers with negative and fractional priorities fire correctly.");

}


function testWaiter() {

  var w, w2, w3, readyCount = 0;

  function reset() {
    readyCount = 0;
    w = new Waiter();
  }

  function handler() {
    readyCount += 1;
  }

  reset();
	w.startWaiting();
  ok(w.isReady(), "Waiter has no dependents, becomes ready as soon as 'w.startWaiting()' is called.");



  reset();
	w2 = new Waiter;
	w.waitFor( w2 );
	w.startWaiting();
	w2.startWaiting();
  ok(w.isReady(), "Waiter has one dependent; waiter starts waiting, dependent becomes ready, waiter becomes ready.");


  reset();
	w2 = new Waiter;
	w2.startWaiting();
	w.waitFor( w2 );
	w.startWaiting();
  ok(w.isReady(), "Waiter has one dependent; first, dependent becomes ready; then waiter starts waiting for dependent, waiter becomes ready.");


  reset();
  w.addEventListener('ready', handler);
	w.startWaiting();
  w.dispatchEvent('ready');
  ok(w.countEventListeners('ready') == 0 && readyCount == 1, "Waiter fires 'ready' event twice; 'ready' event handler only called once.");


  reset();
  w.startWaiting();
  w.addEventListener('ready', handler);
  ok(w.countEventListeners('ready') == 0 && readyCount == 1, "Waiter becomes ready; then, 'ready' event handler is registered, called immediately, and removed.");


  reset();
  w2 = new Waiter();
  w3 = new Waiter();
  w2.waitFor(w3);
  w.waitFor(w2);
  w2.startWaiting();
  w3.startWaiting();
  w.startWaiting();
  ok(w.isReady(), "Waiter becomes ready after two dependents are ready.");


  reset();
  w2 = new Waiter();
  w.waitFor(w2);
  w.startWaiting();
  ok(w.isReady() == false, "Waiter with one dependent does not become ready before dependent is ready.");


  reset();
  w2 = new Waiter();
  w.waitFor(w2);
  w.waitFor(w2);
  w.startWaiting();
  w2.startWaiting();
  
  ok(w.isReady() == true, "Calling waitFor() a second time on the same object is ignored.");
}
