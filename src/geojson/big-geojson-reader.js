const fs = require('fs')
import { verbose, printError, error } from '../utils/mapshaper-logging'
import { T } from '../utils/mapshaper-timing'

const SQUARE_BRACKET_OPEN = new Uint8Array(Buffer.from('[', 'utf-8'))[0]
const SQUARE_BRACKET_CLOSE = new Uint8Array(Buffer.from(']', 'utf-8'))[0]
const SPACE = new Uint8Array(Buffer.from(' ', 'utf-8'))[0]
const COMMA = new Uint8Array(Buffer.from(',', 'utf-8'))[0]
const NEW_LINE = 10
const NUMBER = new Uint8Array(Buffer.from('0123456789.', 'utf-8'))

// rewrite of: nullish coalescing operator '??'
// because mocha test doesn't know it yet
const nco = (a,b) => (a !== null && a !== undefined) ? a : b

/**
 * Wrapper class over a two dimensional array, which mimics to be a one dimensional array.
 * (So we can have arrays longer than max array length.)
 */
class MyBigArray {
  constructor (options = { chunkSize: 10000000 }) {
    this.chunkSize = options.chunkSize
    this.mainArr = [[]]
    this.length = 0
  }

  push (e) {
    if (this.mainArr[this.mainArr.length - 1].length < this.chunkSize) {
      this.mainArr[this.mainArr.length - 1].push(e)
    } else {
      this.mainArr.push([e])
    }
    this.length++
  }

  get (i = 0) {
    const chunkNo = Math.floor(i / this.chunkSize)
    const indexInChunk = i - (chunkNo * this.chunkSize)
    return this.mainArr[chunkNo][indexInChunk]
  }
}

/**
 * Wrapper class over an array of buffers, which mimics to be one big buffer.
 * (To tackle the problem of max buffer size = 2GB)
 */
class MyBigBuffer {
  constructor (options = { chunkSize: 250000000 }) {
    this.chunkSize = options.chunkSize
    this.bufferArr = []
    this.uint8Arr = []
    this.length = 0
  }

  /**
   * Reads provided file into an array of buffers.
   * @param {String} geoJsonPath
   */
  load (geoJsonPath = '') {
    const size = fs.statSync(geoJsonPath).size
    const fd = fs.openSync(geoJsonPath, 'r')

    for (let i = 0; i < size; i += this.chunkSize) {
      const bufferSize = size - i < this.chunkSize ? size - i : this.chunkSize
      const chunk = Buffer.alloc(bufferSize)

      fs.readSync(fd, chunk, 0, bufferSize, i)

      this.bufferArr.push(chunk)
      this.uint8Arr.push(new Uint8Array(chunk))
      this.length += chunk.length
    }
  }

  /**
   * Returns byte (Uint8) at position i
   * @param {Number} i 
   */
  get (i = 0) {
    const chunkNo = Math.floor(i / this.chunkSize)
    const indexInChunk = i - (chunkNo * this.chunkSize)

    return this.uint8Arr[chunkNo][indexInChunk]
  }

  /**
   * Checks if this big buffer contains the provided string,
   * at the provided position start.
   * @param {Uint8Array} stringUint8Array string in uint8 array
   * @param {Number} start start index in this big buffer
   */
  checkStringMatch (stringUint8Array, start) {
    if (stringUint8Array.length + start > this.length - 1) return false
    for (let i = start; i < start + stringUint8Array.length; i++) {
      if (this.get(i) !== stringUint8Array[i - start]) return false
    }
    return true
  }

