/*
 * HTTP If-Range header parser.
 *
 * Exports the single entry point parseIfRange plus the value-shaping
 * classifier KIND, so consumers that prefer switch-style handling can
 * branch on the same constants the library uses internally.
 */
export { parseIfRange, KIND } from './core.js';
