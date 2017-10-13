
function CatalogControl(catalog, onSelect) {
  var el = El('#file-catalog');
  var cols = catalog.cols,
      enabled = true,
      items = catalog.items,
      n = items.length,
      row = 0,
      html;

  this.enable = function() {enabled = true;};

  if (n > 0 === false) {
    console.error("Catalog is missing array of items");
    return;
  }

  El('body').addClass('catalog-mode');

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
  el.node().innerHTML = html;
  Elements('#file-catalog td').forEach(function(el, i) {
    el.on('click', function() {
      selectItem(i);
    });
  });

  function renderRow(items) {
    var tds = items.map(function(o, col) {
      var i = row * cols + col;
      return renderCell(o, i);
    });
    return '<tr>' + tds.join('') + '</tr>';
  }

  function selectItem(i) {
    var item = items[i];
    var path = getBaseUrl() + (item.url || '');
    var urls = item.files.map(function(file) {
      return path + file;
    });
    if (enabled) {
      // handle multiple clicks
      enabled = false;
      onSelect(urls);
    }
  }

  function renderCell(item, i) {
    var template = '<td data-id="%d"><h4 class="title">%s</h4><div class="subtitle">%s</div></td>';
    return utils.format(template, i, item.title, item.subtitle || '');
  }

  function getBaseUrl() {
    return window.location.href.toString().replace(/[?#].*/, '').replace(/\/$/, '') + '/';
  }

}