  /**
   * finds occurrences of the provided chars/strings in byte format
   * @param {Array.Uint8Array} arr array of Uint8Array
   */
  findOccurrences (arr = [new Uint8Array(Buffer.from('{'))]) {
    const singleByteElements = arr.filter(e => e.length > 0 && e.length < 2).map(e => e[0])
    const multiByteElements = arr.filter(e => e.length > 1)

    const occurrences = []
    arr.forEach(() => { occurrences.push(new MyBigArray()) })

    /* eslint no-labels: ["error", { "allowLoop": true }] */
    bufferIteration:
    for (let i = 0; i < this.length; i++) {
      const chunkNo = Math.floor(i / this.chunkSize)
      const indexInChunk = i - (chunkNo * this.chunkSize)

      for (let j = 0; j < singleByteElements.length; j++) {
        if (singleByteElements[j] === this.uint8Arr[chunkNo][indexInChunk]) {
          occurrences[j].push(i)
          continue bufferIteration
        }
      }

      for (let j = 0; j < multiByteElements.length; j++) {
        if (multiByteElements[j][0] === this.uint8Arr[chunkNo][indexInChunk]) {
          if (this.checkStringMatch(multiByteElements[j], i)) {
            occurrences[j + singleByteElements.length].push(i)
            i += multiByteElements[j].length - 1
            continue bufferIteration
          }
        }
      }
    }

    return occurrences
  }

  /**
   * Returns the slice of the range defined by the provided indices in string format
   * @param {Number} start inclusive index
   * @param {Number} end inclusive index
   */
  sliceToString (start, end) {
    end += 1
    const startChunkNo = Math.floor(start / this.chunkSize)
    const startIndexInChunk = start - (startChunkNo * this.chunkSize)
    const endChunkNo = Math.floor(end / this.chunkSize)
    const endIndexInChunk = end - (endChunkNo * this.chunkSize)

    let string

    if (startChunkNo === endChunkNo) {
      // if start and end are in one an the same chunk

      string = this.bufferArr[startChunkNo].slice(startIndexInChunk, endIndexInChunk).toString()
    } else if (endChunkNo - startChunkNo === 1) {
      // if start and end are in two consecutively chunks

      const firstPart = this.bufferArr[startChunkNo].slice(startIndexInChunk)
      const lastPart = this.bufferArr[endChunkNo].slice(0, endIndexInChunk)
      string = Buffer.concat([firstPart, lastPart]).toString()
    } else {
      // if start and end span over more than two chunks

      const firstPart = this.bufferArr[startChunkNo].slice(startIndexInChunk)
      const lastPart = this.bufferArr[endChunkNo].slice(0, endIndexInChunk)

      const parts = [firstPart]
      for (let i = startChunkNo + 1; i < endChunkNo - 1; i++) {
        parts.push(this.bufferArr[i].slice(0, this.chunkSize))
      }
      parts.push(lastPart)

      string = Buffer.concat(parts).toString()
    }

    return string
  }

  /**
   * Parses multiple slices of this buffer to one JSON.
   * @param {Array} arr [{ start: 0, end: 10}, { start: 15, end: 20}]
   */
  multiSlicesToJSON (arr) {
    let string = ''
    let json

    for (const elem of arr) {
      string += this.sliceToString(elem.start, elem.end)
    }

    try {
      json = JSON.parse(string)
    } catch (error) {
      printError(`Failed to parse string to json: ${string}`)
      error(error)
    }

    return json
  }

  /**
   * Returns the slice of the range defined by the provided indices in JSON format
   * @param {Number} start index inclusive
   * @param {Number} end index inclusive
   */
  sliceToJSON (start, end) {
    const string = this.sliceToString(start, end)
    let json

    try {
      json = JSON.parse(string)
    } catch (error) {
      printError(`Failed to parse string to json: ${string}`)
      error(error)
    }

    return json
  }

  /**
   * Parses an arbitrarily nested array of numbers iteratively from this buffer.
   * @param {Number} start index inclusive
   * @param {Number} end index inclusive
   */
  parseNumberArray (start, end) {
    let result
    const stack = []

    // iterate over all bytes of provided buffer range
    for (let i = start; i <= end; i++) {
      // get byte at position i
      const n = this.get(i)
      if (n === SPACE || n === NEW_LINE || n === COMMA) continue
      else if (n === SQUARE_BRACKET_OPEN) {
        // if byte is square bracket open: add new array to stack
        stack.push([])
      } else if (n === SQUARE_BRACKET_CLOSE) {
        /*
        if byte is close square bracket: pop last array from stack:
          if there are still elements in the stack: add the popped array into the last array on the stack
          if the stack is empty: it has to be the end of the most outer array: set result variable
        */
        const lastElem = stack.pop()
        if (stack.length > 0) {
          stack[stack.length - 1].push(lastElem)
        } else if (stack.length === 0 && i === end) {
          result = lastElem
        } else {
          error('Unexpected array closing.')
        }
      } else if (NUMBER.includes(n)) {
        // find start and end index of number in buffer
        let endIndex = i
        while (endIndex <= end && NUMBER.includes(this.get(endIndex))) endIndex++
        // revert last iteration of while
        endIndex--
        // parse number from string from buffer slice
        const num = Number(this.sliceToString(i, endIndex))

        // there has to be an array on the stack, which contains the just parsed number
        if (stack.length > 0) {
          stack[stack.length - 1].push(num)
        } else {
          error('Found number at unexpected position in array.')
        }

        // move i to end of number
        i = endIndex
      } else {
        error(`Found unexpected byte in number array: ${n}`)
      }
    }

    return result
  }
}

