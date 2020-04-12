import { utils } from './gui-core';

export function CatalogControl(gui, catalog, onSelect) {
  var self = this,
      container = gui.container.findChild('.file-catalog'),
      cols = catalog.cols,
      enabled = true,
      items = catalog.items,
      n = items.length,
      row = 0,
      html, rows;

  this.reset = function() {
    enabled = true;
    container.removeClass('downloading');
    this.progress(-1);
  };

  this.progress = function() {}; // set by click handler

  if (n > 0 === false) {
    console.error("Catalog is missing array of items");
    return;
  }

  gui.container.addClass('catalog-mode');

  if (!cols) {
    cols = Math.ceil(Math.sqrt(n));
  }
  rows = Math.ceil(n / cols);

  html = '<table>';
  if (catalog.title) {
    html += utils.format('<tr><th colspan="%d"><h4>%s</h4></th></tr>', cols, catalog.title);
  }
  while (row < rows) {
    html += renderRow(items.slice(row * cols, row * cols + cols));
    row++;
  }
  html += '</table>';
  container.node().innerHTML = html;
  gui.container.findChildren('.file-catalog td').forEach(function(el, i) {
    el.on('click', function() {
      selectItem(el, i);
    });
  });

  // Generate onprogress callback to show a progress indicator
  function getProgressFunction(el) {
    var visible = false,
        i = 0;
    return function(pct) {
      i++;
      if (i == 2 && pct < 0.5) {
        // only show progress bar if file will take a while to load
        visible = true;
      }
      if (pct == -1) {
        // kludge to reset progress bar
        el.removeClass('downloading');
        pct = 0;
      }
      if (visible) {
        el.css('background-size', (Math.round(pct * 100) + '% 100%'));
      }
    };
  }

  function renderRow(items) {
    var tds = items.map(function(o, col) {
      var i = row * cols + col;
      return renderCell(o, i);
    });
    return '<tr>' + tds.join('') + '</tr>';
  }

  function selectItem(el,i) {
    var pageUrl = window.location.href.toString().replace(/[?#].*/, '').replace(/\/$/, '') + '/';
    var item = items[i];
    var urls = item.files.map(function(file) {
      var url = (item.url || '') + file;
      if (/^http/.test(url) === false) {
        // assume relative url
        url = pageUrl + '/' + url;
      }
      return url;
    });
    if (enabled) { // only respond to first click
      self.progress = getProgressFunction(el);
      el.addClass('downloading');
      container.addClass('downloading');
      enabled = false;
      onSelect(urls);
    }
  }

  function renderCell(item, i) {
    var template = '<td data-id="%d"><h4 class="title">%s</h4><div class="subtitle">%s</div></td>';
    return utils.format(template, i, item.title, item.subtitle || '');
  }

}
