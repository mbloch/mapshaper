

export function commandTakesFileInput(name) {
  return (name == 'i' || name == 'join' || name == 'erase' || name == 'clip' || name == 'include');
}

// TODO: implement these and other functions
// TODO: move this info into individual command definitions (to make
//   commands more modular and support a future plugin system)

// export function commandMayRemoveArcs(cmd) {

// }

// export function commandMayChangeArcs(cmd) {
//   // return arcsMayHaveChanged({[cmd]: true});
// }

// export function arcsMayNeedCleanup(flags) {
//   return flags.clip || flags.erase || flags.slice || flags.rectangle || flags.buffer ||
//   flags.union || flags.clean || flags.drop || false;
// }

// export function arcsMayBeChanged(flags) {
//   return arcsMayNeedCleanup(flags) || flags.proj || flags.simplify ||
//     flags.simplify_method || flags.arc_count || flags.repair || flags.affine ||
//     flags.mosaic || flags.snap;
// }
