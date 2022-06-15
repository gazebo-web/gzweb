// rollup.config.js
// import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import babel from '@rollup/plugin-babel';

export default {
  input: 'tsc-out/src/gzweb.js',
  external: [
    'eventemitter2',
    'protobufjs',
    'rxjs',
  ],
  output: [
    {
      file: 'dist/gzweb.js',
      format: 'umd',
      name: 'gzweb',
      globals: {
        eventemitter2: 'eventemitter2',
        protobufjs: 'protobufjs',
        rxjs: 'rxjs',
      }
    },
    {
      file: 'dist/gzweb.min.js',
      format: 'umd',
      name: 'gzweb',
      plugins: [terser()],
      globals: {
        eventemitter2: 'eventemitter2',
        protobufjs: 'protobufjs',
        rxjs: 'rxjs',
      }
    }
  ],

  plugins: [babel({ babelHelpers: 'bundled' })]
};
