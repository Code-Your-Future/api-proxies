const fs = require('fs');
const denodeify = require('denodeify');
const writeFile = denodeify(fs.writeFile.bind(fs))
const readFile = denodeify(fs.readFile.bind(fs))
const crypto = require('crypto');
let redis;
if (process.env.REDIS_URL) {
	redis = require('then-redis').createClient(process.env.REDIS_URL)
} else {
	redis = {
		get: () => Promise.resolve(),
		set: () => Promise.resolve()
	}
}
const hash = str => crypto.createHash('md5').update(str).digest('hex');

const _caches = {}
module.exports = (cacheName) => {

	if (process.env.NODE_ENV !== 'production') {
		try {
			fs.mkdirSync(`${process.cwd()}/.cache`)
		} catch (e) {}

		try {
			fs.mkdirSync(`${process.cwd()}/.cache/github-${cacheName}`)
		} catch (e) {}
	} else {
		_caches[cacheName] = {};
	}

	return {
		get (url) {
			const key = hash(url);
			const localGet = process.env.NODE_ENV === 'production' ? Promise.resolve(_caches[cacheName][key]) : readFile(`${process.cwd()}/.cache/github-${cacheName}/${key}`, 'utf8').catch(() => undefined)
			process.env.DEBUG && console.log(`fetching ${url} from local cache`);
			return localGet
				.then(val => {
					if (!val) {
						process.env.DEBUG && console.log(`fetching ${url} from redis cache`);
						return redis.get(`${cacheName}:${key}`)
							.then(val => {
								if (val) {
									process.env.DEBUG && console.log(`retrieved ${url} from redis cache`);
									return this.set(url, val, true)
										.then(() => val);
								}
							})
					}
					process.env.DEBUG && console.log(`retrieved ${url} from local cache`);
					return val
				})
		},
		set (url, val, localOnly) {
			const key = hash(url);
			if (!localOnly) {
				redis.set(`${cacheName}:${key}`, val);
			}
			if (process.env.NODE_ENV === 'production') {
				_caches[cacheName][key] = val;
				return Promise.resolve()
			} else {
				return writeFile(`${process.cwd()}/.cache/github-${cacheName}/${key}`, val)
			}
		}
	};
}