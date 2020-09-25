'use strict'

// udp connection - if the data being sent is small enough (less than 512 bytes) we don’t have to worry about 
// receiving only part of the data or receiving data out of order
const dgram = require('dgram')
const Buffer = require('buffer').Buffer
const urlParse = require('url').parse
const crypto = require('crypto')
const torrentParser = require('./torrent-parser')
const util = require('./util')

module.exports.getPeers = (torrent, callback) => {
    const socket = dgram.createSocket('udp4')
    // convert it to string (utf8 is default encoding)
    const url = torrent.announce.toString('utf8')

    // 1. send connect request
    udpSend(socket, buildConnectRequest(), url)

    socket.on('message', response => {
        if (responseType(response) === 'connect') {
            // 2. receive and parse connect response 
            const connectResponse = parseConnectResponse(response)
            // 3. send announce request 
            udpSend(socket, buildAnnounceRequest(connectResponse.connectionId, torrent), url)
        } else if (responseType(response) === 'announce') {
            // 4. parse announce response
            const announceResponse = parseAnnounceResponse(response)
            // 5. pass peers to callback
            callback(announceResponse.peers)
        }
    })
}

// socket.send abstraction function
// provides default callback and parses url
function udpSend(socket, message, rawUrl, callback=()=>{}) {
    const url = urlParse(rawUrl)
    socket.send(message, 0, message.length, url.port, url.hostname, callback)
}

function responseType(response) {
    const action = response.readUInt32BE(0)
    if (action === 0) return 'connect'
    if (action === 1) return 'announce'
}

// connection request message is a buffer with specific formar, more at --> https://www.bittorrent.org/beps/bep_0015.html
function buildConnectRequest() {
    const buffer = Buffer.allocUnsafe(16)

    // connection id
    // we write 64-bit int as combo of two 32-bit ints as node doesnt support precise 64-bit ints
    buffer.writeUInt32BE(0x417, 0)
    buffer.writeUInt32BE(0x27101980, 4)
    // action
    buffer.writeUInt32BE(0, 8)
    // transaction id
    crypto.randomBytes(4).copy(buffer, 12)

    return buffer
}

function parseConnectResponse(response) {
    return {
        action: response.readUInt32BE(0),
        transactionId: response.readUInt32BE(4),
        // 64-bit int can't be read, so it's left as a buffer (used in next function)
        connectionId: response.slice(8),
    }
}

function buildAnnounceRequest(connectionId, torrent, port=6881) {
    const buffer = Buffer.allocUnsafe(98)

    // connection id
    connectionId.copy(buffer, 0)
    // action
    buffer.writeUInt32BE(1, 8)
    // transaction id
    crypto.randomBytes(4).copy(buffer, 12)
    // info hash
    torrentParser.infoHash(torrent).copy(buffer, 16)
    // peer id
    util.generateId().copy(buffer, 36)
    // downloaded
    // 64-bit int is needed, but it's all 0s, so Buffer.alloc(8) is used to create 8-byte buffer with 0s
    Buffer.alloc(8).copy(buffer, 56)
    // left
    // size of torrent file(s)
    torrentParser.size(torrent).copy(buffer, 64)
    // uploaded
    Buffer.alloc(8).copy(buffer, 72)
    // event
    buffer.writeUInt32BE(0, 80)
    // IP adress
    buffer.writeUInt32BE(0, 84)
    // key
    crypto.randomBytes(4).copy(buffer, 88)
    // num want
    // writeInt instead of writeUInt because the number is negative
    buffer.writeInt32BE(-1, 92)
    // port
    // ports for bittorrent should be between 6881 and 6889
    buffer.writeUInt16BE(port, 96)

    return buffer
}

function parseAnnounceResponse(response) {
    function group(iterable, groupSize) {
        let groups = []
        for (let i = 0; i < iterable.length; i += groupSize) {
            groups.push(iterable.slice(i, i + groupSize))
        }
        return groups
    }

    // the number of adresses we get back is 6 * n
    // out of that 6 bytes, first 4 are ip adress and the last 2 are port

    return {
        action: response.readUInt32BE(0),
        transactionId: response.readUInt32BE(4),
        interval: response.readUInt32BE(8),
        leechers: response.readUInt32BE(12),
        seeders: response.readUInt32BE(16),
        peers: group(response.slice(20), 6).map(adress => {
            return {
                ip: adress.slice(0, 4).join('.'), // coerce buffer to string and join
                port: adress.readUInt16BE(4)
            }
        })
    }
}