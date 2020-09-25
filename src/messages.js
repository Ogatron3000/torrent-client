'use strict'

const Buffer = require('buffer').Buffer
const torrentParser = require('./torrent-parser')
const util = require('./util')

module.exports.buildHandshake = torrent => {
    const buffer = Buffer.alloc(68)

    // pstrlen - protocol string length
    buffer.writeUInt8(19, 0)
    // pstr - protocol string
    buffer.write('BitTorrent protocol', 1)
    // reserved
    buffer.writeUInt32BE(0, 20)
    buffer.writeUInt32BE(0, 24)
    // info hash
    torrentParser.infoHash(torrent).copy(buffer, 28)
    // peer id
    util.generateId().copy(buffer, 48) // or write(generateId()), since it's the only thing left
    
    return buffer
}

module.exports.buildKeepAlive = () => Buffer.alloc(4)

module.exports.buildChoke = () => {
    const buffer = Buffer.alloc(5)

    // length
    buffer.writeUInt32BE(1, 0)
    // id is 0 so we don't need to write anything

    return buffer
}

module.exports.buildUnchoke = () => {
    const buffer = Buffer.alloc(5)

    // length
    buffer.writeUInt32BE(1, 0)
    // id
    buffer.writeUInt8(1, 4)

    return buffer
}

module.exports.buildInterested = () => {
    const buffer = Buffer.alloc(5)

    // length
    buffer.writeUInt32BE(1, 0)
    // id
    buffer.writeUInt8(2, 4)

    return buffer
}

module.exports.buildUninterested = () => {
    const buffer = Buffer.alloc(5)

    // length
    buffer.writeUInt32BE(1, 0)
    // id
    buffer.writeUInt8(3, 4)

    return buffer
}

module.exports.buildHave = (payload) => {
    const buffer = Buffer.alloc(9)

    // length
    buffer.writeUInt32BE(5, 0)
    // id
    buffer.writeUInt8(4, 4)
    // piece index
    buffer.writeUInt32BE(payload, 5)

    return buffer
}

module.exports.buildBitfield = bitfield => {
    const buffer = Buffer.alloc(bitfield.length + 5)

    // length
    buffer.writeInt32BE(bitfield.length + 1, 0)
    // id
    buffer.writeUInt8(5, 4)
    // bitfield
    bitfield.copy(buffer, 5)

    return buffer
}

module.exports.buildRequest = payload => {
    const buffer = Buffer.alloc(17)

    // length
    buffer.writeUInt32BE(13, 0)
    // id
    buffer.writeUInt8(6, 4)
    // index
    buffer.writeUInt32BE(payload.index, 5)
    // begin
    buffer.writeUInt32BE(payload.begin, 9)
    // length
    buffer.writeUInt32BE(payload.length, 13)

    return buffer
}

module.exports.buildPiece = payload => {
    const buffer = Buffer.alloc(payload.block.length + 13)

    // length
    buffer.writeUInt32BE(payload.block.length + 13 - 4, 0)
    // id
    buffer.writeUInt8(7, 4)
    // index
    buffer.writeUInt32BE(payload.index, 5)
    // begin
    buffer.writeUInt32BE(payload.begin, 9)
    // block
    buffer.writeUInt32BE(payload.length, 13)

    return buffer
}

module.exports.buildCancel = payload => {
    const buffer = Buffer.alloc(17)

    // length
    buffer.writeUInt32BE(13, 0)
    // id
    buffer.writeUInt8(8, 4)
    // index
    buffer.writeUInt32BE(payload.index, 5)
    // begin
    buffer.writeUInt32BE(payload.begin, 9)
    // length
    buffer.writeUInt32BE(payload.length, 13)

    return buffer
}

module.exports.buildPort = payload => {
    const buffer = Buffer.alloc(7)

    // length
    buffer.writeUInt32BE(3, 0)
    // id
    buffer.writeUInt8(9, 4)
    // port
    buffer.writeUInt16BE(payload, 5)

    return buffer
}

module.exports.parse = message => {
    // if length is not > 4 we know it's keep-alive message
    const id = message.length > 4 ? message.readInt8(4) : null
    // if length is not > 5 we know there is no payload
    let payload = message.length > 5 ? message.slice(5) : null
    
    if (id === 6 || id === 7 || id === 8) {
        const rest = payload.slice(8)
        payload = {
            index: payload.readUInt32BE(0),
            begin: payload.readUInt32BE(4)
        }
        payload[id === 7 ? 'block' : 'length'] = rest
    }

    return {
        size: message.readUInt32BE(0),
        id,
        payload
    }
}