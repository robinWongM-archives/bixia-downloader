(async function() {
    const Room = require('./libs/room.js')
    const got = require('got')
    const Table = require('cli-table2')
    const logUpdate = require('log-update')
    const prettyBytes = require('pretty-bytes')

    // 1. Ftech current hottest rooms
    const { data: roomList } = (await got('https://api.live.bilibili.com/room/v1/Area/getListByAreaID?areaId=0&sort=online&pageSize=20&page=1', {
        json: true,
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134',
            'origin': 'https://live.bilibili.com',
            'referer': 'https://live.bilibili.com/all'
        }
    })).body
    
    /* { "code": 0, "data": [{
        "uid": 183430,
        "roomid": 5096,
        "title": "xxxxxxxx",
        "cover": "https://i0.hdslb.com/bfs/live/e64902520ab6e0aaeb6e2d1b721cccbf241045d3.jpg",
        "user_cover": "https://i0.hdslb.com/bfs/live/e64902520ab6e0aaeb6e2d1b721cccbf241045d3.jpg",
        "pic": "https://i0.hdslb.com/bfs/live/e64902520ab6e0aaeb6e2d1b721cccbf241045d3.jpg",
        "system_cover": "https://i0.hdslb.com/bfs/live/5096.jpg?10261441",
        "stream_id": 594,
        "uname": "xxxxxxxx",
        "face": "https://i0.hdslb.com/bfs/face/4a91427ef035836b1937244bc559ed03f244bfa9.jpg",
        "online": 215003,
        "areaName": "xxxxxx",
        "area": 1,
        "area_v2_id": 80,
        "area_v2_name": "xxxxx",
        "area_v2_parent_id": 2,
        "area_v2_parent_name": "xxxxx",
        "short_id": 388,
        "link": "/388",
        "is_tv": 0,
        "is_bn": ""
        }]
    } */

    const _ROOMS = []
    const _DOWNLOADSTAT = []
    const _ROOMSTAT = []
    const _DANMUSTAT = []

    function addRoom(hotRoom) {
        const room = new Room(hotRoom.roomid, 'bandwidthTestDir')

        room.on('downloadStarted', (filename, startTime) => {
            _DOWNLOADSTAT[room._roomID] = '下载开始'
        })

        room.on('downloadRetrying', () => {
            _DOWNLOADSTAT[room._roomID] = '下载重试中'
        })

        room.on('downloadSaved', download => {
            _DOWNLOADSTAT[room._roomID] = '下载结束'
        })

        room.on('activity', (type, data) => {
            switch (type) {
                case 'LIVE':
                    _ROOMSTAT[room._roomID] = '直播中'
                    break
                case 'PREPARING':
                    _ROOMSTAT[room.roomID] = '准备中'
                    break
                case 'danmu':
                    _DANMUSTAT[room.roomID]++
                    break
                default:
                    break
            }
        })

        _ROOMS.push(room)
        _DANMUSTAT[room._roomID] = 0
        room.start()
    }

    for (let i = 0; i < roomList.length; i++) {
        setTimeout(() => {
            addRoom(roomList[i])
        }, i * 1000 + 1000)
    }

    // 2. Cron job - Fetch the latest information of each room

    setInterval(() => {
        const table = new Table({
            head: ['Room ID', 'Room Status', 'Download Status', 'Download Speed', 'PlayURL', 'Danmaku'],
            colWidths: [10, 10, 10, 12, 20, 10]
        })

        _ROOMS.forEach(room => {
            table.push([room._roomID,
                        _ROOMSTAT[room._roomID],
                        _DOWNLOADSTAT[room._roomID],
                        prettyBytes(room.speed() ? room.speed() : 0) + '/s',
                        room._downloader ? room._downloader._playURL : "",
                        _DANMUSTAT[room._roomID]])
        })

        logUpdate(table.toString())
    }, 500)
})()