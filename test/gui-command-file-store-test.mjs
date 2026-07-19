import assert from 'assert';
import { CommandFileStore } from '../src/gui/gui-command-file-store';

describe('gui-command-file-store', function() {
  it('stores command files and returns an isolated input cache', function() {
    var store = new CommandFileStore();
    assert.equal(store.add('build.txt', 'mapshaper\n-info'), false);
    assert.deepEqual(store.getNames(), ['build.txt']);

    var cache = store.getInputCache();
    assert.equal(cache['build.txt'], 'mapshaper\n-info');
    delete cache['build.txt'];

    assert.equal(store.getInputCache()['build.txt'], 'mapshaper\n-info');
  });

  it('replaces a command file with the same name', function() {
    var store = new CommandFileStore();
    store.add('build.txt', 'mapshaper\n-info');
    assert.equal(store.add('build.txt', 'mapshaper\n-help'), true);
    assert.deepEqual(store.getNames(), ['build.txt']);
    assert.equal(store.getInputCache()['build.txt'], 'mapshaper\n-help');
  });
});
