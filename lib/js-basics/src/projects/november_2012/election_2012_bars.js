/* @requires browser, elements */


function Bars(div, dataArr, labelTable, opts) {
  var totalValue = 538;
  var width = opts.width || 400;
  //var chartHeight = opts.chart_height || 40;

  var view = opts.view;


  var el = El(div); // .css('height',chartHeight);
  el.css('position:relative');

  var demSolidValue = dataArr[0];
  var demLeaningValue = dataArr[1];
  var repSolidValue = dataArr[4];
  var repLeaningValue = dataArr[3];

  var demValue = demSolidValue + demLeaningValue;
  var repValue = repSolidValue + repLeaningValue;

  if (view == 'votes') {
    demValue = demSolidValue;
    repValue = repSolidValue;
  }

  var middleValue = totalValue - demValue - repValue;

  var barWidth = width - 2; // 
  var halfWidth = width / 2;
  var demWidth = Math.round(demSolidValue / totalValue * barWidth);
  var repWidth = Math.round(repSolidValue / totalValue * barWidth);
  var demSolidWidth = Math.round(demSolidValue / totalValue * barWidth);
  var demLeaningWidth = Math.round(demLeaningValue / totalValue * barWidth);
  var repSolidWidth = Math.round(repSolidValue / totalValue * barWidth);
  var repLeaningWidth = Math.round(repLeaningValue / totalValue * barWidth);

  var demLeaningBg = 'nytg-dem-leaning-bg';
  var repLeaningBg = 'nytg-rep-leaning-bg';
  var otherBg = 'nytg-tossup-bg';
  if (opts.view != 'forecast') {
    demLeaningBg = 'nytg-dem-leading-bg';
    repLeaningBg = 'nytg-rep-leading-bg';
    otherBg = 'nytg-novotes-bg';
    demLeaningWidth = 0;
    repLeaningWidth = 0;
  }

  var otherWidth = Math.round(middleValue / totalValue * barWidth); // barWidth - repWidth - demWidth;

  trace("[Bars] data:", dataArr, "r d o widths:", repWidth, demWidth, otherWidth);

  // labels
  var labels = El('div').addClass('nytg-label-group').css('width', width).appendTo(el);

  var widthBreaks = [150, 180, 260, 330, 401, 550, 790];
  var i = Utils.getClassId(width, widthBreaks);
  
  var bigNumSizes = [11, 12, 15, 18, 22, 27, 34, 37];
  var midNumSizes = [0, 0, 0, 11, 12, 14, 18, 20];
  var textSizes = [8, 9, 9, 9, 10, 11, 12, 13];
  var smallLabelSizes = [0, 0, 0, 9, 10, 11, 12, 13];
  //var labelMarginTops = [3, 3, 6, 2, 0, 2, 6, 7];
  var labelMarginTops = [3, 2, 5, 2, 0, 2, 6, 7];
  var bigNumMarginTops = [0, 0, 0, 1, 1, 0, 0, 0];
  var barHeights = [6, 7, 7, 9, 10, 13, 15, 17];
  var bigNumMargins = [2, 2, 3, 3, 3, 4, 5, 6];
  var chartHeights = [36, 36, 40, 50, 55, 65, 77, 87]


  var votesTextSizes = [8, 9, 10, 11, 12, 13, 14, 15]
  var votesLabelMarginTops = [3, 2, 5, 2, 0, 2, 6, 7];


  var fontBoosts = {
    ar: 1.1,
    cn: 1.25
  };

  var smallLabelBoosts = {
    ar: 1.1,
    cn: 1.1
  };

  var bigNumMarginLangs = {
    cn: [0, 0, 0, 0, 0, 2, 3, 4]
  };

  var fonts = {
    cn: 'STHeiti'
  }

  var chartHeight = opts.chart_height || chartHeights[i];
  el.css('height', chartHeight);

  var fontFamily = fonts[opts.lang] || "Arial, Helvetica, sans-serif";
  El('body').css('font-family', fontFamily);

  var bigNumMarginTop = opts.lang in bigNumMarginLangs ? bigNumMarginLangs[opts.lang][i] : bigNumMarginTops[i];

  var fontBoost = fontBoosts[opts.lang] || 1;
  var smallLabelBoost = smallLabelBoosts[opts.lang] || 1;

  var bigNumberSize = bigNumSizes[i];
  var midNumberSize = midNumSizes[i];
  var labelMarginTop = view == 'votes' ? votesLabelMarginTops[i] : labelMarginTops[i];
  var textSize = Math.round((view == 'votes' ? votesTextSizes[i] : textSizes[i]) * fontBoost);
  var smallLabelSize = Math.round(textSizes[i] * smallLabelBoost);

  var barHeight = barHeights[i];
  var bigNumMargin = bigNumMargins[i];


  if (barWidth < 300) {
    labelTable.center = "";
    labelTable.note = "270";
  }



  var centerLabel = El('div').addClass('nytg-label-center').css('left', halfWidth)
    .child('div').css('font-size', midNumberSize).text(middleValue)
    .sibling('div').text(labelTable.center)
    .css('font-size', smallLabelSize)

    .parent().appendTo(labels);

  var demLabel = El('div')
    .addClass('nytg-label-left')
    .child('div')
    .addClass('nytg-big-number nytg-left-text')
    .css('font-size', bigNumberSize)
    .css('margin-right', bigNumMargin)
    .css('margin-top', bigNumMarginTop)
    .text(demValue)
    .sibling('div')
    .addClass('nytg-left-text')
    .css('margin-top', labelMarginTop)
    .css('font-size', textSize)
    .text(labelTable.left2 || labelTable.left)
    .parent().appendTo(labels);

  var repLabel = El('div')
    .addClass('nytg-label-right')
    .child('div')
    .addClass('nytg-big-number nytg-right-text')
    .css('font-size', bigNumberSize)
    .css('margin-left', bigNumMargin)
    .css('margin-top', bigNumMarginTop)
    .text(repValue)    
    .sibling('div')
    .addClass('nytg-right-text')
    .css('margin-top', labelMarginTop)
    .css('font-size', textSize)
   .text(labelTable.right2 || labelTable.right)
    .parent().appendTo(labels);

  labels.child('div').css("clear:both");


  // bars
  //var bars = Browser.createElement('div', '', 'nytg-bar-group');
  var bars = El('div').addClass('nytg-bar-group').css('height', chartHeight);


  el.appendChild(bars);
  //var demBar = Browser.createElement('div', 'width:' + demWidth + "px;", 'nytg-bar nytg-dem-bg');
  //var otherBar = Browser.createElement('div', 'width:' + otherWidth + "px;", 'nytg-bar nytg-other-bg');
  //var repBar = Browser.createElement('div', 'width:' + repWidth + "px;", 'nytg-bar nytg-rep-bg');
  var demBar = El('div')
    .css('width', demWidth)
    .css('height', barHeight)
    .addClass('nytg-bar nytg-dem-bg')
    .appendTo(bars);

  var demLeaningBar = El('div').css('width', demLeaningWidth).css('height', barHeight).addClass('nytg-bar').addClass(demLeaningBg).appendTo(bars);
  var otherBar = El('div').css('width', otherWidth).css('height', barHeight).addClass('nytg-bar').addClass(otherBg).appendTo(bars);
  var repLeaningBar = El('div').css('width', repLeaningWidth).css('height', barHeight).addClass('nytg-bar').addClass(repLeaningBg).appendTo(bars);
  var repBar = El('div').css('width', repWidth).css('height', barHeight).addClass('nytg-bar nytg-rep-bg').appendTo(bars);


  // midpoint ptr
  El('div').addClass('nytg-bars-ptr').css('top', -barHeight).css('height', barHeight + 5).css('margin-left', halfWidth-2).appendTo(bars);

  // note
  El('div').addClass("nytg-bars-ptr-label").css('width', barWidth)
    .css('top', -barHeight)
    .css('font-size', smallLabelSize)
    .text(labelTable.note).appendTo(bars);


  // legends
  //
  var legendHeights = [5, 6, 7, 9, 10, 10, 11, 11];
  var legendSize = legendHeights[i];

  var spaces = [1, 2, 2, 3, 3, 4, 4, 4];
  var vnudges = [-8, -5, -3, 0, -3, 2, 5, 5];
  var space = spaces[i];
  var margin = Utils.format("margin: 0 %spx %spx 0;", space, space);
  var vnudge = vnudges[i];

  if (view == 'votes') {
    var legend = El('div');
    var keyStr = labelTable.key;
    if (keyStr && barWidth > 350) {
      legend.child('div').addClass('nytg-legend-title').css('font-size', smallLabelSize).text(labelTable.key).css(margin).css("line-height:1;");
    }

    legend.child('div').addClass('nytg-legend-block nytg-dem-bg').css(margin).css('height', legendSize).css('width', legendSize);
    legend.child('div').addClass('nytg-legend-block nytg-rep-bg').css(margin).css('height', legendSize).css('width', legendSize);
    legend.child('div').addClass('nytg-legend-block nytg-legend-label').css(margin).css('font-size', smallLabelSize).text(labelTable.win);
    legend.child('br');
    legend.child('div').addClass('nytg-legend-block nytg-dem-leading-bg').css(margin).css('height', legendSize).css('width', legendSize);
    legend.child('div').addClass('nytg-legend-block nytg-rep-leading-bg').css(margin).css('height', legendSize).css('width', legendSize);
    legend.child('div').addClass('nytg-legend-block nytg-legend-label').css(margin).css('font-size', smallLabelSize).text(labelTable.lead);

    var boost = Math.round(barWidth * 0.01) + vnudge;
    var leftPos = Math.round(barWidth * 0.75) - 12;
    if (opts.lang == 'el') {
      leftPos -= 7;
    }
    legend.css('position:absolute').css('top', chartHeight + boost).css('left', leftPos);
    legend.appendTo(bars);


  }
  


}

