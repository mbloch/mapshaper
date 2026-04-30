# Per-example asset builds for the docs site.
#
# Each example is one short target. Mapshaper's CLI stacks multiple `-o`
# commands, so the recipe's own `-o <slug>.svg` and the trailing
# `-o <slug>.msx` here both fire from a single mapshaper invocation -- no
# need to run mapshaper twice. The .zip bundles the raw input files so
# readers can reproduce the example end-to-end.
#
# Add a new example by:
#   1. dropping <slug>.txt + source data into this directory
#   2. appending a target below following the globe pattern
#   3. adding the slug to `EXAMPLES`

EXAMPLES := globe us-states ny-state

all: $(EXAMPLES)

clean:
	rm -f $(addsuffix .svg,$(EXAMPLES)) \
	      $(addsuffix .msx,$(EXAMPLES)) \
	      $(addsuffix .zip,$(EXAMPLES))

globe:
	mapshaper globe.txt -o globe.msx
	rm -f globe.zip && zip globe.zip ne_50m_admin_0_countries.geojson

us-states:
	mapshaper us-states.txt -o us-states.msx
	rm -f us-states.zip && zip us-states.zip ne_50m_admin_1_states_provinces_lakes.geojson

ny-state:
	mapshaper ny-state.txt -o ny-state.msx
	rm -f ny-state.zip && zip ny-state usa_can_admin1_lakes.geojson usa_can_roads.geojson



.PHONY: all clean $(EXAMPLES)
