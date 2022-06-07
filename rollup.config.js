// rollup.config.js
// import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import babel from '@rollup/plugin-babel';

export default {
  input: 'tsc-out/src/gzweb.js',
  output: [
    {
      file: 'dist/gzweb.js',
      format: 'umd',
      name: 'gzweb',
    },
    {
      file: 'dist/gzweb.min.js',
      format: 'umd',
      name: 'gzweb',
      plugins: [terser()]
    }
  ],

  plugins: [babel({ babelHelpers: 'bundled' })]
};
