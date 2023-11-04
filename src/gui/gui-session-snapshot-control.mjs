import { El } from './gui-el';
import { internal, stop } from './gui-core';
import { saveBlobToLocalFile, saveBlobToSelectedFile } from './gui-save';

var idb = require('idb-keyval');
// https://github.com/jakearchibald/idb
// https://github.com/jakearchibald/idb-keyval
var sessionId = getUniqId('session');
var snapshotCount = 0;

function getUniqId(prefix) {
  return prefix + '_' + (Math.random() + 1).toString(36).substring(2,8);
}

function isSnapshotId(str) {
  return /^session_/.test(str);
}

export function SessionSnapshots(gui) {
  var _menuOpen = false;
  var _menuTimeout;
  var btn, menu;

  init();

  async function init() {
    var enabled = await isStorageEnabled();
    if (!enabled) return;

    btn = gui.buttons.addButton('#ribbon-icon').addClass('menu-btn save-btn');
    menu = El('div').addClass('nav-sub-menu save-menu').appendTo(btn.node());
    await initialCleanup();

    window.addEventListener('beforeunload', async function() {
      // delete snapshot data
      // This is not ideal, because the data gets deleted even if the user
      // cancels the page close... but there's no apparent good alternative
      await finalCleanup();
    });

    btn.on('mouseenter', function() {
      btn.addClass('hover');
      clearTimeout(_menuTimeout); // prevent timed closing
      if (!_menuOpen) {
        openMenu();
      }
    });

    btn.on('mouseleave', function() {
      if (!_menuOpen) {
        btn.removeClass('hover');
      } else {
        closeMenu(200);
      }
    });
  }

  async function renderMenu() {
    var snapshots = await fetchSnapshotList();

    menu.empty();
    addMenuLink({
      slug: 'stash',
      // label: 'save data snapshot',
      label: 'create a snapshot',
      action: saveSnapshot
    });

    // var available = await getAvailableStorage();
    // if (available) {
    //   El('div').addClass('save-menu-entry').text(available + ' available').appendTo(menu);
    // }

    // if (snapshots.length > 0) {
    //   El('div').addClass('save-menu-entry').text('snapshots').appendTo(menu);
    // }

    snapshots.forEach(function(item, i) {
      var line = El('div').appendTo(menu).addClass('save-menu-item');
      El('span').appendTo(line).html(`<span class="save-item-label">#${item.number}</span> `);
      // show snapshot size
      El('span').appendTo(line).html(` <span class="save-item-size">${item.display_size}</span>`);
      El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
        await restoreSnapshotById(item.id, gui);
        closeMenu(100);
      }).text('restore');
      El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
        var obj = await idb.get(item.id);
        await internal.compressSnapshotForExport(obj);
        var buf = internal.pack(obj);
        // choose output filename and directory every time
        // saveBlobToLocalFile('mapshaper_snapshot.msx', new Blob([buf]));
        var fileName = `snapshot-${String(item.number).padStart(2, '0')}.msx`;
        saveBlobToSelectedFile(fileName, new Blob([buf]), function() {});
      }).text('export');
      El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
        await removeSnapshotById(item.id);
        closeMenu(300);
        renderMenu();
      }).text('remove');
    });

    // if (snapshots.length >= 1) {
    //   addMenuLink({
    //     slug: 'clear',
    //     label: 'remove all',
    //     action: clearData
    //   });
    // }
  }

  function addMenuLink(item) {
    var line = El('div').appendTo(menu);
    var link = El('div').addClass('save-menu-link save-menu-entry').attr('data-name', item.slug).text(item.label).appendTo(line);
    link.on('click', async function(e) {
      await item.action(gui);
      e.stopPropagation();
    });
  }

  function openMenu() {
    clearTimeout(_menuTimeout);
    if (!_menuOpen) {
      btn.addClass('open');
      _menuOpen = true;
      renderMenu();
    }
  }

  function closeMenu(delay) {
    if (!_menuOpen) return;
    clearTimeout(_menuTimeout);
    _menuTimeout = setTimeout(function() {
      _menuOpen = false;
      btn.removeClass('open');
      btn.removeClass('hover');
    }, delay || 0);
  }

  async function saveSnapshot(gui) {
    var obj = await captureSnapshot(gui);
    // storing an unpacked object is usually a bit faster (~20%)
    // note: we don't know the size of unpacked snapshot objects
    // obj = internal.pack(obj);
    var entryId = String(++snapshotCount).padStart(3, '0');
    var snapshotId = sessionId + '_' + entryId; // e.g. session_d89fw_001
    var size = obj.length;
    var entry = {
      created: Date.now(),
      session: sessionId,
      id: snapshotId,
      name: snapshotCount + '.',
      number: snapshotCount,
      size: size,
      display_size: formatSize(size)
    };

    await idb.set(entry.id, obj);
    await addToIndex(entry);
    renderMenu();
  }
}

function formatSize(bytes) {
  var kb = Math.round(bytes / 1000);
  var mb = (bytes / 1e6).toFixed(1);
  if (!kb) return '';
  if (kb < 990) return kb + 'kB';
  return mb + 'MB';
}

async function fetchSnapshotList() {
  await removeMissingSnapshots();
  var index = await fetchIndex();
  var snapshots = index.snapshots;
  snapshots = snapshots.filter(function(o) {return o.session == sessionId;});
  return snapshots.sort(function(a, b) {b.created > a.created;});
}

async function removeSnapshotById(id, gui) {
  await idb.del(id);
  return updateIndex(function(index) {
    index.snapshots = index.snapshots.filter(function(snap) {
      return snap.id != id;
    });
  });
}

