### Introduction

This directory contains a reduced build of d3 that includes functions for
parsing and formatting delimited text files.

Public functions:

* d3.dsv.parse()
* d3.dsv.format()
* d3.dsv.parseRows()
* d3.dsv.formatRows()

### Instructions for building

1. Edit d3/dsv/dsv.js to remove xhr dependency (modified file is named `dsv_noxhr.js` below).
2. Download d3 source code and the `smash` tool.
3. Use `smash` to build reduced d3 (change paths as needed).
```
./smash/smash d3/src/start.js d3/src/dsv/dsv_noxhr.js d3/src/end.js > d3-dsv.js
```
