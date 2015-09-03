var chalk = require( 'chalk' )
var gutil = require( 'gulp-util' )
var http = require( 'http' )
var path = require( 'path' )
var Stream = require( 'stream' )
if ( !Object.assign ) {
  Object.defineProperty( Object, 'assign', {
    configurable: true
    , enumerable: false
    , value: function ( target ) {
      if ( target === undefined || target === null ) {
        throw new TypeError( 'Cannot convert first argument to object' )
      }
      var to = Object( target )
      var nextSource
      for ( var i = 1 ; i < arguments.length ; i++ ) {
        nextSource = arguments[i]
        if ( nextSource === undefined || nextSource === null ) {
          continue
        }
        nextSource = Object( nextSource )
        var keysArray = Object.keys( Object( nextSource ) )
        keysArray.forEach( assignKey )
      }
      function assignKey( e, i, a ) {
        var nextKey = a[i]
        var desc = Object.getOwnPropertyDescriptor( nextSource, nextKey )
        if ( desc !== undefined && desc.enumerable ) {
          to[nextKey] = nextSource[nextKey]
        }
      }
      return to
    }
    , writable: true
  } )
}
var underscore = {
  extend: function () {
    return Object.assign.apply( null, arguments )
  }
}
var url = require( 'url' )
var xml2js = require( 'xml2js' )

const PLUGIN_NAME = 'gulp-webdav-sync'
var stream
var _options

module.exports = function () {
  var _string
  _options = {
    'agent': false
    , 'clean': false
    , 'log': 'error'
    , 'logAuth': false
    , 'parent': process.cwd()
  }
  for ( var i in arguments ) {
    if ( typeof arguments[i] === 'string' ) {
      _string = arguments[i]
    }
    if ( typeof arguments[i] === 'object' && arguments[i] ) {
      _options = underscore.extend( _options, arguments[i] )
    }
  }
  if ( _options ) {
    if ( _options.protocol
      || _options.slashes
      || _options.auth
      || _options.port
      || _options.hostname
      || _options.pathname
      ) {
      if ( !_options.protocol ) {
        _options.protocol = 'http:'
      }
      if ( !_options.host && !_options.hostname ) {
        _options.hostname = 'localhost'
      }
      if ( !_options.pathname ) {
        _options.pathname = '/'
      }
    }
  }
  var href
  if ( _string ) {
    href = _string
  } else
  if ( url.format( _options ) !== '' ) {
    href = url.format( _options )
  } else {
    href = 'http://localhost/'
  }
  _info_target( href )

  stream = new Stream.Transform( { objectMode: true } )
  stream._transform = function ( vinyl, encoding, callback ) {
    const FN_NAME = '#main'
    if ( vinyl.event ) {
      log.log( _gulp_prefix( FN_NAME + '$vinyl.event' ), vinyl.event )
    } else {
      vinyl.event = null
    }
    var target_uri
    var target_stem
    try {
      log.log( _gulp_prefix( FN_NAME + '$href' ), href )
      target_uri = _splice_target(
          vinyl.path
        , path.resolve( _options.parent )
        , href
      )
      target_stem = _splice_target_stem(
          vinyl.path
        , path.resolve( _options.parent )
        , href
      )
    } catch ( error ) {
      _on_error( error )
      callback( null, vinyl )
      return
    }
    init()

    function init() {
      const FN_NAME = '#main#init'
      if ( target_uri === href ) {
        callback()
        return
      }
      log.log( _gulp_prefix( FN_NAME + '$target_uri' ), target_uri )
      _info_path( target_stem )
      if ( vinyl.event === 'unlink' ) {
        _delete( target_uri, resume )
        return
      }
      if ( _options.clean ) {
        _delete( target_uri, resume )
        return
      }
      if ( vinyl.isBuffer() ) {
        _put( target_uri, vinyl, resume )
        return
      }
      if ( vinyl.isNull() ) {
        _mkcol( target_uri, resume )
        return
      }
      if ( vinyl.isStream() ) {
        _put( target_uri, vinyl, resume )
        return
      }
      callback( null, vinyl )
    }

    function resume( res ) {
      if ( res ) {
        _info_status( res.statusCode )
      }
      callback()
    }

  }
  stream.watch = function ( glob_watcher, cb ) {
    const FN_NAME = '#watch'
    if ( typeof glob_watcher !== 'object'
         || !glob_watcher.type
         || !glob_watcher.path
       ) {
      throw new gutil.PluginError( PLUGIN_NAME, 'expected glob-watcher object' )
    }
    log.log( _gulp_prefix( FN_NAME + '$arguments[0].path' ), glob_watcher.path )
    if ( glob_watcher.type === 'deleted' ) {
      var target_uri = _splice_target(
            glob_watcher.path
          , path.resolve( _options.parent )
          , href
      )
      var target_stem = _splice_target_stem(
            glob_watcher.path
          , path.resolve( _options.parent )
          , href
      )
      _info_path( target_stem )
      _delete( target_uri, function ( res ) {
        _info_status( res.statusCode )
        if ( cb && typeof cb === 'function' ) {
          cb()
        }
      } )
    } else {
      if ( cb && typeof cb === 'function' ) {
        cb()
      }
    }
  }
  stream.clean = function ( cb ) {
    const FN_NAME = '#main#clean'
    var target_uri = href
    _options = underscore.extend( _options, { 'headers': { 'Depth': 1 } } )
    _propfind( target_uri, function ( dom ) {
      var urls = _xml_to_url_a( dom )
      urls = urls.map(
        function ( e ) {
          return url.resolve( target_uri, e )
        }
      ).filter(
        function ( e ) {
          return e !== target_uri
        }
      )
      function d( urls ) {
        if ( urls.length > 0 ) {
          _delete( urls.pop()
            , function ( res ) {
                _info_status( res.statusCode )
                d( urls )
              }
          )
        } else {
          if ( cb ) {
            cb()
          }
        }
      }
      d( urls )
    } )
  }
  return stream
}

