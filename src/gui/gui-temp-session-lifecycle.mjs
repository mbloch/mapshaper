var DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
var DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function createTempSessionLifecycle(opts) {
  opts = opts || {};
  var win = opts.window || getWindow();
  var sessionId = opts.sessionId || getUniqueSessionId(opts.prefix || 'tmp');
  var sessionKey = opts.sessionKey;
  var heartbeatInterval = opts.heartbeatInterval || DEFAULT_HEARTBEAT_INTERVAL_MS;
  var staleThreshold = opts.staleThreshold || DEFAULT_STALE_THRESHOLD_MS;
  var heartbeatTimer = null;
  var started = false;

  return {
    start: start,
    stop: stop,
    touch: touchOwnSession,
    removeOwnSession: removeOwnSession,
    getLiveSessions: getLiveSessions,
    getSessionId: function() { return sessionId; }
  };

  function start(onPageHide) {
    if (started) return;
    started = true;
    touchOwnSession();
    if (win && win.setInterval) {
      heartbeatTimer = win.setInterval(touchOwnSession, heartbeatInterval);
    } else if (typeof setInterval == 'function') {
      heartbeatTimer = setInterval(touchOwnSession, heartbeatInterval);
    }
    if (win && win.addEventListener) {
      win.addEventListener('pagehide', function(e) {
        if (e.persisted) return;
        stop();
        if (onPageHide) onPageHide();
      });
    }
  }

  function stop() {
    if (heartbeatTimer) {
      if (win && win.clearInterval) {
        win.clearInterval(heartbeatTimer);
      } else if (typeof clearInterval == 'function') {
        clearInterval(heartbeatTimer);
      }
      heartbeatTimer = null;
    }
    removeOwnSession();
  }

  function touchOwnSession() {
    var sessions = readSessions();
    sessions[sessionId] = Date.now();
    writeSessions(sessions);
  }

  function removeOwnSession() {
    var sessions = readSessions();
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      writeSessions(sessions);
    }
  }

  function getLiveSessions() {
    var sessions = readSessions();
    var live = {};
    var now = Date.now();
    live[sessionId] = true;
    Object.keys(sessions).forEach(function(sid) {
      if (now - sessions[sid] < staleThreshold) {
        live[sid] = true;
      }
    });
    return live;
  }

  function readSessions() {
    var storage = win && win.localStorage;
    var raw, parsed;
    if (!storage || !sessionKey) return {};
    try {
      raw = storage.getItem(sessionKey);
      parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed == 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch(e) {
      return {};
    }
  }

  function writeSessions(sessions) {
    var storage = win && win.localStorage;
    if (!storage || !sessionKey) return;
    try {
      storage.setItem(sessionKey, JSON.stringify(sessions));
    } catch(e) {}
  }
}

function getWindow() {
  return typeof window == 'undefined' ? null : window;
}

function getUniqueSessionId(prefix) {
  return prefix + '_' + (Math.random() + 1).toString(36).substring(2, 8);
}
