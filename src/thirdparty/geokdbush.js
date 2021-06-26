/*
ISC License

Copyright (c) 2017, Vladimir Agafonkin

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/

import TinyQueue from 'tinyqueue';

var earthRadius = 6371;
var rad = Math.PI / 180;

export function around(index, lng, lat, maxResults, maxDistance, predicate) {
    var maxHaverSinDist = 1, result = [];

    if (maxResults === undefined) maxResults = Infinity;
    if (maxDistance !== undefined) maxHaverSinDist = haverSin(maxDistance / earthRadius);

    // a distance-sorted priority queue that will contain both points and kd-tree nodes
    var q = new TinyQueue([], compareDist);

    // an object that represents the top kd-tree node (the whole Earth)
    var node = {
        left: 0, // left index in the kd-tree array
        right: index.ids.length - 1, // right index
        axis: 0, // 0 for longitude axis and 1 for latitude axis
        dist: 0, // will hold the lower bound of children's distances to the query point
        minLng: -180, // bounding box of the node
        minLat: -90,
        maxLng: 180,
        maxLat: 90
    };

    var cosLat = Math.cos(lat * rad);
    var right, left, item;

    while (node) {
        right = node.right;
        left = node.left;

        if (right - left <= index.nodeSize) { // leaf node

            // add all points of the leaf node to the queue
            for (var i = left; i <= right; i++) {
                item = index.points[index.ids[i]];
                if (!predicate || predicate(item)) {
                    q.push({
                        i: index.ids[i],
                        item: item,
                        dist: haverSinDist(lng, lat, index.coords[2 * i], index.coords[2 * i + 1], cosLat)
                    });
                }
            }

        } else { // not a leaf node (has child nodes)

            var m = (left + right) >> 1; // middle index
            var midLng = index.coords[2 * m];
            var midLat = index.coords[2 * m + 1];

            // add middle point to the queue
            item = index.points[index.ids[m]];
            if (!predicate || predicate(item)) {
                q.push({
                    i: index.ids[m],
                    item: item,
                    dist: haverSinDist(lng, lat, midLng, midLat, cosLat)
                });
            }

            var nextAxis = (node.axis + 1) % 2;

            // first half of the node
            var leftNode = {
                left: left,
                right: m - 1,
                axis: nextAxis,
                minLng: node.minLng,
                minLat: node.minLat,
                maxLng: node.axis === 0 ? midLng : node.maxLng,
                maxLat: node.axis === 1 ? midLat : node.maxLat,
                dist: 0
            };
            // second half of the node
            var rightNode = {
                left: m + 1,
                right: right,
                axis: nextAxis,
                minLng: node.axis === 0 ? midLng : node.minLng,
                minLat: node.axis === 1 ? midLat : node.minLat,
                maxLng: node.maxLng,
                maxLat: node.maxLat,
                dist: 0
            };

            leftNode.dist = boxDist(lng, lat, cosLat, leftNode);
            rightNode.dist = boxDist(lng, lat, cosLat, rightNode);

            // add child nodes to the queue
            q.push(leftNode);
            q.push(rightNode);
        }

        // fetch closest points from the queue; they're guaranteed to be closer
        // than all remaining points (both individual and those in kd-tree nodes),
        // since each node's distance is a lower bound of distances to its children
        while (q.length && q.peek().item) {
            var candidate = q.pop();
            if (candidate.dist > maxHaverSinDist) return result;
            // result.push(candidate.item);
            result.push(candidate.i);
            if (result.length === maxResults) return result;
        }

        // the next closest kd-tree node
        node = q.pop();
    }

    return result;
}

// lower bound for distance from a location to points inside a bounding box
function boxDist(lng, lat, cosLat, node) {
    var minLng = node.minLng;
    var maxLng = node.maxLng;
    var minLat = node.minLat;
    var maxLat = node.maxLat;

    // query point is between minimum and maximum longitudes
    if (lng >= minLng && lng <= maxLng) {
        if (lat < minLat) return haverSin((lat - minLat) * rad);
        if (lat > maxLat) return haverSin((lat - maxLat) * rad);
        return 0;
    }

    // query point is west or east of the bounding box;
    // calculate the extremum for great circle distance from query point to the closest longitude;
    var haverSinDLng = Math.min(haverSin((lng - minLng) * rad), haverSin((lng - maxLng) * rad));
    var extremumLat = vertexLat(lat, haverSinDLng);

    // if extremum is inside the box, return the distance to it
    if (extremumLat > minLat && extremumLat < maxLat) {
        return haverSinDistPartial(haverSinDLng, cosLat, lat, extremumLat);
    }
    // otherwise return the distan e to one of the bbox corners (whichever is closest)
    return Math.min(
        haverSinDistPartial(haverSinDLng, cosLat, lat, minLat),
        haverSinDistPartial(haverSinDLng, cosLat, lat, maxLat)
    );
}

function compareDist(a, b) {
    return a.dist - b.dist;
}

function haverSin(theta) {
    var s = Math.sin(theta / 2);
    return s * s;
}

function haverSinDistPartial(haverSinDLng, cosLat1, lat1, lat2) {
    return cosLat1 * Math.cos(lat2 * rad) * haverSinDLng + haverSin((lat1 - lat2) * rad);
}

function haverSinDist(lng1, lat1, lng2, lat2, cosLat1) {
    var haverSinDLng = haverSin((lng1 - lng2) * rad);
    return haverSinDistPartial(haverSinDLng, cosLat1, lat1, lat2);
}

export function distance(lng1, lat1, lng2, lat2) {
    var h = haverSinDist(lng1, lat1, lng2, lat2, Math.cos(lat1 * rad));
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function vertexLat(lat, haverSinDLng) {
    var cosDLng = 1 - 2 * haverSinDLng;
    if (cosDLng <= 0) return lat > 0 ? 90 : -90;
    return Math.atan(Math.tan(lat * rad) / cosDLng) / rad;
}
