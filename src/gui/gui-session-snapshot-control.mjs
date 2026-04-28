import { El } from './gui-el';
import { internal, stop } from './gui-core';
import { saveBlobToLocalFile2 } from './gui-save';
import require from '../mapshaper-require';

var idb = require('idb-keyval');
// https://github.com/jakearchibald/idb
// https://github.com/jakearchibald/idb-keyval
var sessionId = getUniqId('session');
var snapshotCount = 0;
// IDs of snapshots created (and not removed) by this tab. Tracked in memory
// so the pagehide handler can fire a single batched delMany() without first
// awaiting idb.keys() -- the page may not survive the round trip.
var ownSnapshotIds = new Set();

// Lifecycle constants for snapshot cleanup.
// HEARTBEAT_INTERVAL_MS: how often this tab refreshes its localStorage entry.
// STALE_THRESHOLD_MS: a session whose heartbeat is older than this is treated
//   as dead. Generous enough to tolerate backgrounded/throttled tabs.
// BROADCAST_DISCOVERY_MS: how long startup waits for live tabs to identify
//   themselves over BroadcastChannel before deciding what to delete.
var HEARTBEAT_INTERVAL_MS = 30 * 1000;
var STALE_THRESHOLD_MS = 5 * 60 * 1000;
var BROADCAST_DISCOVERY_MS = 200;
var SESSION_DATA_KEY = 'session_data';
var BROADCAST_CHANNEL_NAME = 'mapshaper-snapshots';

function getUniqId(prefix) {
  return prefix + '_' + (Math.random() + 1).toString(36).substring(2,8);
}

function getSessionFromSnapshotId(snapshotId) {
  // Snapshot ids look like 'session_<6chars>_<NNN>'. The session id is the
  // 'session_<6chars>' prefix.
  var m = /^(session_[a-z0-9]+)_\d+$/.exec(snapshotId);
  return m ? m[1] : null;
}

function isSnapshotId(str) {
  return getSessionFromSnapshotId(str) !== null;
}

export function SessionSnapshots(gui) {
  var _menuOpen = false;
  var _menuTimeout;
  var btn, menu;

  init();

  async function init() {
    btn = gui.buttons.addButton('#ribbon-icon').addClass('menu-btn save-btn');
    var enabled = await isStorageEnabled();
    if (!enabled) {
      btn.remove();
      return;
    }
    menu = El('div').addClass('nav-sub-menu save-menu').appendTo(btn.node());
    startLifecycle();
    await initialCleanup();

    // 'pagehide' is more reliable than 'unload' across modern browsers
    // (Chrome's bfcache rules increasingly suppress 'unload'). Sync work
    // (localStorage write, BroadcastChannel notice) always completes; the
    // best-effort delMany() below frequently completes in Chrome/Firefox and
    // sometimes in Safari, but is not relied upon -- the next session's
    // startup cleanup is the safety net.
    window.addEventListener('pagehide', function(e) {
      if (e.persisted) return; // bfcache: tab may come back, leave entry alive
      removeOwnSession();
      announceLeaving();
      attemptOwnDataDeletion();
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

    if (!gui.session.isEmpty()) {
      // Surface the console "history" command via the snapshot menu so users
      // can browse the session's command history without knowing about the
      // console keyword. Hidden when there's nothing to show.
      addMenuLink({
        slug: 'history',
        label: 'view session history',
        action: function(gui) {
          gui.console.runCommand('history');
        }
      });
    }

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
        var fileName = `snapshot-${String(item.number).padStart(2, '0')}.msx`;
        // choose output filename and directory every time, if supported
        saveBlobToLocalFile2(fileName, new Blob([buf]));
      }).text('export');
      El('span').addClass('save-menu-btn').appendTo(line).on('click', async function(e) {
        await removeSnapshotById(item.id);
        closeMenu(300);
        renderMenu();
      }).text('remove');
    });
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

    if (!obj) return;
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
    ownSnapshotIds.add(entry.id);
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
  await pruneIndexAgainstKeys();
  var index = await fetchIndex();
  var snapshots = index.snapshots;
  snapshots = snapshots.filter(function(o) {return o.session == sessionId;});
  return snapshots.sort(function(a, b) {b.created > a.created;});
}

async function removeSnapshotById(id, gui) {
  await idb.del(id);
  ownSnapshotIds.delete(id);
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
  // Reinstate the session history (including its saved/unsaved boundary) that
  // was in effect when the snapshot was taken. If the snapshot has no history
  // field (e.g. older snapshots), this resets to a clean state.
  gui.session.restoreHistorySnapshot(data.history);
  gui.clearMode();
}