export class BigGeoJSONReader {
  /**
   * @param {Number} options.maxDirectJsonParseByteCount How long a feature can be in bytes so that it is parsed directly to json.
   * @param {Number} options.bufferChunkSize In how big chunks the geojson file should be read.
   */
  constructor (options = { maxDirectJsonParseByteCount: 250000000, bufferChunkSize: 250000000 }) {
    this.bigBuffer = new MyBigBuffer({ chunkSize: options.bufferChunkSize })
    this.features = []
    this.maxDirectJsonParseByteCount = options.maxDirectJsonParseByteCount
  }

  loadGeoJSONFile (file) {
    const toFind = [
      new Uint8Array(Buffer.from('{', 'utf-8')),
      new Uint8Array(Buffer.from('}', 'utf-8')),
      new Uint8Array(Buffer.from('[', 'utf-8')),
      new Uint8Array(Buffer.from(']', 'utf-8')),
      new Uint8Array(Buffer.from('Feature"', 'utf-8'))
    ]

    // load file into chunks of Buffer objects
    this.bigBuffer.load(file)

    T.start()
    // find occurrences of specific chars / words
    const occ = this.bigBuffer.findOccurrences(toFind)
    T.stop('find occurrences')

    T.start()
    // array of indices of '{' char
    const curvedBracketsOpen = occ[0]
    // array of indices of '}' char
    const curvedBracketsClose = occ[1]
    // array of indices of '[' char
    const squareBracketOpen = occ[2]
    // array of indices of ']' char
    const squareBracketClose = occ[3]
    // array of starting indices of string: 'Feature"'
    const feature = occ[4]

    // simple stack to keep track of opened objects/arrays
    const stack = []

    // array to save starting and end indices of all features in the bigBuffer
    this.features = []

    // control variables to save current position of every index-array
    let curvedBracketsOpenIndex = 0
    let curvedBracketsCloseIndex = 0
    let squareBracketOpenIndex = 0
    let squareBracketCloseIndex = 0
    let featureIndex = 0

    /*
    While there are still unviewd Objects/Arrays
    */
    while (curvedBracketsOpenIndex < curvedBracketsOpen.length ||
          curvedBracketsCloseIndex < curvedBracketsClose.length ||
          squareBracketOpenIndex < squareBracketOpen.length ||
          squareBracketCloseIndex < squareBracketClose.length) {
      /*
      Find the next nearest index of char,
      from our bucket of chars. ('{', '}', '[', ']', 'Feature"')
      */
      const min = Math.min(nco(curvedBracketsOpen.get(curvedBracketsOpenIndex), Infinity),
        nco(curvedBracketsClose.get(curvedBracketsCloseIndex), Infinity),
        nco(squareBracketOpen.get(squareBracketOpenIndex), Infinity),
        nco(squareBracketClose.get(squareBracketCloseIndex), Infinity),
        nco(feature.get(featureIndex), Infinity))

      if (curvedBracketsOpen.get(curvedBracketsOpenIndex) === min) {
        // if the next char is a open curved bracket

        curvedBracketsOpenIndex++
        stack.push({ char: '{', index: min })
      } else if (curvedBracketsClose.get(curvedBracketsCloseIndex) === min) {
        // if the next char is a close curved bracket

        if (stack.length > 0 && stack[stack.length - 1].char === '{') {
          curvedBracketsCloseIndex++

          // double bang: get always an boolean; (undefined=false)
          const isFeature = !!stack[stack.length - 1].isFeature
          const coordinates = stack[stack.length - 1].coordinates

          // last element on stack is '{': object-start
          const start = stack.pop().index

          // if object is a feature, save feature start & end indices as well as the start and end indices of the coordinates array of the feature
          if (isFeature) {
            this.features.push({ start: start, end: min, coordinates: { start: coordinates[0], end: coordinates[1] } })
          }
        } else {
          error('Unexpectd "}" character')
        }
      } else if (squareBracketOpen.get(squareBracketOpenIndex) === min) {
        // if the next char is a open square bracket

        // ignore indices of arrays in arrays
        // (nested coordinates array: we only have to save the indices of the most outer array)
        if (stack.length > 0 && stack[stack.length - 1].char === '[') {
          squareBracketOpenIndex++
          squareBracketCloseIndex++
        } else {
          stack.push({ char: '[', index: min })
          squareBracketOpenIndex++
        }
      } else if (squareBracketClose.get(squareBracketCloseIndex) === min) {
        // if the next char is a close square bracket

        if (stack.length > 0 && stack[stack.length - 1].char === '[') {
          squareBracketCloseIndex++
          // get start index of array
          const start = stack.pop().index
          // if there is a feature object on the stack; add coordinates array start & end indices to it
          for (let i = stack.length - 1; i > -1; i--) {
            if (stack[i].isFeature) {
              stack[i].coordinates = [start, min]
              break
            }
          }
        } else {
          // printError(stack)
          error('Unexpectd "]" character')
        }
      } else if (feature.get(featureIndex) === min) {
        // if the next char sequence is 'Feature"'

        if (stack.length > 0 && stack[stack.length - 1].char === '{') {
          featureIndex++
          // mark the uppermost element on the stack as feature
          stack[stack.length - 1].isFeature = true
        } else {
          error('Unexpected type: Feature property')
        }
      } else {
        error('Invalid Tree. Unexpected JSON control sequence.')
      }
    }
    T.stop('interpret occurrences')

    verbose(`Found ${this.features.length} features in ${file}.`)
  }

