const VERBOSE = process.env.VERBOSE === 'true' || process.argv.includes('--verbose');

module.exports = {
  verbose: VERBOSE,
  log:   (...a) => { if (VERBOSE) console.log(...a); },
  info:  (...a) => console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};
