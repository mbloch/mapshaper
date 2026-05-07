import assert from 'assert';
import { createRequire } from 'module';

describe('gui-undo.js', function() {
  it('accepts app-wide undo history entries', async function() {
    var Undo = await importUndo();
    var gui = makeGui();
    var undo = new Undo(gui);
    var val = 'initial';

    gui.undo = undo;
    undo.addHistoryState(function() {
      val = 'undone';
    }, function() {
      val = 'redone';
    });

    assert.equal(undo.canUndo(), true);
    assert.equal(undo.canRedo(), false);

    await undo.undo();

    assert.equal(val, 'undone');
    assert.equal(undo.canUndo(), false);
    assert.equal(undo.canRedo(), true);

    await undo.redo();

    assert.equal(val, 'redone');
    assert.equal(undo.canUndo(), true);
    assert.equal(undo.canRedo(), false);
  });

  it('cleans invalidated redo entries', async function() {
    var Undo = await importUndo();
    var gui = makeGui();
    var undo = new Undo(gui);
    var cleaned = false;

    undo.addHistoryState(function() {}, function() {}, function() {
      cleaned = true;
    });
    await undo.undo();
    undo.addHistoryState(function() {}, function() {});

    assert.equal(cleaned, true);
  });

  it('cleans entries removed by a history limit', async function() {
    var Undo = await importUndo();
    var gui = makeGui();
    var undo = new Undo(gui);
    var cleaned = [];

    undo.addHistoryState(function() {}, function() {}, function() {
      cleaned.push('a');
    }, {maxStates: 2});
    undo.addHistoryState(function() {}, function() {}, function() {
      cleaned.push('b');
    }, {maxStates: 2});
    undo.addHistoryState(function() {}, function() {}, function() {
      cleaned.push('c');
    }, {maxStates: 2});

    assert.deepEqual(cleaned, ['a']);
    assert.equal(undo.canUndo(), true);
  });

  it('restores undo offset after an async undo failure', async function() {
    var Undo = await importUndo();
    var gui = makeGui();
    var undo = new Undo(gui);
    var error = console.error;
    var err;

    undo.addHistoryState(async function() {
      throw new Error('undo failed');
    }, function() {});

    try {
      console.error = function() {};
      await undo.undo();
    } catch(e) {
      err = e;
    } finally {
      console.error = error;
    }

    assert.ok(err);
    assert.equal(undo.canUndo(), true);
    assert.equal(undo.canRedo(), false);
  });

  it('ignores rejected async cleanup handlers', async function() {
    var Undo = await importUndo();
    var gui = makeGui();
    var undo = new Undo(gui);

    undo.addHistoryState(function() {}, function() {}, function() {
      return Promise.reject(new Error('cleanup failed'));
    });

    assert.doesNotThrow(function() {
      undo.clear();
    });
  });
});

var importedUndo;

async function importUndo() {
  if (!importedUndo) {
    installGuiGlobals();
    importedUndo = import('../src/gui/gui-undo').then(function(mod) {
      return mod.Undo;
    });
  }
  return importedUndo;
}

function installGuiGlobals() {
  var require = createRequire(import.meta.url);
  Object.defineProperty(global, 'window', {
    value: {mapshaper: require('../mapshaper.js')},
    configurable: true
  });
  Object.defineProperty(global, 'document', {
    configurable: true,
    value: {
    createElement: function() {
      return {style: {cssText: ''}};
    }
    }
  });
}

function makeGui() {
  return {
    keyboard: {
      on: function() {}
    },
    on: function() {},
    dispatchEvent: function() {}
  };
}
