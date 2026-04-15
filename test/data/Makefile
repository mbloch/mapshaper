
.PHONY: svg

svg:
	mapshaper two_states.json  name=states \
	-proj lcc \
	-style fill='#eee' \
	-points inner + name=bubbles \
	-style fill=magenta fill-opacity=0.5 stroke=magenta stroke-width=1.2 r=30 \
	-target states \
	-lines + name=lines \
	-style stroke=black stroke-opacity=0.2 \
	-target states \
	-points inner + name=labels \
	-style label-text=STATE_NAME text-anchor=middle dy=3 fill=black font-size=13 \
	-target '*' \
	-o svg/two_states.svg