// Import datasets from a packed .msx buffer.
// Behavior depends on whether the current session contains data:
//   - empty session: full project restore -- datasets and any embedded session
//     history are loaded as if continuing the original session.
//   - non-empty session: merge -- datasets are added to the current project,
//     but any embedded session history is discarded (the imported commands
//     assume different layer indices and a different starting state, so
//     merging them into the current session would produce a misleading history).
// Returns true if a full restore occurred, false if a merge occurred. The
// caller uses this to decide whether to record an additional -i command in
// the current session's history (see gui-import-control.mjs).
// TODO: figure out if interface data should be imported (e.g. should
//   visibility flag of imported layers be imported)
export async function importSessionData(buf, gui) {
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  var data = await internal.unpackSessionData(buf);
  var fullRestore = gui.model.isEmpty();
  importDatasets(data.datasets, gui);
  if (fullRestore) {
    gui.session.restoreHistorySnapshot(data.history);
  }
  return fullRestore;
}

function importDatasets(datasets, gui) {
  gui.model.addDatasets(datasets);
  var target = findTargetLayer(datasets);
  delete target.layers[0].active; // kludge, active flag only used in snapshots now
  gui.model.setDefaultTarget(target.layers, target.dataset);
  gui.model.updated({select: true, arc_count: true}); // arc_count to refresh display shapes
}

async function captureSnapshot(gui) {
  var lyr = gui.model.getActiveLayer()?.layer;
  if (!lyr) return null; // no data -- no snapshot
  // compact: true applies compression to vector coordinates, for ~30% reduction
  //   in file size in a typical polygon or polyline file, but longer processing time
  // history: capture session commands + saved/unsaved boundary so the history
  //   can be reinstated if this snapshot is restored or re-imported later.
  var opts = {
    compact: false,
    active_layer: lyr,
    history: gui.session.getHistorySnapshot()
  };
  var datasets = gui.model.getDatasets();
  var obj = await internal.exportDatasetsToPack(datasets, opts);
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
  touchOwnSession();
  return updateIndex(function(index) {
    index.snapshots.push(obj);
  });
}

// Drop index entries whose underlying IndexedDB blob has gone missing
// (e.g. cleared by another tab). Cheaper than reclaimDeadSessionData; used
// before rendering the menu to keep stale entries out of the UI.
async function pruneIndexAgainstKeys() {
  var keys = await idb.keys();
  return updateIndex(function(index) {
    index.snapshots = index.snapshots.filter(function(snap) {
      return keys.includes(snap.id);
    });
  });
}

// Run on every fresh page load. Aggressively reclaim space by deleting any
// snapshot whose owning session is no longer alive.
async function initialCleanup() {
  touchOwnSession();
  pruneStaleSessionData();
  var liveSessions = await discoverLiveSessions();
  await reclaimDeadSessionData(liveSessions);
}

// Delete every snapshot in IndexedDB whose session id is not in liveSessions,
// and keep the on-disk index consistent with the actual key set.
async function reclaimDeadSessionData(liveSessions) {
  var keys = await idb.keys();
  var doomedKeys = [];
  var doomedSessions = new Set();
  keys.forEach(function(key) {
    var sid = getSessionFromSnapshotId(key);
    if (sid && !liveSessions.has(sid)) {
      doomedKeys.push(key);
      doomedSessions.add(sid);
    }
  });

  // Sum sizes from the index for an informative log message. We only know
  // the size of snapshots that still have an index entry; orphaned blobs
  // are counted but their sizes contribute 0.
  var sizeBytes = 0;
  if (doomedKeys.length) {
    var index = await fetchIndex();
    var doomedKeySet = new Set(doomedKeys);
    index.snapshots.forEach(function(snap) {
      if (doomedKeySet.has(snap.id) && typeof snap.size === 'number') {
        sizeBytes += snap.size;
      }
    });
    await Promise.all(doomedKeys.map(function(k) { return idb.del(k); }));
  }

  // Drop index entries pointing to deleted snapshots, and any entries whose
  // session is dead even if the underlying key was already gone.
  var remainingKeys = await idb.keys();
  var keySet = new Set(remainingKeys);
  await updateIndex(function(index) {
    index.snapshots = index.snapshots.filter(function(snap) {
      if (!keySet.has(snap.id)) return false;
      var sid = getSessionFromSnapshotId(snap.id);
      return sid && liveSessions.has(sid);
    });
  });

  if (doomedKeys.length) {
    var msg = '[mapshaper] startup cleanup reclaimed ' +
      doomedKeys.length + ' snapshot' + (doomedKeys.length === 1 ? '' : 's') +
      ' from ' + doomedSessions.size + ' stale session' +
      (doomedSessions.size === 1 ? '' : 's');
    var sizeStr = sizeBytes > 0 ? formatSize(sizeBytes) : '';
    if (sizeStr) msg += ' (' + sizeStr + ')';
    console.log(msg);
  }
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
    if (lyr) {
      target = {dataset: dataset, layers: [lyr]};
    }
  });
  if (!target) {
    target = {dataset: datasets[0], layers: [datasets[0].layers[0]]};
  }
  return target;
}

