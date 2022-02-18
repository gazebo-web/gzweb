const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'production',
  output: {
    filename: 'gz3d.min.js',
  },
  optimization: {
    minimize: true,
    chunkIds: 'named',
  },
  performance: {
    hints: false,
  }
});
