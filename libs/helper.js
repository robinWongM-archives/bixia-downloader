const got = require('got')

module.exports = {
    promisify(func, receiver) {
        return (...args) => {
            return new Promise((resolve, reject) => {
                let timerID = setTimeout(() => {
                    reject('Timeout')
                }, 5000)
                func.apply(receiver, [...args, (...cbData) => {
                    clearTimeout(timerID)
                    resolve(cbData)
                }])
            })
        }
    },

    getWrapConfig(nconf, name) {
        const value = nconf.get(name)
        return value ? { [name]: value } : {}
    },

    async setWrapConfig(nconf, name, value) {
        nconf.set(name, value)
        await this.promisify(nconf.save, nconf)()
    },

        // https://stackoverflow.com/a/38750895
    filterObject(instance, fields) {
        return Object.keys(instance)
                .filter(key => fields.includes(key))
                .reduce((obj, key) => {
                    return {
                        ...obj,
                        [key]: instance[key]
                    }
                }, {})
    },

    async oopsGot(errMsg, ...args) {
        try {
            return await got(...args)
        } catch (err) {
            throw new Error(''.concat(errMsg).concat(': ').concat(err))
        }
    }
}