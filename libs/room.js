const { EventEmitter } = require('events'),
      got = require('got')

const winston = require('winston')
const roomLogger = winston.createLogger({
    transports: [
        new winston.transports.Console()
        // Output to file will be handled by PM2
    ]
})

const DMClient = require('./dm_client.js'),
      Downloader = require('./downloader.js')
      helper = require('./helper.js')

class Room extends EventEmitter {
    constructor(roomID, path) {
        super()

        this._roomID = roomID
        this._shortID = 0
        this._uid = 0

        // Cache the status
        this._status = undefined

        this._dmClient = undefined
        this._downloader = undefined
    
        this._path = path
    
        this._infoInterval = undefined
    }

    start() {
        // 1. Initialize Downloader if not exists
        if(!this._downloader) {
            //console.log('init downloader')
            this._downloader = new Downloader(this._roomID, this._path)
            this._downloader.on('started', (filename, startTime) => {
                // TODO
                this.emit('downloadStarted', filename, startTime)
            })
            this._downloader.on('retrying', () => {
                this.emit('downloadRetrying')
            })
            this._downloader.on('saved', download => {
                // TODO
                this.emit('downloadSaved', download)
                if(this._infoInterval) {
                    clearInterval(this._infoInterval)
                    this._infoInterval = undefined
                }
            })
            this._downloader.on('stopped', () => {
                // TODO
                if(this._infoInterval) {
                    clearInterval(this._infoInterval)
                    this._infoInterval = undefined
                }
            })
        }

        // 2. Start Observing
        this._dmClient = this._dmClient ? this._dmClient : new DMClient(this._roomID)
        //console.log('init dmclient')
        this._dmClient.on('connected', () => {}) /* I don't care */
        this._dmClient.on('retrying', () => {})  /* Me, too */
        this._dmClient.on('heartbeat', () => {}) /* Emmmmm */
        this._dmClient.on('activity', (type, data) => {
            switch (type) {
                case 'LIVE':
                    // Start download!
                    if(!this._downloader._isDownloading)
                        this._downloader.start()
                    
                    if(this._status != 'LIVE') {
                        this._status = 'LIVE'
                        this.emit('activity', 'LIVE', Date.now())
                    }
                    break
                case 'PREPARING':
                case 'ROUND':
                    // They are considered as the same: PREPRARING
                    if(this.status != 'PREPARING') {
                        this._status = 'PREPARING'
                        this.emit('activity', 'PREPARING', Date.now())
                    }
                    break

                case 'danmu':
                    this.emit('activity', 'danmu', data)
                    break

                case 'attention': // Drop it now
                    break

                default:
                    break
            }
        })
        this._dmClient.start()

        // 4. Return RoomInfo
        /* return Object.assign({},
            helper.filterObject(this._roomInfo, [
                'uid', 'room_id', 'short_id', 'description', 'title',
                'area_id', 'parent_area_id',
                'area_name', 'parent_area_name',
                'user_cover', 'keyframe', 'tags'
            ]),
            helper.filterObject(this._userInfo, [
                'uname', 'face'
            ])
        ) */
    }

    speed() {
        if(this._downloader)
            return this._downloader.speed()
        else
            return 0
    }
}

module.exports = Room