// Passive "Messages" inbox: a non-blocking alternative to modal alerts for
// status messages and warnings. Backed by a header button (the envelope icon)
// in #mode-buttons and a popup-dialog panel.
//
// Public API (attached to the gui instance):
//   gui.notify({severity, body, title?, dedupKey?})   add an entry
//   gui.notify(message)                                shorthand: info severity
//
// severity is one of 'info' | 'warn' | 'error' (default 'info').
// If dedupKey is given and an entry with the same key already exists, the
// existing entry's count is incremented and its timestamp updated instead of
// adding a new row -- handy for repeated CLI warnings.

import { El } from './gui-el';
import { SimpleButton } from './gui-elements';
import { internal } from './gui-core';

var SEVERITIES = {info: true, warn: true, error: true};
var PULSE_DURATION_MS = 1900; // matches the CSS animation total runtime

export function MessageControl(gui) {
  var btn = gui.container.findChild('.messages-btn');
  var badge = btn.findChild('.messages-badge');
  var panel = gui.container.findChild('.messages-panel');
  var listEl = panel.findChild('.messages-list');
  var emptyEl = panel.findChild('.messages-empty');
  var clearBtn = new SimpleButton(panel.findChild('.messages-clear-btn'));
  var closeBtn = new SimpleButton(panel.findChild('.close2-btn'));
  var entries = [];
  var nextId = 1;
  var pulseTimer = null;
  var rendered = false;

  // Start fully hidden until the first notification arrives, so the icon
  // doesn't take up header space when there's nothing to show.
  btn.addClass('hidden');
  gui.addMode('messages', turnOn, turnOff, btn);

  closeBtn.on('click', function() {
    gui.clearMode();
  });

  clearBtn.on('click', function() {
    if (entries.length === 0) return;
    entries = [];
    // Close the panel so the now-disabled envelope isn't holding open a
    // panel the user can no longer dismiss with a header click.
    gui.clearMode();
    renderList();
    updateBadge();
  });

  // Public API
  gui.notify = function(opts) {
    if (typeof opts == 'string') {
      opts = {body: opts};
    }
    opts = opts || {};
    var severity = SEVERITIES[opts.severity] ? opts.severity : 'info';
    var body = opts.body == null ? '' : String(opts.body);
    var title = opts.title || null;
    if (!body && !title) return;

    if (opts.dedupKey) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].dedupKey === opts.dedupKey) {
          entries[i].count = (entries[i].count || 1) + 1;
          entries[i].time = new Date();
          // Promote severity if a later occurrence is more severe.
          if (severityRank(severity) > severityRank(entries[i].severity)) {
            entries[i].severity = severity;
          }
          renderList();
          pulseBadge();
          return;
        }
      }
    }

    entries.unshift({
      id: nextId++,
      severity: severity,
      title: title,
      body: body,
      count: 1,
      time: new Date(),
      dedupKey: opts.dedupKey || null
    });
    renderList();
    updateBadge();
    pulseBadge();

    // Mirror to the JS console so power users still see a record even if they
    // never open the panel. Use the matching console method per severity.
    var rec = (title ? title + ': ' : '') + body;
    if (severity === 'error') console.error(rec);
    else if (severity === 'warn') console.warn(rec);
    else if (typeof internal !== 'undefined' && internal.logArgs) {
      internal.logArgs([rec]);
    } else {
      console.log(rec);
    }
  };

  function severityRank(s) {
    return s === 'error' ? 2 : s === 'warn' ? 1 : 0;
  }

  function turnOn() {
    if (!rendered) renderList();
    panel.show();
  }

  function turnOff() {
    panel.hide();
  }

  function updateBadge() {
    var n = entries.length;
    var hasWarn = false;
    var hasError = false;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].severity === 'error') hasError = true;
      else if (entries[i].severity === 'warn') hasWarn = true;
    }
    badge.text(n > 99 ? '99+' : String(n));
    badge.classed('hidden', n === 0);
    badge.classed('warn', hasWarn && !hasError);
    badge.classed('error', hasError);
    btn.classed('hidden', n === 0);
  }

  function pulseBadge() {
    btn.removeClass('pulse');
    // Force reflow so removing+adding the class restarts the CSS animation.
    void btn.node().offsetWidth;
    btn.addClass('pulse');
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function() {
      btn.removeClass('pulse');
      pulseTimer = null;
    }, PULSE_DURATION_MS);
  }

  function renderList() {
    rendered = true;
    listEl.empty();
    if (entries.length === 0) {
      emptyEl.show();
      return;
    }
    emptyEl.hide();
    for (var i = 0; i < entries.length; i++) {
      listEl.node().appendChild(renderItem(entries[i]).node());
    }
  }

  function renderItem(entry) {
    var item = El('div').addClass('message-item').addClass('severity-' + entry.severity);
    if (entry.title) {
      El('span').addClass('message-title').text(entry.title).appendTo(item);
    }
    var bodyText = entry.body || '';
    if (entry.count > 1) {
      bodyText += '  (\u00d7' + entry.count + ')';
    }
    El('div').addClass('message-body').text(bodyText).appendTo(item);
    El('span').addClass('message-time').text(formatTime(entry.time)).appendTo(item);
    var dismiss = El('span').addClass('message-dismiss').attr('title', 'Dismiss').text('\u00d7').appendTo(item);
    var entryId = entry.id;
    dismiss.on('click', function(e) {
      // Prevent the click from also triggering any panel-level handlers.
      if (e && e.stopPropagation) e.stopPropagation();
      entries = entries.filter(function(x) { return x.id !== entryId; });
      // If we just dismissed the last entry, close the panel for the same
      // reason as Clear all: the envelope will go disabled and the user
      // wouldn't be able to dismiss the panel by clicking the header again.
      if (entries.length === 0) gui.clearMode();
      renderList();
      updateBadge();
    });
    return item;
  }

  function formatTime(d) {
    if (!(d instanceof Date)) return '';
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  return {
    notify: gui.notify,
    count: function() { return entries.length; }
  };
}
