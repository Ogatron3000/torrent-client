'use strict'

const torrentParser = require('./src/torrent-parser')
const download = require('./src/download')

const torrent = torrentParser.open(process.argv[2] + '.torrent')

download(torrent, torrent.info.name)