// Jump-to-command dropdown for the command reference page.
//
// The build script wraps each command in <section class="cmd-section"
// data-id="-clip" data-name="-clip" data-options="..."> and tags the H2
// above each group as <h2 class="cmd-category">. We use that to populate a
// dropdown of matching commands beneath the search input. Selecting an item
// jumps to the corresponding section -- the page itself is never filtered.

(function () {
  'use strict';

  var input = document.querySelector('.cmd-search-input');
  var panel = document.querySelector('.cmd-search-results');
  if (!input || !panel) return;

  var statusEl = panel.querySelector('.cmd-search-status');
  var listEl = panel.querySelector('.cmd-search-list');
  var sections = Array.prototype.slice.call(
    document.querySelectorAll('.cmd-section')
  );
  if (!sections.length) return;

  // Build a flat command index. We walk the article in document order so we
  // can attach the most recent h2.cmd-category to each section.
  var article = sections[0].closest('.docs-article') || document;
  var commands = (function () {
    var out = [];
    var currentCat = '';
    var nodes = article.querySelectorAll('h2.cmd-category, section.cmd-section');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName === 'H2') {
        currentCat = (n.textContent || '').trim();
      } else {
        var name = n.dataset.name || '';
        var opts = n.dataset.options || '';
        var id = n.dataset.id || '';
        if (!id) continue;
        out.push({
          id: id,
          name: name,
          options: opts,
          category: currentCat,
          haystack: (name + ' ' + opts).toLowerCase(),
          el: n
        });
      }
    }
    return out;
  })();

  var MAX_RESULTS = 60;
  var activeIdx = -1;
  var results = [];

  function render() {
    var raw = input.value.trim();
    var tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      close();
      return;
    }

    // Score-free matching: every token must appear in the name + options
    // string. We deliberately don't search the full body text -- the dropdown
    // is for jumping to a known command, not for free-text search.
    results = commands.filter(function (c) {
      return tokens.every(function (t) { return c.haystack.indexOf(t) !== -1; });
    });

    var truncated = results.length > MAX_RESULTS;
    var shown = truncated ? results.slice(0, MAX_RESULTS) : results;

    listEl.innerHTML = shown.map(function (c, i) {
      return '<li role="option" id="cmd-result-' + i + '" class="cmd-result">' +
        '<a href="#' + escapeAttr(c.id) + '" class="cmd-result-link" tabindex="-1">' +
          '<span class="cmd-result-name">' + escapeHtml(c.name) + '</span>' +
          (c.category
            ? '<span class="cmd-result-cat">' + escapeHtml(c.category) + '</span>'
            : '') +
        '</a>' +
      '</li>';
    }).join('');

    if (!results.length) {
      statusEl.textContent = 'No commands match \u201c' + raw + '\u201d.';
    } else if (truncated) {
      statusEl.textContent = 'Showing first ' + MAX_RESULTS + ' of ' +
        results.length + ' matches.';
    } else if (results.length === 1) {
      statusEl.textContent = '1 match (press Enter to jump).';
    } else {
      statusEl.textContent = results.length + ' matches.';
    }

    open();
    setActive(results.length ? 0 : -1);
  }

  function open() {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIdx = -1;
    results = [];
    listEl.innerHTML = '';
    statusEl.textContent = '';
  }

  function setActive(idx) {
    var items = listEl.querySelectorAll('.cmd-result');
    if (activeIdx >= 0 && items[activeIdx]) {
      items[activeIdx].classList.remove('is-active');
    }
    activeIdx = idx;
    if (idx < 0 || !items[idx]) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    items[idx].classList.add('is-active');
    input.setAttribute('aria-activedescendant', 'cmd-result-' + idx);
    // Keep the highlighted item visible inside the (scrollable) dropdown.
    var el = items[idx];
    var top = el.offsetTop;
    var bottom = top + el.offsetHeight;
    if (top < listEl.scrollTop) {
      listEl.scrollTop = top;
    } else if (bottom > listEl.scrollTop + listEl.clientHeight) {
      listEl.scrollTop = bottom - listEl.clientHeight;
    }
  }

  function jumpTo(idx) {
    if (idx < 0 || idx >= results.length) return;
    var c = results[idx];
    // Use the anchor's href so the browser updates location.hash and triggers
    // its native scroll-to-anchor behaviour (which respects scroll-margin-top).
    var link = listEl.querySelectorAll('.cmd-result-link')[idx];
    if (link) link.click();
    close();
    input.blur();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
                '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  input.addEventListener('input', render);
  input.addEventListener('focus', function () {
    if (input.value.trim()) render();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      if (panel.hidden) { render(); return; }
      e.preventDefault();
      if (results.length) setActive((activeIdx + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      if (panel.hidden) return;
      e.preventDefault();
      if (results.length) {
        setActive(activeIdx <= 0 ? results.length - 1 : activeIdx - 1);
      }
    } else if (e.key === 'Enter') {
      if (panel.hidden || activeIdx < 0) return;
      e.preventDefault();
      jumpTo(activeIdx);
    } else if (e.key === 'Escape') {
      if (!panel.hidden) {
        e.preventDefault();
        close();
      } else if (input.value) {
        e.preventDefault();
        input.value = '';
      }
    }
  });

  // Mouse interaction with the dropdown.
  listEl.addEventListener('mousemove', function (e) {
    var li = e.target.closest('.cmd-result');
    if (!li) return;
    var idx = Array.prototype.indexOf.call(listEl.children, li);
    if (idx !== activeIdx) setActive(idx);
  });

  listEl.addEventListener('click', function (e) {
    var link = e.target.closest('.cmd-result-link');
    if (!link) return;
    // Let cmd/ctrl/middle-click open in new tab as normal; otherwise
    // intercept so we can close the dropdown after navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    // Default <a> click handles the scroll; just tidy up the UI.
    setTimeout(close, 0);
  });

  // Click outside the wrap closes the dropdown.
  document.addEventListener('click', function (e) {
    if (panel.hidden) return;
    if (e.target.closest('.cmd-search-wrap')) return;
    close();
  });
})();
