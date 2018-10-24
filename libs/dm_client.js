const { EventEmitter } = require('events'),
      xmlParser = require('fast-xml-parser'),
      ws = require('ws')

const helper = require('./helper.js')

class DMClient extends EventEmitter {
    constructor(roomID) {
        /*
            Events

            - activity: 
                type: LIVE/PREPARING/ROUND: additional param indicates if it's initial state
                      danmu: additional param contains danmu info
                      attention: additional param contains the attention value
                      other

            - connected
            - retrying
            - heartbeat

        */
        super()

        this._roomID = roomID
        this._ws = undefined

        this._isConnected = false
        this._heartBeatInterval = undefined
    }

    async start() {
        //
        const dmInfoRes = (await helper.oopsGot(
            '获取弹幕服务器时发生错误',
            'https://live.bilibili.com/api/player?id=cid:' + this._roomID
        )).body
        const { state, dm_server, dm_wss_port } = xmlParser.parse(dmInfoRes)
        // TODO Live status!
        this.emit('activity', state, true)
        this._ws = new ws('wss://' + dm_server + ':' + dm_wss_port + '/sub')
        this._ws.on('open', () => {
            // Auth
            this.sendPacket(7/*_AUTH_*/, {
                uid: 0,
                roomid: this._roomID,
                protover: 1,
                platform: 'web',
                clientver: '1.4.0'
            })
        })
        this._ws.on('message', data => {
            this._messageHandler(data)
        })
        this._ws.on('error', err => {
            console.error(err)
        })
        this._ws.on('close', (code, reason) => {
            if(this._isConnected) {
                this.emit('retrying')
                // Unfortunately closed, Self-kill and Recreate 
                this.destroy()
                setTimeout(() => {
                    this.start()
                }, 200)
            }
        })
    }

    sendPacket(type, content) {
        // type can be 2(heartbeat) 3(attention) 5(cmd) 7(auth) 8(serverHeart)
        content = JSON.stringify(content)
        
        let header = Buffer.alloc(16)
        let contentBuf = Buffer.from(content)
        //console.log(content)
        header.writeIntBE(16 + contentBuf.length, 0, 4) // Packet length
        header.writeIntBE(16, 4, 2) // Header length
        header.writeIntBE(1, 6, 2) // protocol version
        header.writeIntBE(type, 8, 4) // operation code
        header.writeIntBE(1, 12, 4) // sequence(may be const 1)

        try {
            this._ws.send(Buffer.concat([header, contentBuf]))
        } catch (err) {
            // When the connection lost, there'll be an error
            // Simply ignore it and waiting to reconnect
        }
    }

    parse(data) {
        let offset = 0, packets = []
        if(data.length < 16 || data.readIntBE(4, 2) != 16) {
            // not recognize
            this.emit('msgError', data)
            return packets
        } else {
            while(offset + 16 <= data.length) {
                let size = data.readIntBE(offset, 4)
                let opCode = data.readIntBE(offset + 8, 4)
                switch (opCode) {
                    case 3:
                        packets.push({
                            type: 3,
                            content: data.readIntBE(offset + 16, 4)
                        })
                        break
                    case 5:
                        packets.push({
                            type: 5,
                            content: JSON.parse(data.toString('utf8', offset + 16, offset + size))
                        })
                        break
                    case 8:
                        packets.push({
                            type: 8,
                            content: null
                        })
                        break
                    default:
                        this.emit('msgError', data.toString('utf-8', offset + 16, offset + size))
                }
                offset += size
            }
        }
        return packets
    }

    _messageHandler(data) {
        let packets = this.parse(data)
        if(packets) {
            for (let i = 0; i < packets.length; i++) {
                const packet = packets[i]
                const { type, content } = packet

                if(type == 8 && !this._isConnected) {
                    // We're now connected. Set up heartbeat
                    this.emit('connected')
                    this._isConnected = true
                    this.heartBeatInterval = setInterval(() => {
                        this.sendPacket(2, {})
                        this.emit('heartbeat')
                    }, 25000) // protocol require 30s
                } else if(type == 3) {
                    this.emit('activity', 'attention', content)
                } else if(type == 5) {
                    // CMD Fun!
                    switch (content.cmd) {
                        case 'DANMU_MSG':
                            this.emit('activity', 'danmu', content.info)
                            break
                        case 'LIVE':
                            this.emit('activity', 'LIVE')
                            break
                        case 'PREPARING':
                            this.emit('activity', 'PREPARING')
                            break
                        default:
                            this.emit('activity', 'other', content)
                            break
                    }
                } else {
                    // 不管啦
                }   
            }
        }
    }

    destroy() {
        if(this._heartBeatInterval) {
            clearInterval(this._heartBeatInterval)
            this._heartBeatInterval = undefined
        }
        if(this._isConnected) {
            this._isConnected = false
            if(this._ws.readyState == 'OPEN')
                this._ws.close()
        }
    }
}

module.exports = DMClient