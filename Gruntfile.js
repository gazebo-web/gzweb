module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
      // All gz*.js files
      build_src: {
        src: [
          'src/*.js'
        ],
        dest: 'dist/gz3d.src.js'
      },
      // All src except for GUI-related
      // All needed dependencies
      build_gz3d: {
        src: [
          'include/three.js',
          'include/three.compat.js',
          'include/*.js',
          '!include/three.min.js',
          '!include/stats.min.js',
          '!include/roslib.min.js',
          '!include/jquery-1.9.1.js',
          '!include/jquery.mobile-1.4.0.min.js',
          '!include/angular.min.js',
          '!include/',
          'src/gz*.js',
          '!src/gzgui.js',
          '!src/gzlogplay.js',
          '!src/gzradialmenu.js',
        ],
        dest: 'dist/gz3d.js'
      },
      // * All src including GUI
      // * All needed dependencies
      build_gui: {
        src  : ['include/three.js',
                'include/three.compat.js',
                'include/*.js',
                '!include/three.min.js',
                '!include/stats.min.js',
                '!include/roslib.min.js',
                '!include/',
                'src/gz*.js',
        ],
        dest : 'dist/gz3d.gui.js'
      }
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      files: [
        'Gruntfile.js',
        'dist/gz3d.src.js'
      ]
    },
    uglify: {
      options: {
        report: 'min'
      },
      build_src: {
        src: 'dist/gz3d.js',
        dest: 'dist/gz3d.min.js'
      },
      build_gz3d: {
        src: 'dist/gz3d.js',
        dest: 'dist/gz3d.min.js'
      },
      build_gui: {
        src: 'dist/gz3d.gui.js',
        dest: 'dist/gz3d.gui.min.js'
      }
    },
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify-es');

  grunt.registerTask('build', ['concat', 'jshint', 'uglify']);
};