function _colorcode_statusCode_fn( statusCode ) {
  switch ( statusCode ) {
    case 102:
      return chalk.bgYellow.white
    case 200:
    case 201:
    case 204:
      return chalk.bgGreen.white
    case 207:
      return chalk.bgWhite.black
    case 403:
    case 404:
    case 409:
    case 412:
    case 415:
    case 422:
    case 423:
    case 424:
    case 500:
    case 502:
    case 507:
      return chalk.bgRed.white
    default:
      return chalk.bgWhite.black
  }
}

function _colorcode_statusMessage_fn( statusMessage ) {
  switch ( statusMessage ) {
    case 102:
      return chalk.yellow
    case 200:
    case 201:
    case 204:
      return chalk.green
    case 207:
      return chalk.white
    case 403:
    case 404:
    case 409:
    case 412:
    case 415:
    case 422:
    case 423:
    case 424:
    case 500:
    case 502:
    case 507:
      return chalk.red
    default:
      return chalk.white
  }
}

function _delete( uri, callback ) {
  const FN_NAME = '#_delete'
  var options, req
  options = underscore.extend(
      _options
    , url.parse( uri )
    , { method: 'DELETE' }
  )
  req = http.request( options, callback )
  req.on( 'error', _on_error )
  req.end()
}

function _get( uri, vinyl, callback ) {
}

function _gulp_prefix() {
  var name = '[' + chalk.grey( PLUGIN_NAME ) + ']'
  var item = ''
  for ( var i = 0 ; i < arguments.length ; i++ ) {
    item += chalk.grey( arguments[i] )
  }
  return [ name, item ].join( ' ' )
}

function _info_path( string ) {
  var out = chalk.underline( string )
  log.info( _gulp_prefix(), out )
}

function _info_status( statusCode ) {
  var code =
    _colorcode_statusCode_fn( statusCode )
      .call( this, statusCode )
  var msg =
    _colorcode_statusMessage_fn( statusCode )
      .call( this, http.STATUS_CODES[statusCode] )
  log.info( '  ', code, msg )
}

