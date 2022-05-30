
import { stopJob } from '../mapshaper-control-flow';
import cmd from '../mapshaper-cmd';

cmd.stop = function(job) {
  stopJob(job);
};