async function restoreSnapshotById(id, gui) {
  var data;
  try {
    data = await internal.restoreSessionData(await idb.get(id));
  } catch(e) {
    console.error(e);
    stop('Snapshot is not available');
  }
  gui.model.clear();
  importDatasets(data.datasets, gui);
  gui.clearMode();
}

// Add datasets to the current project
// TODO: figure out if interface data should be imported (e.g. should
//   visibility flag of imported layers be imported)
export async function importSessionData(buf, gui) {
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  var data = await internal.unpackSessionData(buf);
  importDatasets(data.datasets, gui);
}

function importDatasets(datasets, gui) {
  gui.model.addDatasets(datasets);
  var target = findTargetLayer(datasets);
  gui.model.setDefaultTarget(target.layers, target.dataset);
  gui.model.updated({select: true, arc_count: true}); // arc_count to refresh display shapes
}

async function captureSnapshot(gui) {
  var datasets = gui.model.getDatasets();
  var lyr = gui.model.getActiveLayer().layer;
  // compact: true applies compression to vector coordinates, for ~30% reduction
  //   in file size in a typical polygon or polyline file, but longer processing time
  var opts = {compact: false};
  lyr.active = true;
  // console.time('msx');
  var obj = await internal.exportDatasetsToPack(datasets, opts);
  // console.timeEnd('msx')
  delete lyr.active;
  obj.gui = getGuiState(gui);
  return obj;
}

// TODO: capture gui state information to allow restoring more of the UI
function getGuiState(gui) {
  return null;
}

async function fetchIndex() {
  var index = await idb.get('msx_index');
  return index || {snapshots: []};
}

async function updateIndex(action) {
  return idb.update('msx_index', function(index) {
    if (!index || !Array.isArray(index.snapshots)) {
      index = {snapshots: []};
    }
    action(index);
    return index;
  });
}

async function addToIndex(obj) {
  updateSessionData();
  return updateIndex(function(index) {
    index.snapshots.push(obj);
  });
}

async function removeMissingSnapshots() {
  var keys = await idb.keys();
  return updateIndex(function(index) {
    index.snapshots = index.snapshots.filter(function(snap) {
      return keys.includes(snap.id);
    });
  });
}

async function initialCleanup() {
  // (Safari workaround) remove any lingering data from past sessions
  if (getSessionData().length === 0) {
    await idb.clear();
  }
  // remove any snapshots that are not indexed
  var keys = await idb.keys();
  var indexedIds = (await fetchIndex()).snapshots.map(function(snap) {return snap.id;});
  keys.forEach(function(key) {
    if (isSnapshotId(key) && !indexedIds.includes(key)) {
      idb.del(key);
    }
  });
  // remove old indexed snapshots
  await updateIndex(function(index) {
    index.snapshots = index.snapshots.filter(function(snap) {
      var msPerDay = 1000 * 60 * 60 * 24;
      var daysOld = (Date.now() - snap.created) / msPerDay;
      if (daysOld > 1) {
        if (keys.includes(snap.id)) idb.del(snap.id);
        return false;
      }
      return true;
    });
    return index;
  });
}

async function getAvailableStorage() {
  var bytes;
  try {
    var estimate = await navigator.storage.estimate();
    bytes = (estimate.quota - estimate.usage);
  } catch(e) {
    return null;
  }
  var str = (bytes / 1e6).toFixed(1) + 'MB';
  if (str.length > 7) {
    str = (bytes / 1e9).toFixed(1) + 'GB';
  }
  if (str.length > 7) {
    str = (bytes / 1e12).toFixed(1) + 'TB';
  }
  if (parseFloat(str) >= 10) {
    str = str.replace(/\../, '');
  }
  return str;
}

function findTargetLayer(datasets) {
  var target;
  datasets.forEach(function(dataset) {
    var lyr = dataset.layers.find(function(lyr) { return !!lyr.active; });
    if (lyr) target = {dataset: dataset, layers: [lyr]};
  });
  if (!target) {
    target = {dataset: datasets[0], layers: [datasets[0].layers[0]]};
  }
  return target;
}

// Clean up snapshot data (called just before browser tab is closed)
async function finalCleanup() {
  // When called on 'beforeunload', idb.clear() seems to complete
  // before tab is unloaded in Chrome and Firefox, but not in Safari.
  // Calling idb.del(key) to selectively delete data for the current session
  // does not seem to complete in any browser.
  // So we wait until the last open session is ending at this URL, and delete
  // data for all recently open sessions.
  //
  var sessions = getSessionData().filter(function(item) {
    // remove current session
    var daysOld = (Date.now() - item.timestamp) / (1000 * 60 * 60 * 24);
    if (item.session == sessionId) return false;
    // also remove any lingering old sessions (ordinarily this shouldn't be needed)
    if (daysOld > 1) return false;
    return true;
  });
  setSessionData(sessions);
  if (sessions.length === 0) {
    await idb.clear();
  }
}

function updateSessionData() {
  // make sure the current session is added to the list of open sessions
  var sessions = getSessionData();
  if (sessions.find(o => o.session == sessionId)) return;
  var entry = {
    session: sessionId,
    timestamp: Date.now()
  };
  setSessionData(sessions.concat([entry]));
}

function getSessionData() {
  var data = JSON.parse(window.localStorage.getItem('session_data'));
  return data || [];
}

function setSessionData(arr) {
  window.localStorage.setItem('session_data', JSON.stringify(arr));
}

async function isStorageEnabled() {
  try {
    setSessionData(getSessionData());
    await updateIndex(function() {});
    return true;
  } catch(e) {
    return false;
  }
}