function _info_target( uri ) {
  if ( _options.logAuth !== true ) {
    uri = _strip_url_auth( uri )
  }
  var to = chalk.underline.cyan( uri )
  log.info( _gulp_prefix(), to )
}

var log = ( function () {
  var methods = [ 'error', 'warn', 'info', 'log' ]
  var _log = {}
  methods.forEach( function ( element, index, array ) {
    _log[element] = function () {
      if ( index <= methods.indexOf( _options.log ) ) {
        console[element].apply( this, arguments )
      }
    }
  } )
  return _log
} )()

function _mkcol( uri, callback ) {
  var options, req
  options = underscore.extend(
      _options
    , url.parse( uri )
    , { method: 'MKCOL' }
  )
  req = http.request( options, callback )
  req.on( 'error', _on_error )
  req.end()
}

function _on_error( error ) {
  stream.emit( 'error', error )
}

function _propfind( uri, callback ) {
  var options, req
  options = underscore.extend(
      _options
    , url.parse( uri )
    , { method: 'PROPFIND' }
  )
  req = http.request( options, function ( res ) {
    var body = ''
    res.on( 'data', function ( chunk ) {
      body += chunk
    } )
    res.on( 'end', function () {
      var opt = {
        tagNameProcessors: [ xml2js.processors.stripPrefix ]
      }
      xml2js.parseString( body, opt, function ( err, result ) {
        if ( err ) {
          _on_error( err )
        }
        callback( result )
      } )
    } )
  } )
  req.on( 'error', _on_error )
  req.end()
}

function _proppatch( uri, props, callback ) {
}

function _put( uri, vinyl, callback ) {
  var options, req
  options = underscore.extend(
      _options
    , url.parse( uri )
    , { method: 'PUT' }
  )
  req = http.request( options, callback )
  vinyl.pipe( req )
  req.on( 'error', _on_error )
}

function _splice_target( vinyl_path, parent_dir, href ) {
  const FN_NAME = '#_splice_target'
  var error
  var target_stem = ''
  log.log( _gulp_prefix( FN_NAME + '$vinyl_path' ), vinyl_path )
  log.log( _gulp_prefix( FN_NAME + '$parent_dir' ), parent_dir )
  if ( vinyl_path.length < parent_dir.length ) {
    error = new gutil.PluginError(
        PLUGIN_NAME
      , 'Incoherent Target: options.parent too long.\n'
      + '\tpath is ' + chalk.red( vinyl_path ) + '\n'
      + '\tparent is ' + chalk.red( parent_dir ) + '\n'
    )
    error.vinyl_path = vinyl_path
    error.parent = parent_dir
    throw error
  }
  target_stem = _splice_target_stem( vinyl_path, parent_dir, href )
  if ( !href ) {
    href = ''
  }
  return href + target_stem
}

function _splice_target_stem( vinyl_path, parent_dir, href ) {
  const FN_NAME = '#_splice_target_stem'
  var error
  var target_stem
  if ( vinyl_path.substr( 0, parent_dir.length ) === parent_dir ) {
    target_stem = vinyl_path.substr( parent_dir.length+1 )
  } else {
    error = new gutil.PluginError(
        PLUGIN_NAME
      , 'Incoherent Target: paths diverge.\n'
      + '\tpath is ' + chalk.red( vinyl_path ) + '\n'
      + '\tparent is ' + chalk.red( parent_dir ) + '\n'
    )
    error.vinyl_path = vinyl_path
    error.parent = parent_dir
    throw error
  }
  return target_stem
}

function _strip_url_auth( href ) {
  var strip = url.parse( href )
  strip.auth = null
  return strip.format()
}

function _xml_to_url_a( dom ) {
  var a = []
  try {
    dom.multistatus.response.forEach( function ( e ) {
      a.push( e.href[0] )
    } )
  } catch ( e ) {
    throw e
  }
  return a
}
