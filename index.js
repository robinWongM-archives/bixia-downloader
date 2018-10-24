(async function() {
    const nconf = require('nconf')
    nconf.argv().env().file({ file: './config.json' })

    const winston = require('winston')
    const appLogger = winston.createLogger({
        transports: [
            new winston.transports.Console()
            // Output to file will be handled by PM2
        ]
    })

    const Room = require('./libs/room.js')
    const helper = require('./libs/helper.js')

    let __ROOMS = [] // In-memory Store
    console.log(helper.getWrapConfig(nconf, 'uniqueToken'))
    
    const io = require('socket.io-client')
    const socket = io('http://localhost:7001/downloader', {
        query: {
            downloaderAuthToken: 'PLEASE CHANGE TO YOUR OWN & MATCH THE DOWNLOADER CONFIG',
            ...helper.getWrapConfig(nconf, 'uniqueToken')
        },
        transports: ['websocket']
    })

    // We only use it to preserve data when API server is offline
    const models = require('./models')

    let [ uniqueToken, roomList ] = await helper.promisify(socket.once, socket)('handshake')
    helper.setWrapConfig(nconf, 'uniqueToken', uniqueToken)

    // Deal with roomList
    roomList.forEach(roomID => {
        console.log(roomList)
        addRoom(roomID, () => {})
    })

    async function sendWithTimeout(roomID, event, content, time) {
        const emitAsync = helper.promisify(socket.emit, socket)
        try {
            await emitAsync(event, {
                room_id: roomID,
                data: content
            })
        } catch (err) {
            if(err.message == 'Timeout') {
                // Store to DB
                await model.CachedMessage.create({
                    room_id: roomID,
                    type: event,
                    data: content,
                    time: time
                })
            }
        }
    }

    function addRoom(id, fn) {
        if(__ROOMS.map(room => { return room._roomID }).includes(id))
            return

        appLogger.info('new room event received: ', id)
        try {
            const room = new Room(id, nconf.get('downloadPath'))
            
            room.on('downloadStarted', (filename, startTime) => {
                sendWithTimeout(room._roomID, 'downloadStarted', { filename }, startTime)
            })

            room.on('downloadRetrying', () => {
                // no interest for me
            })

            room.on('downloadSaved', download => {
                sendWithTimeout(room._roomID, 'downloadSaved', download, Date.now())
            })

            room.on('activity', (type, data) => {
                switch (type) {
                    case 'LIVE':
                    case 'PREPARING':
                        sendWithTimeout(room._roomID, 'liveStatus', type, Date.now())
                        break
                    case 'danmu':
                        sendWithTimeout(room._roomID, 'danmu', data, Date.now())
                        break
                    default:
                        break
                }
            })

            __ROOMS.push(room)
            room.start()
            fn(0)
        } catch (err) {
            fn(-1, err)
        }
    }

    socket.on('add room', addRoom)

    socket.on('list room', fn => {
        fn(__ROOMS.map(room => { return room._roomID }))
    })

    setInterval(() => {
        // Report Download Speed
        let packet = []
        __ROOMS.forEach(room => {
            if(room.speed() !== null) {
                packet.push({
                    room_id: room._roomID,
                    data: room.speed()
                })
            }
        })
        if(packet.length)
            socket.emit('speed', packet) // We don't care
    }, 1000)

})()