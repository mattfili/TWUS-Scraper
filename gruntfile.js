module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    autoprefixer: {
      main: {
        options: ['>1% in US'],
        src: 'public/css/main.css'
      }
    },
    babel: {
      dev: {
        options: {
          sourceMap: 'inline'
        },
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: ['**/*.js'],
            dest: 'public/'
          }
        ]
      },
      prod: {
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: ['**/*.js'],
            dest: 'public/'
          }
        ]
      }
    },
    bower_concat: {
      main: {
        dest: 'public/lib/build.js',
        cssDest: 'public/lib/build.css',
        mainFiles: {
          bootstrap: [ 'dist/css/bootstrap.min.css', 'dist/js/bootstrap.min.js' ]
        }
      }
    },
    clean: ['public'],
    copy: {
      main: {
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: [
              '**',
              '**/*.jpg',
              '!**/*.jade',
              '!**/*.scss',
              '!**/*.css',
              '!**/*.js'
            ],
            dest: 'public/',
            filter: 'isFile'
          }
        ]
      }
    },
    cssmin: {
      main: {
        files: {
          'public/css/main.css': 'public/css/main.css'
        }
      }
    },
    jade: {
      dev: {
        options: {
          pretty: true
        },
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: ['**/*.jade', '!**/_*.jade'],
            dest: 'public/',
            ext: '.html'
          }
        ]
      },
      prod: {
        files: [
          {
            expand: true,
            cwd: 'src/',
            src: ['**/*.jade', '!**/_*.jade'],
            dest: 'public/',
            ext: '.html'
          }
        ]
      }
    },
    sass: {
      prod: {
        options: {
          outputStyle: 'compressed'
        },
        files: {
          'public/css/main.css': 'src/scss/main.scss'
        }
      },
      dev: {
        options: {
          sourceMap: true,
          sourceMapEmbed: true
        },
        files: {
          'public/css/main.css': 'src/scss/main.scss',
          'public/lib/build.css': 'src/css/main.css'
        }
      }
    },
    uglify: {
      bower: {
        files: {
          'public/lib/build.js': 'public/lib/build.js'
        }
      },
      main: {
        files: [
          {
            expand: true,
            cwd: 'public/',
            src: ['**/*.js'],
            dest: 'public/'
          }
        ]
      }
    },
    watch: {
      livereload: {
        options: {
          livereload: true
        },
        files: [
          'app.js',
          'routes/*.js',
          'public/css/main.css',
          'public/scripts/**/*.js',
          'public/**/*.html'
        ]
      },
      jade: {
        files: ['src/**/*.jade'],
        tasks: ['jade:dev']
      },
      sass: {
        files: ['src/**/*.scss'],
        tasks: ['sass:dev', 'autoprefixer']
      },
      js: {
        files: ['src/scripts/**/*.js'],
        tasks: ['babel:dev']
      }
    },
    nodemon: {
      dev: {
        script: 'app.js'
      }
    },
    concurrent: {
      options: {
        logConcurrentOutput: true
      },
      tasks: ['nodemon', 'watch']
    },
    mocha: {
      all: {
        src: ['routes/tnt.spec.js'],
      },
      options: {
        run: true
      }
    }
  });

  grunt.registerTask('test', [
    'mocha'
  ])

  grunt.registerTask('build', [
    'clean',
    'copy',
    'babel:prod',
    'bower_concat',
    'jade:prod',
    'sass:prod',
    'autoprefixer',
    'uglify',
    'cssmin'
  ]);
  grunt.registerTask('build-dev', [
    'clean',
    'copy',
    'sass:dev',
    'babel:dev',
    'bower_concat',
    'jade:dev',
    'autoprefixer'
  ]);

  grunt.registerTask('serve', [
    'build-dev',
    'concurrent'
  ]);

};