
map:
	mapshaper countyp010.shp name=counties \
		-filter 'STATE_FIPS < 72' \
		-filter 'COUNTY != ""' \
		-dissolve FIPS copy-fields=STATE \
		-simplify 2% \
		-proj albersusa \
		-points inner + name=points \
		-i 2012-president-general-counties.csv string-fields=fips name=data \
		-filter-fields fips,votes,obama,romney \
		-each 'margin = obama - romney' \
		-each 'absmargin = Math.abs(margin)' \
		-join target=points data keys=FIPS,fips \
		-sort absmargin descending \
		-svg-style r='Math.sqrt(absmargin) * 0.02' \
		-svg-style opacity=0.5 fill='margin > 0 ? "#0061aa" : "#cc0000"' \
		-lines STATE target=counties \
		-svg-style stroke="#ddd" where='TYPE == "inner"' \
		-svg-style stroke="#777" where='TYPE == "outer"' \
		-svg-style stroke="#999" where='TYPE == "STATE"' \
		-o map.svg target=counties,points