  /**
   * Parses the individual features of the FeatureCollection and yields them one by one.
   *
   * If the byte count of one feature is less than "maxDirectJsonParseByteCount" it directly converts
   * the byte range to a string and parses it to a json object.
   * Otherwise it parses the feature without the coordinates array and parses the coordinates separately and iteratively.
   * Then adds the seperately parsed coordinates array to the feature object.
   */
  * getFeatures () {
    if (this.features.length < 1) error('No geojson file was loaded!')

    // iterate over start/end indices of features
    for (const featureIndices of this.features) {
      const byteCount = featureIndices.end - featureIndices.start

      // if byte count is smaller than a certain threshold, then just parse the whole feature directly to json
      if (byteCount < this.maxDirectJsonParseByteCount) {
        const json = this.bigBuffer.sliceToJSON(featureIndices.start, featureIndices.end)
        yield json
      } else {
        // define buffer slices, to parse feature without the coordinates array
        const arr = [
          { start: featureIndices.start, end: featureIndices.coordinates.start },
          { start: featureIndices.coordinates.end, end: featureIndices.end }
        ]

        // parse feature without coordinates array to json
        const json = this.bigBuffer.multiSlicesToJSON(arr)

        // Math.pow(2, 20) = 1048576 = 1MB
        const coordinatesArrMB = Math.ceil((featureIndices.coordinates.end - featureIndices.coordinates.start) / Math.pow(2, 20))
        verbose(`Found big feature (${coordinatesArrMB}MB). Parse coordinates array iteratively.`)
        T.start()
        // parse coordinates array iteratively
        const coordinates = this.bigBuffer.parseNumberArray(featureIndices.coordinates.start, featureIndices.coordinates.end)
        T.stop('coordinates array parsed')

        json.geometry.coordinates = coordinates

        yield json
      }
    }
  }

  /**
   * Iterates over all features and calls the provided callback with each feature.
   * @param {function} cb callback
   */
  readObjects(cb) {
    for (const feature of this.getFeatures()) {
      cb(feature)
    }
  }
}