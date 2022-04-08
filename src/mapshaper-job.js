import { Catalog } from './dataset/mapshaper-catalog';

export function Job(catalog) {
	var job = {
    catalog: catalog || new Catalog(),
    defs: {},
    state: {}
	};

  return job;
}