// Heartbeat + BroadcastChannel state. The localStorage map and the channel
// together let other tabs identify themselves on demand and let crashed tabs'
// data be reclaimed safely.
//
// localStorage 'session_data' shape: { <sessionId>: <lastSeenMs>, ... }
// (The previous build stored an array; old data is overwritten on first
//  touchOwnSession() call. Only used for cleanup heuristics, not user data.)

var _heartbeatTimer = null;
var _channel = null;

function startLifecycle() {
  touchOwnSession();
  _heartbeatTimer = setInterval(touchOwnSession, HEARTBEAT_INTERVAL_MS);
  if (typeof BroadcastChannel == 'function') {
    try {
      _channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      _channel.onmessage = function(e) {
        var msg = e.data;
        if (!msg || msg.from === sessionId) return;
        if (msg.type === 'whois') {
          try {
            _channel.postMessage({type: 'iam', from: sessionId});
          } catch (err) {} // channel can throw if tab is being torn down
        }
      };
    } catch (err) {
      _channel = null; // sandboxed contexts may forbid BroadcastChannel
    }
  }
}

// Discover other live tabs. Returns a Set of session ids that should be
// considered alive (always includes our own).
function discoverLiveSessions() {
  return new Promise(function(resolve) {
    var live = new Set([sessionId]);
    // localStorage heartbeat data is the durable signal; it survives
    // backgrounded/throttled tabs that may not respond to BroadcastChannel
    // promptly.
    var data = readSessionData();
    Object.keys(data).forEach(function(sid) {
      if (Date.now() - data[sid] < STALE_THRESHOLD_MS) {
        live.add(sid);
      }
    });
    if (!_channel) {
      resolve(live);
      return;
    }
    // Broadcast 'whois' and add any tab that responds within the discovery
    // window. This is fast and authoritative for foreground tabs.
    var listener = function(e) {
      var msg = e.data;
      if (msg && msg.type === 'iam' && msg.from && msg.from !== sessionId) {
        live.add(msg.from);
      }
    };
    _channel.addEventListener('message', listener);
    try {
      _channel.postMessage({type: 'whois', from: sessionId});
    } catch (err) {}
    setTimeout(function() {
      _channel.removeEventListener('message', listener);
      resolve(live);
    }, BROADCAST_DISCOVERY_MS);
  });
}

function announceLeaving() {
  if (!_channel) return;
  try {
    _channel.postMessage({type: 'leaving', from: sessionId});
    _channel.close();
  } catch (err) {}
}

// Best-effort eager cleanup at end-of-session. Snapshots can be tens or
// hundreds of MB, so we don't want to rely solely on the next session's
// startup to reclaim space. A single delMany() transaction is cheap to
// launch and frequently commits before the page is fully torn down,
// especially in Chrome/Firefox; Safari is less reliable. Anything that
// doesn't complete here will be reclaimed by the next session anyway.
//
// Important: do NOT await any of this. The browser doesn't await async work
// in the unload path; we just want the IDB transaction to be queued before
// the page is killed.
function attemptOwnDataDeletion() {
  if (ownSnapshotIds.size === 0) return;
  var ids = Array.from(ownSnapshotIds);
  ownSnapshotIds.clear();
  // Delete the blobs in a single transaction.
  try {
    idb.delMany(ids).catch(function() {});
  } catch (err) {}
  // Drop our entries from the index in a separate (also fire-and-forget)
  // transaction. If only one of the two completes, startup cleanup will
  // reconcile -- reclaimDeadSessionData() handles both "key gone, index
  // entry remains" and "index entry gone, key remains".
  try {
    updateIndex(function(index) {
      index.snapshots = index.snapshots.filter(function(snap) {
        return getSessionFromSnapshotId(snap.id) !== sessionId;
      });
    }).catch(function() {});
  } catch (err) {}
}

function touchOwnSession() {
  var data = readSessionData();
  data[sessionId] = Date.now();
  writeSessionData(data);
}

function removeOwnSession() {
  var data = readSessionData();
  if (sessionId in data) {
    delete data[sessionId];
    writeSessionData(data);
  }
}

function pruneStaleSessionData() {
  var data = readSessionData();
  var now = Date.now();
  var changed = false;
  Object.keys(data).forEach(function(sid) {
    if (now - data[sid] > STALE_THRESHOLD_MS) {
      delete data[sid];
      changed = true;
    }
  });
  if (changed) writeSessionData(data);
}

function readSessionData() {
  try {
    var raw = window.localStorage.getItem(SESSION_DATA_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    // Tolerate the legacy array shape by ignoring it (next write replaces it).
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (e) {
    return {};
  }
}

function writeSessionData(obj) {
  try {
    window.localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(obj));
  } catch (e) {} // localStorage can throw on quota exceeded; non-fatal
}

async function isStorageEnabled() {
  try {
    writeSessionData(readSessionData());
    await updateIndex(function() {});
    return true;
  } catch(e) {
    return false;
  }
}
