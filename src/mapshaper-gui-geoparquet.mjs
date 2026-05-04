import * as hyparquet from 'hyparquet';
import * as hyparquetCompressors from 'hyparquet-compressors';
import * as hyparquetWriter from 'hyparquet-writer';
import * as zstdCodec from 'zstd-codec';

window.modules = window.modules || {};
window.modules.hyparquet = hyparquet;
window.modules['hyparquet-compressors'] = hyparquetCompressors;
window.modules['hyparquet-writer'] = hyparquetWriter;
window.modules['zstd-codec'] = zstdCodec;
