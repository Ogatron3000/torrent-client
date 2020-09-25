'use strict'
const fs = require('fs')
const bencode = require('bencode')

// we read the file and get buffer which maps to bencode
// we then parse that buffer and get object with buffers and ints
// we can add utf8 to parse those buffers to strings
module.exports.open = (filepath) => {
    return bencode.decode(fs.readFileSync(filepath))
}

const crypto = require('crypto')

// hashed value of info about torrent's files
module.exports.infoHash = (torrent) => {
    const info  = bencode.encode(torrent.info)
    // sha1 hashing function is used by bittorrent
    return crypto.createHash('sha1').update(info).digest() // buffer
}

const BN = require('bn.js')

// torrent can have one or multiple files
module.exports.size = (torrent) => {
    const size = torrent.info.files ? 
        torrent.info.files.map(file => file.length).reduce((a, b) => a + b) :
        torrent.info.length

    // size may be larger than 32-bit int, so we use bn.js package
    // write size to an 8-byte buffer
    return new BN(size).toBuffer('be', 8)
}

// block size is 2^14 (16384) bytes
module.exports.BLOCK_LENGTH = Math.pow(2, 14)

// is it 2^14 or less (last piece)
module.exports.pieceLength = (torrent, pieceIndex) => {
    const totalLength = new BN(this.size(torrent)).toNumber()
    const pieceLength = torrent.info['piece length']

    const lastPieceLength = totalLength % pieceLength
    const lastPieceIndex = Math.floor(totalLength / pieceLength)

    return pieceIndex === lastPieceIndex ? lastPieceLength : pieceLength
}

module.exports.blocksPerPiece = (torrent, pieceIndex) => {
    const pieceLength = this.pieceLength(torrent, pieceIndex)
    return Math.ceil(pieceLength / this.BLOCK_LENGTH)
}

module.exports.blockLength = (torrent, pieceIndex, blockIndex) => {
    const pieceLength = this.pieceLength(torrent, pieceIndex)

    const lastBlockLength = pieceLength % this.BLOCK_LENGTH
    const lastBlockIndex = Math.floor(pieceLength / this.BLOCK_LENGTH)

    return blockIndex === lastBlockIndex ? lastBlockLength : this.BLOCK_LENGTH
}